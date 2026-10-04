#!/usr/bin/env bash
set -Eeuo pipefail

main() (
	local helper=${1:-${BASH_SOURCE[0]%/*}/../scripts/preview-console.sh}
	local fixture_dir original_path=$PATH output status expected
	fixture_dir=$(mktemp -d /tmp/preview-console-fixtures.XXXXXXXX)
	trap '[[ -n ${fixture_dir:-} && $fixture_dir == /tmp/preview-console-fixtures.* ]] && rm -rf -- "$fixture_dir"' EXIT
	cat >"$fixture_dir/ip" <<'STUB'
#!/bin/bash
[[ $* == '-br a' ]] || exit 9
[[ ${IP_FAIL:-0} == 0 ]] || exit 2
printf '%s\n' "${IP_DATA:-}"
STUB
	cat >"$fixture_dir/docker" <<'STUB'
#!/bin/bash
[[ $1 == context && $2 == inspect ]] || exit 9
[[ ${DOCKER_FAIL:-0} == 0 ]] || exit 2
printf '%s\n' "${CONTEXT_ENDPOINT:-unix:///var/run/docker.sock}"
STUB
	chmod +x -- "$fixture_dir/ip" "$fixture_dir/docker"
	# shellcheck source=../scripts/preview-console.sh
	source "$helper"
	export PATH=$fixture_dir
	export IP_DATA=$'lo UNKNOWN 127.0.0.1/8 ::1/128\neth0 UP 192.0.2.10/24 192.0.2.11/24 2001:db8::10/64 fe80::10/64\ntun0 UNKNOWN 198.51.100.20/32 192.0.2.10/24\nbr0 UP 172.18.0.1/16\ndown DOWN 203.0.113.99/24\nbad UP 999.1.2.3/24 0.0.0.0/0\neth1 UP 2001:db8::20/64'
	unset DOCKER_HOST DOCKER_CONTEXT
	local -a preview_entries=() preview_listeners=() preview_publications=() preview_internal=() preview_notes=()
	preview_entries=('Website|web|https|0.0.0.0|7081||192.0.2.10' 'Admin|web|https|0.0.0.0|7081|/admin|' 'Website|web|https|0.0.0.0|7081||')
	preview_listeners=('Listening web: 0.0.0.0:80 (container; HTTPS)')
	preview_publications=('Published web: 0.0.0.0:7081 -> 0.0.0.0:80 (active listener)' 'Published web: 0.0.0.0:7082 -> container port 443 (no active listener)')
	preview_internal=('API docs (api): http://api:8000/api/docs (Compose network only)')
	preview_notes=('TLS: temporary self-signed certificate; accept/trust it on each test device.')
	output=$(preview_console_render)
	expected=$'System is ready.\n\nOpen:\nWebsite (web):\nhttps://192.0.2.10:7081\nhttps://192.0.2.11:7081\nhttps://198.51.100.20:7081\nhttps://172.18.0.1:7081\nAdmin (web):\nhttps://192.0.2.10:7081/admin\nhttps://192.0.2.11:7081/admin\nhttps://198.51.100.20:7081/admin\nhttps://172.18.0.1:7081/admin\n\nLocal only (preview host):\nWebsite (web):\nhttps://127.0.0.1:7081\nAdmin (web):\nhttps://127.0.0.1:7081/admin\n\nListeners:\nListening web: 0.0.0.0:80 (container; HTTPS)\n\nPublished:\nPublished web: 0.0.0.0:7081 -> 0.0.0.0:80 (active listener)\nPublished web: 0.0.0.0:7082 -> container port 443 (no active listener)\n\nInternal only:\nAPI docs (api): http://api:8000/api/docs (Compose network only)\n\nNotes:\nTLS: temporary self-signed certificate; accept/trust it on each test device.\nHost addresses enumerated with ip -br a; access from other devices is unverified.'
	[[ $output == "$expected" ]] || {
		printf 'FAIL: wildcard layout\n%s\n' "$output" >&2
		return 1
	}
	preview_listeners=() preview_publications=() preview_internal=() preview_notes=()
	preview_entries=('Website|web|http|192.0.2.10|6080||' 'Website|web|https|192.0.2.10|7443||' 'Website|web|http|192.0.2.10|6080||')
	output=$(preview_console_render)
	[[ $output == $'System is ready.\n\nOpen:\nWebsite (web):\nhttp://192.0.2.10:6080\nhttps://192.0.2.10:7443\n\nNotes:\nAccess from other devices is unverified.' ]]
	preview_notes=('Cross-device access is unverified; verify from your testing device.')
	output=$(preview_console_render)
	[[ $output == *'Cross-device access is unverified; verify from your testing device.' && $output != *'Access from other devices is unverified.'* ]]
	preview_notes=()
	preview_entries=('Website|web|http|0.0.0.0|6080||preview.example.test')
	output=$(preview_console_render)
	[[ $output == *'http://192.0.2.11:6080'* && $output == *'http://preview.example.test:6080'* ]]
	preview_entries=('API|api|http|192.0.2.10|6080|/health|198.51.100.20' 'Website|web|http|127.9.2.1|9999||' 'API docs|api|http|::1|8000|/api/docs|')
	output=$(preview_console_render)
	[[ $output == *$'Open:\nAPI (api):\nhttp://192.0.2.10:6080/health\n\nLocal only (preview host):'* && $output == *'http://127.9.2.1:9999'* && $output == *'http://[::1]:8000/api/docs'* && $output != *'198.51.100.20'* && $output == *$'Notes:\nAccess from other devices is unverified.' ]]
	preview_entries=('Website|web|http|127.0.0.1|9999||')
	output=$(preview_console_render)
	[[ $output != *'Notes:'* && $output != *$'\nOpen:'* ]]
	preview_entries=('Website|web|http|::|7082||preview.example.test')
	output=$(preview_console_render)
	[[ $output == *'http://[2001:db8::10]:7082'* && $output == *'http://[2001:db8::20]:7082'* && $output == *'http://[::1]:7082'* && $output == *'http://preview.example.test:7082'* && $output == *'IPv6 link-local addresses omitted'* && $output != *'http://192.0.2.'* && $output != *'http://[fe80'* && $output != *'http://[::]:'* ]]
	preview_entries=('Website|web|http|0.0.0.0|7081||2001:db8::10')
	output=$(preview_console_render)
	[[ $output == *'http://192.0.2.10:7081'* && $output != *'http://[2001:db8'* ]]
	preview_entries=('Website|web|http|0.0.0.0|7081||')
	export IP_DATA=$'lo UNKNOWN 127.0.0.1/8 ::1/128\ndown DOWN 192.0.2.1/24'
	output=$(preview_console_render)
	[[ $output != *$'\nOpen:'* && $output == *'No non-loopback host address found.'* && $output == *'http://127.0.0.1:7081'* ]]
	export IP_FAIL=1
	status=0
	output=$(preview_console_render 2>&1) || status=$?
	[[ $status -ne 0 && $output == *'Host address discovery failed'* && $output != *'System is ready.'* ]]
	unset IP_FAIL
	PATH=$original_path mv -- "$fixture_dir/ip" "$fixture_dir/ip-disabled"
	status=0
	output=$(preview_console_render 2>&1) || status=$?
	[[ $status -ne 0 && $output == *'install iproute2'* && $output != *'System is ready.'* ]]
	PATH=$original_path mv -- "$fixture_dir/ip-disabled" "$fixture_dir/ip"
	export DOCKER_HOST='ssh://example.invalid'
	status=0
	output=$(preview_console_render 2>&1) || status=$?
	[[ $status -ne 0 && $output == *'publishing Docker daemon is remote'* && $output != *'example.invalid'* && $output != *'System is ready.'* ]]
	unset DOCKER_HOST
	export CONTEXT_ENDPOINT='tcp://example.invalid:2376'
	status=0
	output=$(preview_console_render 2>&1) || status=$?
	[[ $status -ne 0 && $output == *'publishing Docker daemon is remote'* && $output != *'System is ready.'* ]]
	export DOCKER_CONTEXT=local DOCKER_HOST='ssh://ignored.invalid' CONTEXT_ENDPOINT='unix:///var/run/docker.sock'
	output=$(preview_console_render)
	[[ $output == 'System is ready.'* ]]
	unset DOCKER_CONTEXT DOCKER_HOST
	export DOCKER_FAIL=1
	status=0
	output=$(preview_console_render 2>&1) || status=$?
	[[ $status -ne 0 && $output == *'Cannot inspect the Docker context'* && $output != *'System is ready.'* ]]
	unset DOCKER_FAIL
	preview_entries=()
	output=$(preview_console_render)
	[[ $output == 'System is ready.' ]]
	export PATH=$original_path
	printf 'PASS: preview console fixtures (layout, addresses, exposure, dependencies, daemon locality).\n'
)

main "$@"

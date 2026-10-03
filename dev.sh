#!/usr/bin/env bash
# dev.sh - Background HTTPS Web preview through hako; no API/MinIO startup.
# Configuration: root .env (see .env.example). First use: build, then start.
# Stop/down removes only this repo's labeled preview container, retaining data.
set -Eeuo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT
# shellcheck source=scripts/preview-config.sh
source "${REPO_ROOT}/scripts/preview-config.sh"
new_container=''
startup_directory=''

usage() {
	cat >&2 <<'HELP'
Usage: ./preview.sh [start|stop|down|status|build] [--port PORT]

First setup: cp .env.example .env
Prepare:     ./preview.sh build; ./hako npm install
Start:       ./preview.sh (or start); returns after HTTPS readiness
Inspect:     ./preview.sh status (never starts services)
Stop:        ./preview.sh stop (or down); persistent data is retained
--port sets the published host port for start; 0 requests Docker assignment.
Root .env is primary; exported recognized keys override it. Stop then start
for changed settings. HTTPS uses a temporary self-signed certificate for OPFS.
HELP
}

die() {
	printf 'Error: %s\n' "$*" >&2
	exit 1
}

require_command() {
	command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

owned_containers() {
	docker ps -aq --filter "label=hako.repo=$REPO_ROOT" \
		--filter 'label=hako.scope=dev.sh' --filter 'label=hako.service=web'
}

stop_services() {
	local ids
	ids=$(owned_containers) || return
	if [[ -z "$ids" ]]; then
		printf 'Web preview already stopped.\n'
		return
	fi
	local -a containers
	mapfile -t containers <<<"$ids"
	docker stop "${containers[@]}" >/dev/null
	printf 'Web preview stopped; persistent data retained.\n'
}

cleanup_failed_start() {
	if [[ -z "$new_container" && -n "$startup_directory" && -f "$startup_directory/container.id" ]]; then
		IFS= read -r new_container <"$startup_directory/container.id" || [[ -n "$new_container" ]]
	fi
	if [[ -n "$new_container" ]]; then
		docker stop "$new_container" >/dev/null 2>&1 || printf 'Warning: preview cleanup failed; run ./preview.sh stop\n' >&2
	fi
	if [[ -n "$startup_directory" ]]; then
		rm -f -- "$startup_directory/container.id"
		rmdir -- "$startup_directory"
	fi
}

runtime_label() {
	docker inspect --format "{{index .Config.Labels \"$2\"}}" "$1"
}

url_host() {
	local host=$1
	[[ "$host" != *:* || "$host" == \[* ]] || host="[$host]"
	printf '%s' "$host"
}

runtime_health() {
	local container=$1 port mappings mapping host host_port probe_host
	[[ "$(docker inspect --format '{{.State.Running}}' "$container")" == true ]] || return 1
	docker exec "$container" node /app/scripts/preview-health.mjs >/dev/null 2>&1 || return 1
	port=$(runtime_label "$container" luna.preview.port) || return
	mappings=$(docker port "$container" "$port/tcp") || return
	[[ -n "$mappings" ]] || return 1
	while IFS= read -r mapping; do
		host=${mapping%:*}
		host=${host#[}
		host=${host%]}
		host_port=${mapping##*:}
		case "$host" in
		0.0.0.0) probe_host=127.0.0.1 ;;
		::) probe_host=::1 ;;
		*) probe_host=$host ;;
		esac
		curl --silent --show-error --insecure --fail --noproxy '*' --max-time 3 \
			"https://$(url_host "$probe_host"):$host_port/" >/dev/null 2>&1 || return 1
	done <<<"$mappings"
}

print_summary() {
	local container=$1 port listen_host lan mappings mapping host host_port browser_host
	port=$(runtime_label "$container" luna.preview.port)
	listen_host=$(runtime_label "$container" luna.preview.host)
	lan=$(runtime_label "$container" luna.preview.lan)
	mappings=$(docker port "$container" "$port/tcp")
	printf 'System is ready.\nListening web: %s:%s (container; HTTPS)\n' "$listen_host" "$port"
	while IFS= read -r mapping; do
		host=${mapping%:*}
		host=${host#[}
		host=${host%]}
		host_port=${mapping##*:}
		printf 'Published web: %s -> %s:%s\n' "$mapping" "$listen_host" "$port"
		case "$host" in
		0.0.0.0) browser_host=127.0.0.1 ;;
		::) browser_host=::1 ;;
		*) browser_host=$host ;;
		esac
		printf 'Website: https://%s:%s\n' "$(url_host "$browser_host")" "$host_port"
		if [[ "$host" == 0.0.0.0 || "$host" == :: || "$host" == "$lan" ]]; then
			if [[ -n "$lan" ]]; then
				printf 'Host/LAN Website (configured; verify from device): https://%s:%s\n' "$(url_host "$lan")" "$host_port"
			else
				printf 'Host/LAN: use this host\x27s reachable address on port %s; set WEB_LAN_HOST to name it.\n' "$host_port"
			fi
		fi
	done <<<"$mappings"
	printf 'TLS: temporary self-signed certificate; accept/trust it on each test device.\n'
}

status_service() {
	local ids container state
	ids=$(owned_containers) || return
	[[ -n "$ids" ]] || {
		printf 'Web preview stopped.\n'
		return 1
	}
	while IFS= read -r container; do
		state=$(docker inspect --format '{{.State.Status}}' "$container")
		printf 'Web preview: %s\n' "$state"
		runtime_health "$container" || {
			printf 'Web preview health: unavailable/unhealthy.\n' >&2
			return 1
		}
		printf 'Web preview health: healthy.\n'
		print_summary "$container"
	done <<<"$ids"
}

start_service() {
	local ids container deadline name_token
	ids=$(owned_containers) || return
	if [[ -n "$ids" ]]; then
		printf 'Reusing existing Web preview; stop then start to apply configuration changes.\n'
		status_service
		return
	fi
	[[ -x "$REPO_ROOT/node_modules/.bin/vite" ]] || die 'dependencies missing; run ./hako npm install'
	require_command cksum
	name_token=$(printf '%s' "$REPO_ROOT" | cksum)
	name_token=${name_token%% *}
	require_command mktemp
	require_command rm
	require_command rmdir
	startup_directory=$(mktemp -d /tmp/luna-preview-start.XXXXXXXXXX)
	trap cleanup_failed_start EXIT
	trap 'exit 130' INT
	trap 'exit 143' TERM
	container=$(env HAKO_SCOPE=dev.sh HAKO_SERVICE=web HAKO_CONTAINER_NAME="luna-preview-$name_token" HAKO_CID_FILE="$startup_directory/container.id" \
		"$REPO_ROOT/hako" --detach bash /app/scripts/preview-web.sh) || return
	new_container=$container
	deadline=$((SECONDS + PREVIEW_READY_TIMEOUT))
	while ((SECONDS < deadline)); do
		if runtime_health "$container"; then
			print_summary "$container"
			new_container=''
			rm -f -- "$startup_directory/container.id"
			rmdir -- "$startup_directory"
			startup_directory=''
			trap - EXIT INT TERM
			return
		fi
		[[ "$(docker inspect --format '{{.State.Running}}' "$container" 2>/dev/null)" == true ]] || break
		sleep 1
	done
	docker logs --tail 30 "$container" >&2 || printf 'Preview container exited; logs unavailable.\n' >&2
	die 'Web HTTPS readiness failed; check dependencies/configuration and ./preview.sh status'
}

main() {
	local action=start port_override=''
	if [[ $# -gt 0 && "$1" != -* ]]; then
		action=$1
		shift
	fi
	while (($#)); do
		case "$1" in
		--help | -h)
			usage
			return
			;;
		--port)
			[[ $# -ge 2 ]] || die '--port requires a value'
			[[ -n "$2" ]] || die '--port requires a nonempty numeric value'
			port_override=$2
			shift 2
			;;
		--port=*)
			port_override=${1#*=}
			[[ -n "$port_override" ]] || die '--port requires a nonempty numeric value'
			shift
			;;
		*) die 'unknown argument; use --help' ;;
		esac
	done
	case "$action" in start | stop | down | status | build) ;; *) die 'unknown command; use --help' ;; esac
	[[ -z "$port_override" || "$action" == start ]] || die '--port applies only to start'
	require_command docker
	case "$action" in
	stop | down) stop_services ;;
	status)
		require_command curl
		status_service
		;;
	start | build)
		if [[ -v LUNA_PREVIEW_PORT && ! -v WEB_HOST_PORT ]]; then export WEB_HOST_PORT=$LUNA_PREVIEW_PORT; fi
		[[ -z "$port_override" ]] || export WEB_HOST_PORT=$port_override
		load_preview_config "$REPO_ROOT/.env" true
		validate_preview_config
		if [[ "$action" == build ]]; then
			exec "$REPO_ROOT/hako" --build
		fi
		require_command curl
		require_command sleep
		start_service
		;;
	esac
}

main "$@"

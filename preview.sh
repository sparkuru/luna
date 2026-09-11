#!/usr/bin/env bash
set -Eeuo pipefail

readonly SCRIPT_PATH="${BASH_SOURCE[0]}"
readonly SCRIPT_NAME="${SCRIPT_PATH##*/}"
readonly PREVIEW_HOST='0.0.0.0'
readonly PREVIEW_SCHEME='https'
preview_temporary_root=''
preview_temporary_directory=''

resolve_script_dir() {
	local script_dir=${SCRIPT_PATH%/*}
	[[ "$script_dir" == "$SCRIPT_PATH" ]] && script_dir=.
	cd -- "$script_dir"
	pwd
}

SCRIPT_DIR="$(resolve_script_dir)"
readonly SCRIPT_DIR

die() {
	printf 'Error: %s\n' "$*" >&2
	exit 1
}

usage() {
	cat >&2 <<EOF
Usage: $SCRIPT_NAME [--port PORT]

Start the Luna Web preview on ${PREVIEW_HOST}. The default port is 4173.
Set LUNA_PREVIEW_PORT or pass --port to use another port.
The preview uses a temporary self-signed certificate so OPFS works over LAN.
EOF
}

require_command() {
	command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

create_preview_certificate() {
	local certificate_path=$1
	local key_path=$2
	local config_path=$3
	local -a lan_addresses=()
	local -a san_entries=('DNS:localhost' 'IP:127.0.0.1')

	mapfile -t lan_addresses < <(discover_lan_addresses)
	for lan_address in "${lan_addresses[@]}"; do
		case "$lan_address" in
		127.* | ::1 | '') continue ;;
		*[!0-9A-Fa-f:.]*) continue ;;
		*) san_entries+=("IP:${lan_address}") ;;
		esac
	done

	local san_list
	san_list=$(
		IFS=,
		printf '%s' "${san_entries[*]}"
	)
	{
		printf '%s\n' '[req]'
		printf '%s\n' 'distinguished_name = req_distinguished_name'
		printf '%s\n' 'x509_extensions = v3_req'
		printf '%s\n' 'prompt = no'
		printf '%s\n' '[req_distinguished_name]'
		printf '%s\n' 'CN = Luna preview'
		printf '%s\n' '[v3_req]'
		printf 'subjectAltName = %s\n' "$san_list"
	} >"$config_path"
	openssl req \
		-x509 \
		-newkey rsa:2048 \
		-nodes \
		-sha256 \
		-days 7 \
		-keyout "$key_path" \
		-out "$certificate_path" \
		-config "$config_path" \
		-extensions v3_req \
		>/dev/null 2>&1 || die 'failed to create the temporary HTTPS certificate'
}

discover_lan_addresses() {
	node -e '
const os = require("node:os");
for (const addresses of Object.values(os.networkInterfaces())) {
  for (const address of addresses ?? []) {
    if (!address.internal && (address.family === "IPv4" || address.family === "IPv6"))
      console.log(address.address);
  }
}'
}

cleanup_preview_certificate() {
	local temporary_directory=${1:-}
	local expected_prefix="${preview_temporary_root%/}/luna-preview."

	if [[ -n "$temporary_directory" && "$temporary_directory" == "$expected_prefix"* && -d "$temporary_directory" ]]; then
		rm -rf -- "$temporary_directory"
	fi
}

validate_port() {
	local port=$1

	[[ "$port" =~ ^[0-9]+$ ]] || die "port must be a number between 1 and 65535: $port"
	((port >= 1 && port <= 65535)) || die "port must be a number between 1 and 65535: $port"
}

format_url_host() {
	local address=$1

	case "$address" in
	*:*) printf '[%s]' "$address" ;;
	*) printf '%s' "$address" ;;
	esac
}

print_access_info() {
	local port=$1
	local url_host
	local -a lan_addresses=()

	printf 'Luna Web preview: %s://%s:%s\n' "$PREVIEW_SCHEME" "$PREVIEW_HOST" "$port"
	mapfile -t lan_addresses < <(discover_lan_addresses)
	for lan_address in "${lan_addresses[@]}"; do
		case "$lan_address" in
		127.* | ::1 | '') continue ;;
		*)
			url_host=$(format_url_host "$lan_address")
			printf 'LAN access:      %s://%s:%s\n' "$PREVIEW_SCHEME" "$url_host" "$port"
			;;
		esac
	done
	printf 'TLS: self-signed certificate; accept the browser warning once per device.\n'
	printf 'Press Ctrl-C to stop.\n'
}

main() {
	require_command npm
	require_command node

	local preview_port="${LUNA_PREVIEW_PORT:-4173}"
	while (($# > 0)); do
		case "$1" in
		--help | -h)
			usage
			return 0
			;;
		--port)
			(($# >= 2)) || die "--port requires a value"
			preview_port=$2
			shift 2
			;;
		--port=*)
			preview_port=${1#*=}
			shift
			;;
		--)
			shift
			(($# == 0)) || die "unexpected argument: $1"
			;;
		*)
			die "unknown argument: $1"
			;;
		esac
	done

	validate_port "$preview_port"
	cd -- "$SCRIPT_DIR"
	require_command mktemp
	require_command openssl

	preview_temporary_root=${TMPDIR:-/tmp}
	[[ "$preview_temporary_root" == /* ]] || die 'TMPDIR must be an absolute path'
	preview_temporary_directory=$(mktemp -d "${preview_temporary_root%/}/luna-preview.XXXXXXXXXX")
	trap 'cleanup_preview_certificate "${preview_temporary_directory}"' EXIT
	local certificate_path="${preview_temporary_directory}/certificate.pem"
	local key_path="${preview_temporary_directory}/private-key.pem"
	local config_path="${preview_temporary_directory}/openssl.cnf"
	create_preview_certificate "$certificate_path" "$key_path" "$config_path"
	export LUNA_PREVIEW_HTTPS_CERT="$certificate_path"
	export LUNA_PREVIEW_HTTPS_KEY="$key_path"

	print_access_info "$preview_port"
	npm run web -- --host "$PREVIEW_HOST" --port "$preview_port"
}

main "$@"

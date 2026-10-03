#!/usr/bin/env bash
# Container-only Vite startup; temporary certificate disappears with the container.
set -Eeuo pipefail

main() {
	local temporary_dir san='DNS:localhost,IP:127.0.0.1' lan_host=${WEB_LAN_HOST:-}
	command -v openssl >/dev/null || {
		printf 'Error: image lacks openssl; rebuild the dev image\n' >&2
		return 1
	}
	[[ -x /app/node_modules/.bin/vite ]] || {
		printf 'Error: dependencies missing; run ./hako npm install\n' >&2
		return 1
	}
	temporary_dir=$(mktemp -d /tmp/luna-preview.XXXXXXXXXX)
	if [[ -n "$lan_host" ]]; then
		if [[ "$lan_host" =~ ^[0-9.]+$ || "$lan_host" == *:* ]]; then
			san+=",IP:$lan_host"
		else
			san+=",DNS:$lan_host"
		fi
	fi
	openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 7 \
		-keyout "$temporary_dir/private-key.pem" -out "$temporary_dir/certificate.pem" \
		-subj '/CN=Luna preview' -addext "subjectAltName=$san" >/dev/null 2>&1
	export LUNA_PREVIEW_HTTPS_CERT="$temporary_dir/certificate.pem"
	export LUNA_PREVIEW_HTTPS_KEY="$temporary_dir/private-key.pem"
	exec npm run web -- --host "$WEB_CONTAINER_HOST" --port "$WEB_CONTAINER_PORT" --strictPort
}

main "$@"

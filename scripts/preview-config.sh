#!/usr/bin/env bash
# Shared data-only dotenv parser. Never execute dotenv contents or expand variables.

preview_config_error() {
	printf 'Error: %s\n' "$*" >&2
	return 1
}

load_preview_config() {
	local env_path=$1 required=${2:-false} line key value number=0
	local -A seen=()
	if [[ ! -f "$env_path" ]]; then
		[[ "$required" == false ]] && return 0
		preview_config_error 'missing root .env; from the repository run: cp .env.example .env'
		return 1
	fi
	while IFS= read -r line || [[ -n "$line" ]]; do
		number=$((number + 1))
		line=${line%$'\r'}
		[[ "$line" =~ ^[[:space:]]*(#.*)?$ ]] && continue
		if [[ ! "$line" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=[[:space:]]*(.*)$ ]]; then
			preview_config_error "invalid dotenv assignment at line $number (values not shown)"
			return 1
		fi
		key=${BASH_REMATCH[2]}
		value=${BASH_REMATCH[3]}
		case "$key" in
		HAKO_IMAGE | HAKO_BIND_HOST | WEB_HOST_PORT | WEB_CONTAINER_HOST | WEB_CONTAINER_PORT | WEB_LAN_HOST | PREVIEW_READY_TIMEOUT) ;;
		*) continue ;;
		esac
		[[ ! -v "seen[$key]" ]] || {
			preview_config_error "duplicate dotenv key: $key"
			return 1
		}
		seen[$key]=true
		if [[ "$value" == \"* || "$value" == \'* ]]; then
			local quote=${value:0:1} tail
			value=${value:1}
			[[ "$value" == *"$quote"* ]] || {
				preview_config_error "unterminated quote for $key"
				return 1
			}
			tail=${value#*"$quote"}
			[[ "$tail" =~ ^[[:space:]]*(#.*)?$ ]] || {
				preview_config_error "invalid quoted value for $key"
				return 1
			}
			value=${value%%"$quote"*}
		else
			value=${value%%[[:space:]]#*}
			value="${value%"${value##*[![:space:]]}"}"
		fi
		# Exported overrides, including empty values, take precedence over the file.
		if [[ ! -v "$key" ]]; then
			printf -v "$key" '%s' "$value"
			export "${key?}"
		fi
	done <"$env_path"
}

validate_preview_config() {
	local key value
	for key in HAKO_IMAGE HAKO_BIND_HOST WEB_HOST_PORT WEB_CONTAINER_HOST WEB_CONTAINER_PORT PREVIEW_READY_TIMEOUT; do
		[[ -n "${!key:-}" ]] || {
			preview_config_error "missing or empty $key; compare root .env with .env.example"
			return 1
		}
	done
	[[ "$HAKO_IMAGE" =~ ^[A-Za-z0-9][A-Za-z0-9._/:@-]*$ ]] || {
		preview_config_error 'invalid HAKO_IMAGE'
		return 1
	}
	[[ "$HAKO_BIND_HOST" =~ ^[0-9.]+$ || "$HAKO_BIND_HOST" =~ ^\[[0-9a-fA-F:]+\]$ ]] || {
		preview_config_error 'HAKO_BIND_HOST must be an IPv4 address or bracketed IPv6 address'
		return 1
	}
	[[ "$WEB_CONTAINER_HOST" == 0.0.0.0 ]] || {
		preview_config_error 'WEB_CONTAINER_HOST must be 0.0.0.0 for Docker-published Web preview'
		return 1
	}
	for key in WEB_HOST_PORT WEB_CONTAINER_PORT PREVIEW_READY_TIMEOUT; do
		value=${!key}
		[[ "$value" =~ ^[0-9]{1,5}$ ]] || {
			preview_config_error "invalid number for $key"
			return 1
		}
		value=$((10#$value))
		((value <= 65535)) || {
			preview_config_error "out-of-range $key"
			return 1
		}
		[[ "$key" == WEB_HOST_PORT ]] || ((value > 0)) || {
			preview_config_error "$key must be positive"
			return 1
		}
		printf -v "$key" '%s' "$value"
	done
	[[ -z "${WEB_LAN_HOST:-}" || "$WEB_LAN_HOST" =~ ^[A-Za-z0-9][A-Za-z0-9.:-]*$ ]] || {
		preview_config_error 'invalid WEB_LAN_HOST hostname/IP'
		return 1
	}
}

#!/usr/bin/env bash
# Sourced helper; the caller owns strict mode, readiness, and cleanup.

_preview_error() {
	printf 'preview: %s\n' "$*" >&2
	return 1
}

_preview_is_ipv4() {
	local address=$1 octet
	local -a octets=()
	[[ $address =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || return 1
	IFS=. read -r -a octets <<<"$address"
	for octet in "${octets[@]}"; do
		[[ ${#octet} -le 3 ]] && ((10#$octet <= 255)) || return 1
	done
}

_preview_is_ipv6() {
	local address=$1 remainder segment count=0
	local -a segments=()
	[[ $address == *:*:* && $address != *:::* && $address =~ ^[[:xdigit:]:]+$ ]] || return 1
	remainder=${address/::/}
	[[ $remainder != *::* ]] || return 1
	IFS=: read -r -a segments <<<"$address"
	for segment in "${segments[@]}"; do
		[[ ${#segment} -le 4 ]] || return 1
		[[ -z $segment ]] || count=$((count + 1))
	done
	if [[ $address == *::* ]]; then
		((count < 8))
	else
		[[ $address != :* && $address != *: ]] && ((count == 8))
	fi
}

_preview_is_loopback() {
	local prefix=${1%:*} last=${1##*:}
	[[ $1 == 127.* ]] || { [[ $1 == *:* && $last =~ ^0*1$ && ${prefix//:/} =~ ^0*$ ]]; }
}

_preview_local_daemon() {
	local endpoint context=${DOCKER_CONTEXT:-}
	if [[ -z $context && -n ${DOCKER_HOST:-} ]]; then
		endpoint=$DOCKER_HOST
	else
		command -v docker >/dev/null 2>&1 || {
			_preview_error 'docker is required to determine the publishing host.'
			return 1
		}
		local -a command=(docker context inspect)
		[[ -z $context ]] || command+=("$context")
		if ! endpoint=$("${command[@]}" --format '{{.Endpoints.docker.Host}}' 2>/dev/null); then
			_preview_error 'Cannot inspect the Docker context; select a local Docker context before discovering preview host addresses.'
			return 1
		fi
	fi
	[[ $endpoint == unix:///* ]] || {
		_preview_error 'The publishing Docker daemon is remote or unverified. Inspect addresses on that daemon host through an authorized route and explicitly configure host addresses; caller-local ip output cannot be used.'
		return 1
	}
}

preview_prepare_addresses() {
	local bind output state address existing wildcard=false
	local -a fields=()
	preview_host_ipv4=()
	preview_host_ipv6=()
	preview_linklocal_omitted=false
	for bind in "$@"; do
		[[ $bind != 0.0.0.0 && $bind != :: && $bind != '[::]' ]] || wildcard=true
	done
	[[ $wildcard == true ]] || return 0
	_preview_local_daemon || return 1
	command -v ip >/dev/null 2>&1 || {
		_preview_error 'ip is required for wildcard preview publishing; install iproute2 on the publishing host.'
		return 1
	}
	if ! output=$(ip -br a); then
		_preview_error 'Host address discovery failed: ip -br a. Check iproute2 and the publishing host network namespace.'
		return 1
	fi
	while read -r _ state address; do
		[[ $state == UP || $state == UNKNOWN ]] || continue
		read -r -a fields <<<"$address"
		for address in "${fields[@]}"; do
			address=${address%%/*}
			if _preview_is_ipv4 "$address"; then
				[[ $address != 127.* && $address != 0.0.0.0 ]] || continue
				existing=" ${preview_host_ipv4[*]-} "
				[[ $existing == *" $address "* ]] || preview_host_ipv4+=("$address")
			elif _preview_is_ipv6 "$address"; then
				address=${address,,}
				_preview_is_loopback "$address" && continue
				[[ ! ${address//:/} =~ ^0*$ ]] || continue
				if [[ $address =~ ^fe[89ab][[:xdigit:]]: ]]; then
					preview_linklocal_omitted=true
					continue
				fi
				existing=" ${preview_host_ipv6[*]-} "
				[[ $existing == *" $address "* ]] || preview_host_ipv6+=("$address")
			fi
		done
	done <<<"$output"
}

_preview_url() {
	local scheme=$1 host=$2 port=$3 path=$4
	[[ $host != *:* ]] || host="[$host]"
	printf '%s://%s:%s%s' "$scheme" "$host" "$port" "$path"
}

preview_console_render() {
	local record label service scheme bind port path configured key address url section
	local wildcard=false ipv6_wildcard=false candidate_found=false configured_eligible
	local open_candidate=false unverified_note=false note
	local -a binds=() groups=() hosts=() notes=("${preview_notes[@]-}")
	local -A open_urls=() local_urls=() seen=()
	for record in "${preview_entries[@]-}"; do
		[[ -n $record ]] || continue
		IFS='|' read -r label service scheme bind port path configured <<<"$record"
		binds+=("$bind")
	done
	preview_prepare_addresses "${binds[@]}" || return 1
	for record in "${preview_entries[@]-}"; do
		[[ -n $record ]] || continue
		IFS='|' read -r label service scheme bind port path configured <<<"$record"
		bind=${bind#[}
		bind=${bind%]}
		configured=${configured#[}
		configured=${configured%]}
		if ! { [[ -n $label && -n $service && $scheme =~ ^https?$ && $port =~ ^[0-9]{1,5}$ ]] &&
			((10#$port > 0 && 10#$port <= 65535)) && [[ -z $path || $path == /* ]]; }; then
			_preview_error 'Invalid browser entry; provide a label, service, HTTP(S) scheme, host port, and optional absolute route.'
			return 1
		fi
		key="$label ($service)"
		if [[ ! -v seen["$key"] ]]; then
			groups+=("$key")
			seen["$key"]=1
		fi
		hosts=()
		case $bind in
		0.0.0.0)
			wildcard=true
			hosts=("${preview_host_ipv4[@]}")
			((${#hosts[@]} == 0)) || candidate_found=true
			address=127.0.0.1
			;;
		::)
			wildcard=true
			ipv6_wildcard=true
			hosts=("${preview_host_ipv6[@]}")
			((${#hosts[@]} == 0)) || candidate_found=true
			address=::1
			;;
		*)
			if ! _preview_is_ipv4 "$bind" && ! _preview_is_ipv6 "$bind"; then
				_preview_error 'Invalid published host bind; use an inspected IPv4 or IPv6 address.'
				return 1
			fi
			address=$bind
			_preview_is_loopback "$bind" || hosts=("$bind")
			;;
		esac
		if _preview_is_loopback "$address"; then
			url=$(_preview_url "$scheme" "$address" "$port" "$path")
			[[ ${local_urls[$key]-} == *"$url"$'\n'* ]] || local_urls[$key]+="$url"$'\n'
		fi
		if [[ -n $configured && $bind == 0.0.0.0 || -n $configured && $bind == :: ]]; then
			if [[ ! $configured =~ ^[[:alnum:].:-]+$ ]] || [[ $configured == 0.0.0.0 || $configured == :: ]] || _preview_is_loopback "$configured"; then
				_preview_error 'Configured preview host must be a non-loopback address or domain, without credentials, paths, or a port.'
				return 1
			fi
			if [[ $configured == *:* ]]; then
				configured=${configured,,}
				_preview_is_ipv6 "$configured" || {
					_preview_error 'Invalid configured IPv6 host.'
					return 1
				}
				configured_eligible=false
				[[ $bind != :: || $configured =~ ^fe[89ab][[:xdigit:]]: ]] || configured_eligible=true
			elif _preview_is_ipv4 "$configured"; then
				configured_eligible=false
				[[ $bind != 0.0.0.0 ]] || configured_eligible=true
			else
				configured_eligible=true
			fi
			[[ $configured_eligible != true ]] || hosts+=("$configured")
		fi
		for address in "${hosts[@]}"; do
			open_candidate=true
			url=$(_preview_url "$scheme" "$address" "$port" "$path")
			[[ ${open_urls[$key]-} == *"$url"$'\n'* ]] || open_urls[$key]+="$url"$'\n'
		done
	done
	if [[ $wildcard == true ]]; then
		notes+=('Host addresses enumerated with ip -br a; access from other devices is unverified.')
		[[ $candidate_found == true ]] || notes+=('No non-loopback host address found.')
	elif [[ $open_candidate == true ]]; then
		for note in "${notes[@]}"; do
			if [[ ${note,,} == *'access from other devices is unverified'* || ${note,,} == *cross-device*unverified* || ${note,,} == *unverified*cross-device* ]]; then
				unverified_note=true
			fi
		done
		[[ $unverified_note == true ]] || notes+=('Access from other devices is unverified.')
	fi
	[[ $ipv6_wildcard != true || $preview_linklocal_omitted != true ]] || notes+=('IPv6 link-local addresses omitted because client-specific zone identifiers are required.')
	printf 'System is ready.\n'
	for section in Open 'Local only (preview host)'; do
		local printed=false lines
		for key in "${groups[@]}"; do
			if [[ $section == Open ]]; then lines=${open_urls[$key]-}; else lines=${local_urls[$key]-}; fi
			[[ -n $lines ]] || continue
			if [[ $printed == false ]]; then
				printf '\n%s:\n' "$section"
				printed=true
			fi
			printf '%s:\n%s' "$key" "$lines"
		done
	done
	_preview_section Listeners "${preview_listeners[@]-}"
	_preview_section Published "${preview_publications[@]-}"
	_preview_section 'Internal only' "${preview_internal[@]-}"
	_preview_section Notes "${notes[@]}"
}

_preview_section() {
	local title=$1 line printed=false
	shift
	for line in "$@"; do
		[[ -n $line ]] || continue
		if [[ $printed == false ]]; then
			printf '\n%s:\n' "$title"
			printed=true
		fi
		printf '%s\n' "$line"
	done
}

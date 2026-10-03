#!/usr/bin/env bash
# preview.sh - Manage the Web-only HTTPS preview through the shared dev lifecycle.
set -Eeuo pipefail

main() {
	local repo_root
	repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
	exec "${repo_root}/dev.sh" "$@"
}

main "$@"

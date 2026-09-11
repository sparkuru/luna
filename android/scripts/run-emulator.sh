#!/bin/sh
set -eu

main() {
	acceleration=${LUNA_EMULATOR_ACCEL:-on}
	case "$acceleration" in
	on | off) ;;
	*)
		printf 'LUNA_EMULATOR_ACCEL must be on or off.\n' >&2
		exit 2
		;;
	esac
	# This ADB server is exposed only through the Compose loopback binding.
	adb -a -P 5037 nodaemon server &
	exec /opt/android-sdk/emulator/emulator -avd luna-smoke \
		-no-window -no-audio -no-snapshot -no-boot-anim -no-metrics \
		-gpu swiftshader -feature -Vulkan -accel "$acceleration" -memory 2048 -cores 2
}

main "$@"

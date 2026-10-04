# A04 detail focus decision, 2026-10-04

The physical PLR110 on Android 16 / WebView 143 closes transaction detail on
native BACK but leaves DOM focus on BODY after a five-second eventual check.
The existing category and filter closures restore their opener. The detail
closure schedules focus before Radix has removed its FocusScope, while its
close-autofocus callback only prevents the default operation.

The authorized correction moves the existing opener restoration to the
close-autofocus callback and schedules it after the scope teardown. Preserve
the current fallback for a deleted opener, and do not steal focus when detail
transitions into the transaction editor.

UI/UX Pro Max was loaded completely and searched before implementation with
`offline-first personal finance privacy ledger accessible keyboard modal focus
return --design-system --format markdown`, then `modal keyboard focus return
dialog close --domain ux -n 3`. Selected recommendations are predictable
keyboard order, visible focus and a working modal escape path. Existing Luna
tokens, system fonts, markup, spacing and motion remain the approved design.
The recommendation's unrelated landing-page pattern, remote font and color
scheme are not adopted. This is React Web/Capacitor, not React Native.

Classification: visual presentation existing-equivalent; keyboard behavior
requires focused regression on desktop and narrow viewport, followed by a
newly built installed APK check. Verify native BACK and visible close restore
the transaction opener without scrolling; verify editing still focuses its
editor. TalkBack acceptance was explicitly cancelled by the user. No spoken
service is enabled for this correction.

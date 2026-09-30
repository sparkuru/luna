## Design System: Luna

### Pattern
- **Name:** Newsletter / Content First
- **Conversion Focus:** Single field form (Email only). Show 'Join X, 000 readers'. Read sample link.
- **CTA Placement:** Hero inline form + Sticky header form
- **Color Strategy:** Minimalist. Paper-like background. Text focus. Accent color for Subscribe.
- **Sections:** 1. Hero (Value Prop + Form), 2. Recent Issues/Archives, 3. Social Proof (Subscriber count), 4. About Author

### Style
- **Name:** Inclusive Design
- **Mode Support:** Light ✓ Full | Dark ✓ Full
- **Keywords:** Accessible, color-blind friendly, high contrast, haptic feedback, voice interaction, screen reader, WCAG AAA, universal
- **Best For:** Public services, education, healthcare, finance, government, accessible consumer, inclusive
- **Performance:** ⚡ Excellent | **Accessibility:** ✓ WCAG AAA

### Colors
| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#1E40AF` | `--color-primary` |
| On Primary | `#FFFFFF` | `--color-on-primary` |
| Secondary | `#3B82F6` | `--color-secondary` |
| Accent/CTA | `#059669` | `--color-accent` |
| Background | `#0F172A` | `--color-background` |
| Foreground | `#FFFFFF` | `--color-foreground` |
| Muted | `#101A34` | `--color-muted` |
| Border | `rgba(255,255,255,0.08)` | `--color-border` |
| Destructive | `#DC2626` | `--color-destructive` |
| Ring | `#1E40AF` | `--color-ring` |

*Notes: Trust blue + profit green on dark*

### Typography
- **Heading:** Atkinson Hyperlegible
- **Body:** Atkinson Hyperlegible
- **Mood:** accessible, readable, inclusive, WCAG, dyslexia-friendly, clear
- **Best For:** Accessibility-critical sites, government, healthcare, inclusive design
- **Google Fonts:** https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap
- **CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap');
```

### Key Effects
Haptic feedback (vibration), voice guidance, focus indicators (4px+ ring), motion options, alt content, semantic

### Avoid (Anti-patterns)
- Playful design
- Poor security UX
- AI purple/pink gradients

### Pre-Delivery Checklist
- [ ] No emojis as icons (use SVG: Heroicons/Lucide)
- [ ] cursor-pointer on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard nav
- [ ] prefers-reduced-motion respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px

## Implementation refresh: 2026-09-12

The design-system search was rerun before implementation with the task's
offline finance/productivity context. The CLI recommendation is advisory only;
the task contract and approved Luna brand decisions are authoritative.

### Raw `--design-system` output

Query: `offline personal finance ledger mobile productivity accessible light indigo`

- Pattern: App Store Style Landing
- Style: Accessible & Ethical; light and dark mode; high contrast, 16px+ text,
  keyboard navigation, screen reader support, WCAG-oriented
- Colors: primary `#1E40AF`, secondary `#3B82F6`, accent `#059669`, background
  `#0F172A`, foreground `#FFFFFF`, destructive `#DC2626`, ring `#1E40AF`
- Typography: Plus Jakarta Sans recommendation
- Effects: clear focus rings, ARIA labels, skip links, responsive layout,
  reduced motion, 44px targets
- Avoid: playful treatment, poor security UX, AI purple/pink gradients

### Applied decisions

- Keep the approved Luna light-only first release tokens from `design.md`:
  `#F7F8FC` background, white surfaces, indigo `#405DE6`, body `#18243A`,
  secondary `#5E6B80`, income `#147D64`, expense `#9A5A27`, danger `#B42318`.
- Use the existing system sans stack rather than adding remote fonts. Use
  Lucide consistently, semantic CSS variables, 48px controls, responsive
  375/768/1440 breakpoints, visible focus, skip link and reduced motion.
- Treat the CLI's landing-page/App-Store pattern and dark palette as rejected
  for the in-app ledger because they conflict with the approved product scope.

### Raw UX validation query

Query: `animation accessibility z-index loading responsive finance app`

- Loading states: show skeleton/spinner for waits; do not leave UI frozen.
- Motion: use 150–300ms micro-interactions; no decorative infinite motion.
- Layering: use an explicit small z-index scale; avoid arbitrary `9999` values.
- Performance: lazy-load below-fold content and avoid font-induced layout shift.
- Forms: disable loading buttons and show progress to prevent double submits.

## Implementation refresh: 2026-09-12

The design-system search was rerun before implementation with the task's
offline finance/productivity context. The CLI recommendation is advisory only;
the task contract and approved Luna brand decisions are authoritative.

### Raw `--design-system` output

Query: `offline personal finance ledger mobile productivity accessible light indigo`

- Pattern: App Store Style Landing
- Style: Accessible & Ethical; light and dark mode; high contrast, 16px+ text,
  keyboard navigation, screen reader support, WCAG-oriented
- Colors: primary `#1E40AF`, secondary `#3B82F6`, accent `#059669`, background
  `#0F172A`, foreground `#FFFFFF`, destructive `#DC2626`, ring `#1E40AF`
- Typography: Plus Jakarta Sans recommendation
- Effects: clear focus rings, ARIA labels, skip links, responsive layout,
  reduced motion, 44px targets
- Avoid: playful treatment, poor security UX, AI purple/pink gradients

### Applied decisions

- Keep the approved Luna light-only first release tokens from `design.md`:
  `#F7F8FC` background, white surfaces, indigo `#405DE6`, body `#18243A`,
  secondary `#5E6B80`, income `#147D64`, expense `#9A5A27`, danger `#B42318`.
- Use the existing system sans stack rather than adding remote fonts. Use
  Lucide consistently, semantic CSS variables, 48px controls, responsive
  375/768/1440 breakpoints, visible focus, skip link and reduced motion.
- Treat the CLI's landing-page/App-Store pattern and dark palette as rejected
  for the in-app ledger because they conflict with the approved product scope.

### Raw UX validation query

Query: `animation accessibility z-index loading responsive finance app`

- Loading states: show skeleton/spinner for waits; do not leave UI frozen.
- Motion: use 150–300ms micro-interactions; no decorative infinite motion.
- Layering: use an explicit small z-index scale; avoid arbitrary `9999` values.
- Performance: lazy-load below-fold content and avoid font-induced layout shift.
- Forms: disable loading buttons and show progress to prevent double submits.

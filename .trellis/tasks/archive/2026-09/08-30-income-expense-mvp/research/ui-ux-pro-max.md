# UUPM task output: Luna

Generated for the first usable local Electron checkpoint on 2026-08-30 with:

```text
python3 .codex/skills/ui-ux-pro-max/scripts/search.py "offline-first personal finance desktop app calm privacy ledger family workspace" --design-system --project-name "Luna" --format markdown --variance 4 --motion 3 --density 7
```

## Design System: Luna

### Design Dials
- **Variance:** 4/10 — Balanced / Modern
- **Motion:** 3/10 — Subtle
- **Density:** 7/10 — Standard

### Pattern
- **Name:** App Store Style Landing
- **Conversion Focus:** Show real screenshots. Include ratings (4.5+ stars). QR code for mobile. Platform-specific CTAs.
- **CTA Placement:** Download buttons prominent (App Store + Play Store) throughout
- **Color Strategy:** Dark/light matching app store feel. Star ratings in gold. Screenshots with device frames.
- **Sections:** 1. Hero with device mockup, 2. Screenshots carousel, 3. Features with icons, 4. Reviews/ratings, 5. Download CTAs

### Style
- **Name:** Enterprise SaaS (Mobile)
- **Mode Support:** Light ✓ Light | Dark ✓ Dark-ready (token inversion)
- **Keywords:** enterprise, saas, b2b, professional, indigo, violet, gradient, polished, trustworthy, clean, approachable, spring, haptic
- **Best For:** B2B backend management, productivity tools, government and finance mobile apps, SaaS companion apps, enterprise dashboards
- **Performance:** ✓ Performant | **Accessibility:** ✓ WCAG AA

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
- **Heading:** Lora
- **Body:** Raleway
- **Mood:** calm, wellness, health, relaxing, natural, organic
- **Best For:** Health apps, wellness, spa, meditation, yoga, organic brands
- **Google Fonts:** https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600;700&family=Raleway:wght@300;400;500;600;700&display=swap
- **CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600;700&family=Raleway:wght@300;400;500;600;700&display=swap');
```

### Key Effects
Indigo→Violet gradient primary CTAs + active tab highlights, colored card shadows rgba(79,70,229,0.08), pill buttons or 12pt radius, full-width CTA at screen bottom, spring press scale 0.97, floating label inputs with animated focus border, skeletal loading pulses (Indigo/Slate tint), Bottom Sheets with drag dismiss, swipe-to-action list cards, scroll-linked title collapse

### Motion
**Page Transition (Subtle)** — Trigger: route change | Duration: 200-300ms | Easing: `power1.inOut`

Implementation choice for this task: retain the accessible color/focus/motion guidance and adapt the mobile/store pattern to a calm desktop ledger. No ratings, store CTAs, QR code, remote fonts, or emoji icons are part of the product UI.

### Avoid (Anti-patterns)
- Generic health app
- No privacy

### Pre-Delivery Checklist
- [ ] No emojis as icons (use SVG: Heroicons/Lucide)
- [ ] cursor-pointer on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard nav
- [ ] prefers-reduced-motion respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px

## Additional Web-first query (2026-09-04)

The browser preview used this task-specific query and retained the generated
result here before implementation:

```text
python3 .codex/skills/ui-ux-pro-max/scripts/search.py "offline-first personal finance web dashboard compact privacy summary responsive" --design-system --project-name "Luna" --format markdown --variance 4 --motion 3 --density 7
```

### Design System: Luna

### Design Dials
- **Variance:** 4/10 — Balanced / Modern
- **Motion:** 3/10 — Subtle
- **Density:** 7/10 — Standard

### Pattern
- **Name:** Real-Time / Operations Landing
- **Color Strategy:** Dark or neutral with green/amber/red status colors; data-dense but scannable.

### Style
- **Name:** Executive Dashboard
- **Mode Support:** Light ✓ Full | Dark ✓ Full
- **Keywords:** High-level KPIs, large key metrics, minimal detail, summary view, trend indicators, at-a-glance insights, executive summary
- **Performance:** ⚡ Excellent | **Accessibility:** ✓ WCAG AA

### Colors
| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#1E40AF` | `--color-primary` |
| On Primary | `#FFFFFF` | `--color-on-primary` |
| Secondary | `#3B82F6` | `--color-secondary` |
| Accent/CTA | `#059669` | `--color-accent` |
| Background | `#0F172A` | `--color-background` |
| Foreground | `#FFFFFF` | `--color-foreground` |
| Border | `rgba(255,255,255,0.08)` | `--color-border` |
| Destructive | `#DC2626` | `--color-destructive` |
| Ring | `#1E40AF` | `--color-ring` |

### Typography and Motion
- **Heading:** Fira Code; **Body:** Fira Sans; no remote-font import in the app.
- **Page transition:** Subtle, 200–300ms, capped around 250ms and disabled/reduced
  under `prefers-reduced-motion`.

### Applied decision

The result is adapted to a local finance dashboard: preserve the indigo/green
semantic tokens, high-density/scannable summary cards, WCAG/focus requirements,
and 375/768/1024/1440 responsive checks. Do not add the generated landing-page
conversion sections, remote fonts, count-up effects, or dark-only treatment to
this offline ledger. The summary privacy requirement takes priority over KPI
animation: hidden values remain masked and the row becomes compact.

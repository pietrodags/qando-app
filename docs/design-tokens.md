# Design tokens

Every colour, typeface, size, spacing, radius, shadow, layer and motion value of the web app comes from one file, [`apps/web/src/styles/_tokens.scss`](../apps/web/src/styles/_tokens.scss), as CSS custom properties on `:root` with the `--q-` prefix. Components never write a colour or a length by hand: they use a token, or a value built from tokens in their own stylesheet.

## Files

| File | What it holds |
|---|---|
| `src/styles/_tokens.scss` | All the tokens, and their reduced-motion values |
| `src/styles/_breakpoints.scss` | Breakpoints as Sass values and mixins (media queries cannot read custom properties) |
| `src/styles/_base.scss` | Base element styles: page background, default text, focus ring, reduced motion |
| `src/styles.scss` | Loads tokens and base styles once for the whole app |

The brand typeface, Comfortaa, is served from our own domain (`@fontsource-variable/comfortaa`, one variable file for weights 300–700). The browser downloads only the subset it needs, and no request leaves `qando.app`, so the Content Security Policy can stay limited to our origin.

## Two levels

1. **Palette** (`--q-grey-700`, `--q-green-200`, `--q-salmon-300`…): raw colours. Only the tokens file uses them.
2. **Semantic tokens**: what the value is for. Components use these.

| Group | Tokens | Use |
|---|---|---|
| Surfaces | `--q-page-bg`, `--q-surface`, `--q-card-bg`, `--q-card-highlight`, `--q-tab-bg`, `--q-button-bg`, `--q-success-bg`, `--q-results-bg`, `--q-toast-bg`, `--q-scrim` | Backgrounds of the page, cards, buttons and overlays |
| Votes | `--q-available-bg`, `--q-available-soft-bg`, `--q-preferred-bg`, `--q-unavailable-bg`, `--q-unavailable-strike`, `--q-saved-overlay-bg`, `--q-hover-tint` | Days, times and result bars by answer |
| Text | `--q-text` (default), `-strong`, `-heading`, `-emph`, `-label`, `-muted`, `-subtle`, `-day-header`, `-results-label`, `-option-flexible`, `-option-choose`, `-disabled`, `-inactive` | Text on neutral surfaces |
| Text on colour | `--q-on-available`, `--q-on-preferred`, `--q-on-range-middle`, `--q-on-unavailable`, `--q-on-unavailable-bar`, `--q-on-toast`, `--q-on-notice-info`, `--q-on-notice-error` | Text drawn on a coloured surface |
| Accents | `--q-accent-blue`, `-teal`, `-amber`, `-salmon`, `-slate`, `-flexible` | Step identity colours. Shown as a dot beside the step label, **never as text** |
| Indicators | `--q-focus-color`, `--q-focus-width`, `--q-focus-offset`, `--q-danger`, `--q-holiday-national`, `--q-holiday-local`, `--q-success-icon`, `--q-spinner-arc`, `--q-ring-*` | Focus ring, destructive hover, holiday dots, hover glows |
| Type | `--q-font-ui`, `--q-font-brand`; sizes `--q-fs-3xs` (8 px) … `--q-fs-display` (45 px) in `rem`; weights `--q-fw-light` … `--q-fw-bold`; line heights `--q-lh-none` … `--q-lh-loose` | Sizes are in `rem`, so they follow the user's browser text size |
| Spacing | `--q-space-1` (2 px) … `--q-space-12` (45 px), `--q-container-max` (650 px), `--q-page-gutter` | Margins, paddings and gaps |
| Radii | `--q-radius-none` … `--q-radius-card` (24 px), `--q-radius-xl`, `--q-radius-pill`, `--q-radius-circle` | Corners |
| Elevation | `--q-shadow-card`, `-raised`, `-popover`, `-well`, `-well-sm`, `-track`, `-thumb`, `-outline-soft`, `-notice`; `--q-border-edge`, `--q-border-raised` | The soft raised and sunken (neumorphic) look |
| Layers | `--q-z-below`, `-cell`, `-cell-raised`, `-cell-overlay`, `-range`, `-drag`, `-toast`, `-overlay`, `-popover` | Named stacking order instead of loose numbers |
| Motion | `--q-duration-instant` (100 ms) … `--q-duration-celebrate` (700 ms); easings `--q-ease`, `-in-out`, `-out`, `-page`, `-substep`, `-curtain` | Transitions and animations |
| Step stack | `--q-step-duration` (350 ms), `-collapse-duration`, `-radius-duration`, `-return-duration`, `-easing`, `-return-easing`, `-enter-offset`, `-tab-height`, `-tab-scale` | The shared step-card stack of the wizard and the vote |

A value used by a single component (the geometry of a date range, a tooltip arrow) stays in that component's stylesheet, built from tokens. It becomes a token when a second component needs it.

## Breakpoints

Styles are written for phones first and grow at two widths:

```scss
@use 'breakpoints' as bp;

.grid {
  gap: var(--q-space-3);

  @include bp.from-tablet { gap: var(--q-space-5); }   // 650 px and wider
  @include bp.from-desktop { gap: var(--q-space-8); }  // 1024 px and wider
}
```

## Accessibility rules, enforced by tests

`src/styles/tokens.spec.ts` reads the tokens file and fails the build when:

- a text token is below **4.5:1** contrast (WCAG 2.2 AA, 1.4.3) on any surface it is drawn on; gradients are checked at every colour stop and translucent colours are blended first;
- a new text token (`--q-text-*`, `--q-on-*`) is added without listing the surfaces it is drawn on. Only `-disabled` and `-inactive` text (days that cannot be chosen) is exempt;
- a text token is a listed **exception** (`contrastExceptions`, with its reason) but no longer below 4.5:1. The only exception is `--q-on-range-middle`: the middle days of a date range are drawn light on purpose so the range ends stand out, like a disabled control;
- the focus ring or the destructive colour is below **3:1** (1.4.11, non-text contrast);
- a duration token keeps a non-zero value when the user asks for **reduced motion**. Under `prefers-reduced-motion: reduce` every duration is `0ms`, and the base styles also stop animations that do not use the tokens.

The sample page (`features/create/create-page`) is checked to use only tokens: its stylesheet may not contain colours, lengths or durations written by hand (`src/styles/token-usage.ts`).

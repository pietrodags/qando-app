# Design tokens

Every colour, typeface, size, spacing, radius, shadow, layer and motion value of the web app comes from one file, [`apps/web/src/styles/_tokens.scss`](../apps/web/src/styles/_tokens.scss), as CSS custom properties on `:root` with the `--q-` prefix. Components never write a colour or a length by hand: they use a token, or a value built from tokens in their own stylesheet.

## Files

| File | What it holds |
|---|---|
| `src/styles/_tokens.scss` | All the tokens, and their reduced-motion values |
| `src/styles/_breakpoints.scss` | Breakpoints as Sass values and mixins (media queries cannot read custom properties) |
| `src/styles/_base.scss` | Base element styles: page background, default text, focus ring, reduced motion |
| `src/styles/_tokens.scss` (`--q-waves-*`) | The animated waves behind every page (`src/app/core/layout/waves-background`): the ribbons' and lines' colours, the paper grain (`--q-waves-grain`, `--q-waves-grain-opacity`), the pause button's size, margin and icon (`--q-waves-toggle-margin`) and its layer (`--q-z-background-toggle`) |
| `src/styles.scss` | Loads tokens and base styles once for the whole app |

The brand typeface, Comfortaa, is served from our own domain (`@fontsource-variable/comfortaa`, one variable file for weights 300–700). The browser downloads only the subset it needs, and no request leaves `qando.app`, so the Content Security Policy can stay limited to our origin.

## Two levels

1. **Palette** (`--q-grey-700`, `--q-green-200`, `--q-salmon-300`…): raw colours. Only the tokens file uses them.
2. **Semantic tokens**: what the value is for. Components use these.

| Group | Tokens | Use |
|---|---|---|
| Surfaces | `--q-page-bg` (the drawing's paper, shown until the drawing loads), `--q-surface`, `--q-card-bg`, `--q-card-highlight`, `--q-tab-bg`, `--q-button-bg`, `--q-success-bg`, `--q-toast-bg`, `--q-menu-item-hover-bg`, `--q-scrim` | Backgrounds of the page, cards, buttons, menu items and overlays |
| Votes | `--q-available-bg`, `--q-available-soft-bg`, `--q-preferred-bg`, `--q-unavailable-bg`, `--q-unavailable-strike`, `--q-saved-overlay-bg`, `--q-hover-tint` | Days, times and result bars by answer |
| Text | `--q-text` (default), `-strong`, `-heading`, `-emph`, `-label`, `-muted`, `-subtle`, `-day-header`, `-option-flexible`, `-option-choose`, `-disabled`, `-inactive` | Text on neutral surfaces |
| Text on colour | `--q-on-available`, `--q-on-preferred`, `--q-on-range-middle`, `--q-on-unavailable`, `--q-on-unavailable-bar`, `--q-on-toast`, `--q-on-notice-info`, `--q-on-notice-error`, `--q-on-success-subtle` | Text drawn on a coloured surface ("Hora de Madrid" on the green cards: the quiet text that reads on them) |
| Accents | `--q-step-dot`; `--q-accent-blue`, `-teal`, `-amber` | `--q-step-dot`: the dot beside every step's label, in the wizard, the voting page and "Editar opciones", **never as text**. `--q-accent-blue`, `-teal`, `-amber`: the dev playground's sample content |
| Indicators | `--q-focus-color`, `--q-focus-width`, `--q-focus-offset`, `--q-danger`, `--q-engaged`, `--q-holiday-national`, `--q-holiday-local`, `--q-success-icon`, `--q-success-check`, `--q-spinner-arc`, `--q-ring-*` | Focus ring, destructive hover, a control shown in place of the button that asked for it (the red "+" of the ranges without a mouse), holiday dots, the thank-you check (white on its green circle), hover glows |
| Type | `--q-font-ui`, `--q-font-brand`; sizes `--q-fs-3xs` (8 px) … `--q-fs-display` (45 px) in `rem`; weights `--q-fw-light` … `--q-fw-bold`; line heights `--q-lh-none` … `--q-lh-loose` | Sizes are in `rem`, so they follow the user's browser text size |
| Spacing | `--q-space-1` (2 px) … `--q-space-12` (45 px), `--q-container-max` (650 px), `--q-page-gutter`; sizes `--q-field-max` (380 px, a centred text field), `--q-choice-max` (180 px, side-by-side choice buttons), `--q-logo-height` (20 px), `--q-icon-size` (24 px, header icons), `--q-icon-size-sm` (18 px, icons inside buttons), `--q-spinner-size` (40 px), `--q-spinner-stroke` (4 px), `--q-toast-padding`, `--q-toast-rise` (100 px, the toast's slide), `--q-confirm-bubble-max` (340 px, the vote confirmation's text), `--q-success-icon-size` (100 px), `--q-success-check-stroke` (5 px), `--q-thanks-change-max` (420 px, the thank-you card's edit block), `--q-account-menu-min-width` (190 px) and `--q-account-menu-max-width` (280 px, the header's account menu); the smart calendar's microphone: `--q-mic-size` (34 px, its button), `--q-mic-icon-size` (16 px), `--q-mic-room` (52 px, where the text ends before it), and its five bars, `--q-mic-bar-width` (3 px), `--q-mic-bar-gap` (2.5 px), `--q-mic-bar-radius` (2 px), `--q-mic-bar-height-1` … `-5` (8, 14, 10, 16, 8 px) | Margins, paddings, gaps and fixed sizes |
| Radii | `--q-radius-none` … `--q-radius-card` (24 px), `--q-radius-xl`, `--q-radius-pill`, `--q-radius-circle` | Corners |
| Elevation | `--q-shadow-card`, `-raised`, `-popover`, `-well`, `-well-sm`, `-track`, `-thumb`, `-outline-soft`, `-notice`; `--q-border-edge`, `--q-border-raised`, `--q-border-menu-divider` (the lines between the parts of a menu) | The soft raised and sunken (neumorphic) look |
| Layers | `--q-z-below`, `-cell`, `-cell-raised`, `-cell-overlay`, `-range`, `-drag`, `-toast`, `-overlay`, `-popover` | Named stacking order instead of loose numbers |
| Motion | `--q-duration-instant` (100 ms) … `--q-duration-celebrate` (700 ms), `--q-duration-spin` (1 s, one spinner turn); easings `--q-ease`, `-in-out`, `-out`, `-page`, `-substep`, `-curtain`; the microphone's bars: `--q-mic-listening-duration` (1.2 s, one swing while it listens), `--q-mic-hearing-duration` (0.6 s, while words come), `--q-mic-bar-beat` (50 ms, what the bars' swings are apart by, in multiples) | Transitions and animations |
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

- a text token is below **4.5:1** contrast (WCAG 2.2 AA, 1.4.3) on any surface it is drawn on; gradients are checked at every colour stop and translucent colours are blended first. The only things drawn straight on the page are the header's logo and icons, on the drawing's paper, `--q-page-bg`; every page's words sit in a card, a page being built and a page loading too, since the drawing's waves would fall behind words on some screens (`e2e/layout/background.spec.ts` measures the colours behind them). `--q-text-subtle`, `-typed` and `-day-header` do not reach 4.5:1 on the paper, so they are checked only on the surfaces they are drawn on;
- a new text token (`--q-text-*`, `--q-on-*`) is added without listing the surfaces it is drawn on. Only `-disabled` and `-inactive` text (days that cannot be chosen) is exempt;
- a text token is a listed **exception** (`contrastExceptions`, with its reason) but no longer below 4.5:1. The only exception is `--q-on-range-middle`: the middle days of a date range are drawn light on purpose so the range ends stand out, like a disabled control;
- a colour stop of the cards' or the steps' tabs' background (`--q-card-bg`, `--q-tab-bg`) is as blue as it is red or bluer: they stay white warmed a touch, as the drawing's paper behind them;
- a colour stop of the green cards' background (`--q-success-bg`: the thanks and a confirmed date) or their icon (`--q-success-icon`) is not one of the drawing's own colours (`--q-waves-*`): they are drawn in its greens, so they sit in it;
- the focus ring or the destructive colour is below **3:1** (1.4.11, non-text contrast);
- a duration token keeps a non-zero value when the user asks for **reduced motion**. Under `prefers-reduced-motion: reduce` every duration is `0ms`, and the base styles also stop animations that do not use the tokens.

The sample page (`features/create/create-page`) is checked to use only tokens: its stylesheet may not contain colours, lengths or durations written by hand (`src/styles/token-usage.ts`).

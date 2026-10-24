# Mini Machines design system

The visual foundations follow [Astryx](https://astryx.atmeta.com/): Figtree typography, warm light surfaces, neutral dark surfaces, cobalt identity, rounded controls and generous spacing. Keep Mini Machines product copy, behavior and the supplied logo.

- `src/styles/globals.css` owns the semantic colors for both themes. Public pages, Git, Bots and portal dialogs inherit these tokens. Avoid component-specific light or dark palettes.
- `--background` is the canvas, `--surface` the sidebar, and `--card` an elevated content surface. `--foreground` and `--muted-foreground` are text colors; `--signal` marks navigation and links. Status and diff colors use the success, warning and destructive tokens with corresponding soft surfaces.
- Use 12–16px corners for panels and fields, full pills for main actions, and 44px targets for primary controls. Keep code in Geist Mono.
- Appearance offers Light, Dark and System. The system preference is the default; explicit choices persist in local storage. A head script applies the preference before paint. Do not force a theme inside a product shell.
- `BrandMark` renders the supplied SVG geometry using `--brand`. The same artwork is available as `public/logo.svg`, the favicon and Apple home-screen icon.
- Keep focus rings visible, body text at 4.5:1 contrast, semantic diff labels alongside color, and responsive navigation usable at 390px. Honor reduced motion.

Use compact container spacing: 12–16px in panels, 16–24px in content areas, and 24–32px around forms or empty states. Avoid accumulating large insets across nested containers. Preserve 44px phone touch targets.

Phone workflows use progressive disclosure: tap the page title for the workspace page list; tap a file for a focused diff with Back; reveal repository controls, filters and forms when needed. Bots opens into the conversation, with its library in a sheet. Keep the browser’s bottom area free of app navigation. Desktop keeps its sidebar and split views.

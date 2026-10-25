# Mini Machines design system

The visual foundations retain Mini Machines’ cobalt identity and supplied logo, with IBM Plex Sans for approachable, compact interface typography and IBM Plex Mono for code. Light and dark surfaces are neutral and softly tinted. Public storytelling is conversational and project-led, inspired by Muse’s emphasis on useful work and clear human decisions.

- `src/styles/globals.css` owns the semantic colors for both themes. Public pages, Git, Bots and portal dialogs inherit these tokens. Avoid component-specific light or dark palettes.
- `--background` is the canvas, `--surface` the sidebar, and `--card` an elevated content surface. `--foreground` and `--muted-foreground` are text colors; `--signal` marks navigation and links. Status and diff colors use the success, warning and destructive tokens with corresponding soft surfaces.
- Use 12–16px corners for panels and fields, full pills for main actions, and 44px targets for primary controls. Keep code in IBM Plex Mono.
- Appearance offers Light, Dark and System. The system preference is the default; explicit choices persist in local storage. A head script applies the preference before paint. Do not force a theme inside a product shell.
- `BrandMark` renders the supplied SVG geometry using `--brand`. The same artwork is available as `public/logo.svg`, the favicon and Apple home-screen icon.
- Keep focus rings visible, body text at 4.5:1 contrast, semantic diff labels alongside color, and responsive navigation usable at 390px. Honor reduced motion.

Use compact container spacing: 12–16px in panels, 16–24px in content areas, and 24–32px around forms or empty states. Avoid accumulating large insets across nested containers. Preserve 44px phone touch targets.

Phone workflows use progressive disclosure: tap the page title for the workspace page list; tap a file for a focused diff with Back; reveal repository controls, filters and forms when needed. Bots opens into the conversation, with its library in a sheet. Keep the browser’s bottom area free of app navigation. Desktop keeps its sidebar and split views.

`src/styles/materials.css` refines the shared components with restrained glass materials. Controls use a fine specular highlight and short relief shadow; menus and dialogs use a highly opaque translucent material. Broad content panels use neutral tint instead of repeated outlines or blur. Keep data and code surfaces quiet. Compact desktop controls expand to 44px targets on touch devices. Preserve visible focus, reduced-motion, reduced-transparency and forced-colors alternatives.

The default dashboard is a messenger centered on Bot conversations. Bot and Whiteboard are the two top modes, presented as a compact pearl capsule with a raised selected segment and text labels. The title opens the full destination list; Machines, Git, team, credentials, and docs remain available there. No bottom navigation.

Chat opens on optional suggested prompts and a bottom composer; bot customization lives in a gear dialog. Whiteboard opens immediately on a browser-local Excalidraw canvas, with the drawing palette at the bottom. A right-edge tick rail scrubs up to 120 cached edits; history previews are read-only, onion skins show prior changed elements, and restoration appends a new edit. Local canvas drafts and history are scoped to the signed-in user in IndexedDB and are not automatically shared with project rooms.

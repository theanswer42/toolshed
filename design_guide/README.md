# Design guide

A shared look and set of UI conventions for small personal web apps
(server-rendered HTML, optionally htmx). One stylesheet, one optional
script, two fonts. No build step.

- `GUIDE.md` covers the page shell, page types, list views, forms, interaction rules and feedback.
- `demo/` has static pages showing every component. Open `demo/index.html` in a browser.

## Principles

1. **No build step, no JS dependencies.** Plain CSS and a small optional
   script. Apps may use htmx; nothing here requires it.
2. **Semantic HTML first.** Bare elements (`table`, `input`, `button`,
   `h1`) are already styled. Classes are for layout and named components,
   not for restyling elements one-off.
3. **Tokens only.** Colours, sizes, spacing, radii and shadows come from
   the custom properties in `design.css`. Templates and app CSS never use
   raw values. If a value is missing, add a token.
4. **Every change is an explicit save.** Mutations happen when the user
   presses a button. No autosave on change or blur.
5. **No modals for content.** Creating and editing happen on the page.
   The only modal is the confirm dialog for destructive actions.
6. **Destructive actions confirm first.** Deletes and other hard-to-undo
   actions go through the confirm dialog.
7. **Say what happened.** Every mutation ends with a flash message, or
   with an inline error next to the thing that failed.
8. **Light and dark.** Everything follows the system colour scheme. Apps
   choose a theme; they don't hand-pick colours.
9. **Works on a phone.** One responsive layout, touch-sized controls,
   and Firefox for Android as the main mobile test browser.

## Files

| File | What it is | Copy into apps? |
|---|---|---|
| `design.css` | Tokens, reset, base element styles, layout, components, utilities | Yes |
| `themes.css` | 14 colour themes (plus the built-in default), each with light and dark values | Yes (optional) |
| `design.js` | Confirm dialog, flash dismiss, current-nav highlighting (about 140 lines, no deps) | Yes (optional) |
| `fonts/` | Inter and JetBrains Mono (variable, woff2, Latin + Latin Extended), with licences | Yes, next to `design.css` |
| `GUIDE.md` | The design guide | No |
| `demo/` | Static demo pages, `demo.js` and `demo.css` (demo-only interactions and theme gallery) | No |

## Using it in an app

Copy `design.css`, `design.js` and `fonts/` into the app's static folder,
keeping `fonts/` next to `design.css`:

```html
<html lang="en" data-theme="nord">                <!-- optional: pick a theme -->
<link rel="stylesheet" href="/static/design/design.css">
<link rel="stylesheet" href="/static/design/themes.css">   <!-- only if using a theme -->
<link rel="stylesheet" href="/static/app.css">   <!-- app-specific, optional -->
<script src="/static/design/design.js" defer></script>
```

**Theme.** Set `data-theme` on `<html>` to one of: `slate`, `stone`,
`github`, `solarized`, `gruvbox`, `nord`, `catppuccin`, `rose-pine`,
`tokyo-night`, `dracula`, `one`, `everforest`, `kanagawa`, `sepia`.
Leave it off for the default gray/blue. Every theme has light and dark
values; the system setting picks one, or force it with
`data-mode="light"` / `data-mode="dark"`. The default theme can also
change just its accent hue:

```css
:root { --accent-hue: 160; }  /* green; default is 263 (blue) */
```

App-specific CSS goes in its own file, inside `@layer app { … }` or
unlayered, and uses the tokens.

Each copied file carries a `version:` line in its header comment. When
you change the guide, bump the version so you can tell which app has
which copy.

## Changing the design

Edit `design.css` and check every demo page in light and dark mode
(the moon button in the demo header cycles auto / light / dark), and
at phone width (about 390px; Firefox's Responsive Design Mode with touch
simulation is the easiest way). The theme menu in the demo header switches themes;
the Foundations page shows every theme side by side and has an
accent-hue slider for the default theme.

**Adding a theme.** A theme is one `[data-theme="name"]` block in
`themes.css` that sets the core colour tokens (background, surfaces,
border, text, muted text, accent, success, warning, danger, and the
text colours used on accent and danger buttons), each as
`light-dark(light, dark)`. Everything else is derived. Check contrast
before committing: body and muted text, button text, links and status
text should all reach WCAG AA (4.5:1) against their backgrounds. If you add a component, add it to a demo
page and to `GUIDE.md` in the same change.

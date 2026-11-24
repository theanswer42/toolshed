# Design guide

How pages in these apps are laid out, which components exist, and which
interactions are allowed. `README.md` has the principles; `demo/` shows
everything described here.

Class names in this guide are the ones in `design.css`. Prefer the bare
element where one exists: `<table>`, `<button>`, `<input>` and headings
need no class.

---

## 1. Page shell

Every app uses the same shell:

```
┌───────────────────────────────────────────────────────────┐
│ [■] App name                       [flash message ×] [⋯]  │  app header
├────────────┬──────────────────────────────────────────────┤
│ SECTION    │  breadcrumbs                                 │
│ ▸ Item     │  Page title                   [Sec] [Primary]│  page header
│ ▸ Item     │  [toolbar: pager · filters · search · view]  │
│            │                                              │
│ SECTION    │  content …                                   │  main (scrolls)
│ ▸ Item     │                                              │
│            │  [footer bar: info · pager / save]           │
└────────────┴──────────────────────────────────────────────┘
   sidenav
```

```html
<body class="app">
  <header class="app-header">
    <a class="brand" href="/"><span class="brand-mark">N</span>Necker</a>
    <div id="flash" class="flash-region" role="status" aria-live="polite"></div>
    <!-- optional app-wide controls (ghost/small buttons) -->
  </header>
  <nav class="sidenav" aria-label="Main">
    <h2>Section</h2>               <!-- optional group headings -->
    <ul>
      <li><a href="/ui/transactions" aria-current="page">{icon}Transactions <span class="count">214</span></a></li>
    </ul>
  </nav>
  <main id="content">
    <div class="page"> … </div>
  </main>
</body>
```

- **App header**: brand on the left, then the flash region, then any
  app-wide controls (rare). Nothing else lives here: no page actions.
- **Sidenav**: the app's top-level sections, one link each, optionally
  grouped under small `h2` headings. An icon and a `.count` are optional.
  The current section has `aria-current="page"`. `design.js` sets this
  from the URL (longest-prefix match, so sub-pages highlight their
  parent), and the server may also render it.
- **Main**: the only thing that scrolls. With htmx it is the swap target
  for navigation (`hx-target="#content" hx-push-url="true"`).
- **`.page`** wraps the content and sets the width (`--content-max`) and
  vertical spacing. Use `.page.wide` for wide tables or galleries and
  `.page.narrow` for a page that is just one form.
- Below 48rem (phones) the shell changes shape; see §10. The sidenav
  becomes a bottom tab bar, so nav labels should be one short word.

## 2. Page header and in-page navigation

There are two kinds of in-page navigation, and each has a fixed place.

| Kind | Question it answers | Where | Components |
|---|---|---|---|
| Context navigation | Where am I? What am I looking at? | Top, in the page header | breadcrumbs, tabs, pager (for scope such as a month), filters, view switcher |
| Sequence navigation | What's next? | Bottom, in the footer bar | pagination, previous/next item, wizard "Save and continue" |

### Page header

```html
<header class="page-header">
  <nav class="breadcrumbs" aria-label="Breadcrumb">        <!-- optional -->
    <ol><li><a href="/music">Music</a></li><li><span aria-current="page">Album</span></li></ol>
  </nav>
  <div class="title-row">                                   <!-- required -->
    <div><h1>Wish You Were Here</h1><p class="subtitle">1975 · 5 tracks</p></div>
    <div class="actions"><button>Edit</button><button class="primary">Play</button></div>
  </div>
  <div class="toolbar">                                     <!-- optional -->
    <div class="pager"> … </div>
    <select class="w-auto"> … </select>
    <div class="spacer"></div>
    <input type="search" placeholder="Search…">
    <div class="segmented"> … </div>
  </div>
</header>
```

- **Title row**: required. One `h1` per page, an optional `.subtitle`,
  and `.actions` on the right with at most one `.primary` button.
- **Breadcrumbs**: use them when the page is inside a hierarchy deeper
  than the sidenav (Music › Artist › Album, a folder path). The last
  crumb is the current page and is not a link. Don't add breadcrumbs to
  top-level pages.
- **Toolbar**: controls that change *what is shown* on this page. They
  don't change data. Put scope and filters on the left, then
  `.spacer`, then search and the view switcher on the right.
- **Pager in the toolbar**: when the page is scoped to a period or other
  ordered context, such as a month, use `.pager`
  (prev button · `.current` label · next button). It belongs at the top
  because it defines what the page shows. Disable an end with
  `aria-disabled="true"`. Each position is a URL (`?month=2026-11`).
- **Tabs** (`nav.tabs`): sibling views of the same thing, such as a
  report's Summary / By category / Transactions. Each tab is a link with
  its own URL. They are not client-side panels.

### Footer bar

```html
<div class="footer-bar">            <!-- add .sticky on long pages -->
  <span class="info">Showing 1–50 of 214</span>
  <div class="pager"> … Previous · Page 1 of 5 · Next … </div>
</div>
```

- Goes after the content it navigates. The left side holds `.info`
  (counts, progress) and the right side holds the pager or actions.
- Use **`.footer-bar.sticky`** when the content is long and the bar holds
  the page's main action, for example a bulk-edit "Save and continue".
  It stays at the bottom of the scroll area. This is pure CSS; it does
  not float over other pages or the sidenav.
- Pagination: previous/next buttons with a "Page n of m" label. If a
  collection fits on one page, don't show a pager.

## 3. Page types

Most pages are one of these.

| Type | Structure | Example |
|---|---|---|
| **Collection** | Page header (title + "Add" action, optional toolbar) → a list view (§4) or empty state → optional footer bar | Transactions, Accounts, Albums |
| **Detail** | Page header (breadcrumbs, title, Edit/Delete actions) → `.stats` and/or `dl.kv` in cards → related collections as `.section`s | An account, an album |
| **Form** | Page header (title only) → `.card.form-page` with `.form` → `.form-actions` | Add account, Import |
| **Bulk edit** | Page header → progress card → table with inputs per row → sticky footer bar with the single save | Import review |

App-specific pages, such as reports or a music player, still use the shell,
the page header and the components below. Their content layout is up
to the app.

Use `.section` (a `header` with an `h2` plus content) to split a page
into titled groups. Use `.card` for a bordered surface, with
`.card-header`, `.card-body` and `.card-footer` as needed. A table
placed directly inside `.card` sits edge to edge.

## 4. List views

A collection is shown in one of four views. Pick the one that fits the
items, and offer a view switcher only when more than one fits.

| View | Class | Looks like | Use for |
|---|---|---|---|
| **Table view** | `<table>` in `.card` | Rows with column headers | Items with several comparable fields: transactions, accounts, budgets |
| **List view** | `ul.item-list` › `.item` | One column of rows: optional thumb, title, one meta line, a trailing value or badge | Items with no natural columns: imports, notes, log entries |
| **Tile view** | `ul.tiles` › `.tile` | Two or so columns of cards: small thumbnail with 2–3 lines of text beside it | Items where the name and metadata matter more than the image: albums by text, artists, documents |
| **Gallery view** | `ul.gallery` › `.gallery-item` | Grid of large thumbnails with a short caption underneath | Items you recognise by their image: photos, album art. `.gallery.large` for bigger thumbs; `.thumb.wide` for 4:3 |

Rules for all views:

- **Item slots**: thumbnail (`.thumb`) → title (`.item-title`) →
  metadata (`.item-meta`, muted, one line each, truncated) → trailing
  value or status (`.item-end`, list view only). Keep the same slot order in
  every view, so switching views doesn't move information around.
- **Thumbnails**: an `<img>` inside `.thumb`, or a placeholder. A
  placeholder can show initials or an icon, and `style="--hue: N"` gives
  it a generated colour. Sizes are `.sm`, the default, `.lg`, or the
  full width in a gallery.
- **Clickable items**: the whole item is one `<a>` (`a.item`, `a.tile`,
  `a.gallery-item`). In tables, link the primary cell (`a.row-link`), not
  the whole row.
- **Tables**: numbers get `.num` (right-aligned, tabular). The main
  identifying cell gets `.primary-cell`. Put row actions last in
  `.actions-cell`, as ghost icon buttons. Optional modifiers are `.hover`,
  `.striped` and `.compact`. Totals go in `<tfoot>`. Wrap wide tables in
  `.card.scroll-x`. Add `.responsive` so that on phones each row turns
  into a list item (§10).
- **Unconfirmed or suggested values** (an auto-category, say) are shown
  in `<em class="muted">` until a person confirms them.
- **Selection**: `aria-selected="true"` on a `tr`, `.tile` or
  `.gallery-item`.
- **View switcher**: a `.segmented` group in the toolbar. Each option is a
  link to the same URL with `?view=tiles|gallery|table`, marked with
  `aria-current`, or a button with `aria-pressed`. The server renders the
  chosen view, and the app may remember the choice per collection.
- **Empty state**: replace the whole view with `.empty`. It has an icon,
  an `h3` saying what's missing, a line on why, and the action that fixes
  it. Don't show an empty table with headers.

Other ways to display data:

- **`.stats` › `.stat`**: headline numbers (label, `.value`, optional
  `.delta` with `.up` or `.down`).
- **`dl.kv`**: field/value pairs on detail pages.
- **`details.panel`**: secondary content tucked away. This is the
  alternative to a modal for "more info".
- **`.badge`**: short status words, coloured by meaning (`info`,
  `success`, `warning`, `danger`, neutral by default). Add `.dot` for a
  live status.

## 5. Forms and editing

**Every mutation is an explicit save.** The user presses a button, the
server validates, and the response re-renders the affected fragment and
sends a flash message. Nothing saves on change or blur.

There are four ways to edit, from largest to smallest. Each is valid; pick
by how much is being edited.

### 5.1 Form page

Use it to create or edit a whole record, or anything with more than about
three fields. The form has its own URL.

```html
<div class="card form-page">
  <div class="card-header"><h2>Add account</h2></div>
  <form class="card-body form" hx-post="/ui/accounts" hx-target="#content">
    <div class="field">
      <label for="name" class="required">Name</label>
      <input id="name" name="name" aria-invalid="true" aria-describedby="name-err">
      <span id="name-err" class="field-error">Name is already in use.</span>
    </div>
    <div class="field-row"> <div class="field">…</div> <div class="field">…</div> </div>
    <div class="form-actions">
      <button class="primary" type="submit">Create account</button>
      <a class="button ghost" href="/ui/accounts">Cancel</a>
    </div>
  </form>
</div>
```

- Fields are a `.field` with a label, the control, an optional `.hint`,
  and an optional `.field-error`. Put short related fields side by side
  in `.field-row`.
- Mark required fields with `.required` on the label, and use the
  `required` attribute as well.
- Validation errors re-render the form with the values kept,
  `aria-invalid="true"` on each bad control, a `.field-error` under it,
  and, if the error isn't tied to a field, an `.alert.danger` at the top
  of the form.
- `.form-actions`: the primary submit button first, then a Cancel ghost
  link back to the collection. A destructive action, such as Delete
  record, goes at the far right after a `.spacer`.
- Use `.input-group` with `.addon` for currency and units.

### 5.2 Inline form

Use it for a quick add of one to three fields, without leaving the
collection. It sits on one line above the list it adds to.

```html
<form class="inline-form" hx-post="/ui/budgets" hx-target="#content">
  <div class="field"><label for="cat">Category</label><select id="cat">…</select></div>
  <div class="field narrow"><label for="amt">Amount</label><input id="amt" type="number"></div>
  <button class="primary" type="submit">Add budget</button>
  <button type="button" class="ghost">Cancel</button>
</form>
```

It can always be present, or revealed by the page's "New …" button,
which swaps the inline form into a slot above the list. On error it
re-renders with an `.alert.danger` or `.form-error` spanning the full
width.

### 5.3 In-place edit

Use it to change one value of one row. The value cell swaps to a small
form with Save and Cancel, and swaps back after either.

```html
<td class="num" id="budget-amount-3">
  <form class="edit-in-place" hx-patch="/ui/budgets/3" hx-target="#budget-amount-3" hx-swap="outerHTML">
    <div class="input-group"><span class="addon">$</span><input name="amount" type="number" step="0.01"></div>
    <button class="primary">Save</button>
    <button type="button" hx-get="/ui/budgets/3/amount" hx-target="#budget-amount-3" hx-swap="outerHTML">Cancel</button>
  </form>
</td>
```

Only one cell per row is in edit mode at a time. While editing, the row
can carry `.is-editing`. Controls inside tables are automatically
compact.

### 5.4 Bulk edit

Use it to review or change many rows at once, such as an import review.
Every row has inputs. There is a single save at the bottom, in a
`.footer-bar.sticky` that also shows progress
("5 in this batch · 12 remaining"). Row errors appear under the
offending control. A `<progress>` in a card above the table shows overall
progress.

### Buttons

| Style | Markup | Use |
|---|---|---|
| Primary | `<button class="primary">` | The main action of an area. At most one per page header, form or dialog. |
| Secondary | `<button>` | Other actions. |
| Ghost | `<button class="ghost">` | Low-emphasis actions: Cancel, row actions, toolbar icons. |
| Danger | `<button class="danger">` | The confirm button in a delete dialog, or a destructive primary. |
| Ghost danger | `<button class="ghost danger-text">` | Delete as a row action, which then confirms. |
| Link | `<button class="link">` | An action that reads as text inside a sentence. |

Modifiers: `.small`, `.icon` (square, icon only, needs `aria-label`).
For a link that should look like a button, use `<a class="button">`.
Button labels are verbs that say what happens ("Create account", "Save
and continue"), not "OK" or "Submit".

## 6. Interaction rules

- **Navigation**: links and htmx swaps of `#content` with
  `hx-push-url="true"`. Every distinct view has a URL, including its
  pager position, tab and view mode, so reloading and the back button
  work.
- **Mutations**: explicit save only (§5). After success, re-render the
  affected fragment and send a flash. After failure, re-render with
  errors in place.
- **Modals**: none for content. Create and edit happen on the page,
  through a form page, inline form, in-place edit or bulk edit. Extra
  information goes in `details.panel`. The one exception is the confirm
  dialog.
- **Confirmation**: required for deletes and anything hard to undo. It
  isn't needed for routine saves.
- **Loading**: htmx adds `.htmx-request` to the element that issues the
  request. A button with `hx-post` gets it itself. A `<form hx-post>`
  gets it on the form, and the CSS then spins the form's submit buttons.
  Either way the spinning button ignores clicks, which prevents double
  submits. To also disable the controls, add
  `hx-disabled-elt="find button[type=submit]"`. For non-htmx buttons,
  set `aria-busy="true"`. For a slow region, show `.spinner` with a
  short label.
- **Disabled**: use `disabled` on controls, and `aria-disabled="true"`
  on links such as the pager ends. Don't hide controls that are only
  temporarily unavailable.

## 7. Feedback

| Component | What it's for | Where | Lifetime |
|---|---|---|---|
| **Flash** (`.flash`) | The result of the action just taken: "Budget updated" | App header, `#flash` region | Stays until dismissed (×) or replaced by the next flash |
| **Alert** (`.alert`) | A condition of the page or its data: "Auto-categorization unavailable" | In the page, above the content it concerns | As long as the condition holds |
| **Field error** (`.field-error` + `aria-invalid`) | A specific input is wrong | Under the control | Until the form is resubmitted |
| **Confirm dialog** | Ask before a destructive action | Modal | Until answered |

Kinds use the same names everywhere: `success`, `info` (the default,
needs no class), `warning`, `danger`.

### Flash messages

The page renders the region once, in the app header, and it stays in
the DOM. Mutation responses replace only its **contents**, out-of-band:

```html
<!-- in the app header, rendered with every full page -->
<div id="flash" class="flash-region" role="status" aria-live="polite"></div>

<!-- in a mutation response -->
<div id="flash" hx-swap-oob="innerHTML">
  <div class="flash success">
    {icon}<span>Budget updated</span>
    <button type="button" class="dismiss" data-dismiss aria-label="Dismiss">×</button>
  </div>
</div>
```

Use `innerHTML`, not `outerHTML`. Screen readers announce changes inside
an existing live region, but often stay silent when the whole region is
replaced. Keep the region rendered (never `hidden` or `display: none`).
On phones an empty region, even one holding only whitespace, adds no
header row.

Keep the message short and past tense ("Account created", "3 transactions
skipped as duplicates"). Errors that need explanation belong in an
alert, not a flash.

### Alerts

```html
<div class="alert warning">{icon}<div><strong>Title (optional)</strong><span>Explanation, with a link to fix it.</span></div></div>
```

### Confirm dialog

`design.js` provides a styled native `<dialog>`. With htmx, templates
keep using `hx-confirm` and the dialog replaces the browser prompt:

```html
<button class="ghost icon danger-text" aria-label="Delete"
        hx-delete="/ui/budgets/3" hx-target="closest tr" hx-swap="outerHTML"
        hx-confirm="The Groceries budget will be removed. Transactions are not affected."
        data-confirm-title="Delete budget?" data-confirm-label="Delete">{trash icon}</button>
```

Without htmx, use `data-confirm="…"` on any link or button, including
submit buttons. From script, `await design.confirm(message, {title,
label, tone})` returns `true` or `false`.

- **Title**: a question naming the action ("Delete budget?").
- **Message**: the consequence, especially what is *not* affected.
- **Confirm label**: the verb ("Delete"), never "OK". Its tone is
  `danger` by default; use `data-confirm-tone="primary"` for
  non-destructive confirmations.
- Cancel has focus by default, and Esc cancels. If `design.js` isn't
  loaded, the browser's `confirm()` is used.

## 8. Theme

All values come from tokens in `design.css` (see the Foundations demo
page).

- **Colour**: every colour comes from semantic tokens
  (`--color-surface`, `--color-text-muted`, `--color-accent`, …), never
  raw values, so themes and dark mode work everywhere. A theme sets
  about a dozen **core** tokens (background, surface, sunken surface,
  border, text, muted text, accent, success, warning, danger, and the
  text colours on accent and danger buttons). `design.css` **derives**
  the rest (hover, strong border, soft backgrounds for alerts and
  badges, link colour, status text) with `color-mix()`, so a theme
  can't miss a token. Status colours: success, warning and danger.
- **Themes**: `themes.css` has 14 themes; the default gray/blue is built
  into `design.css`. Choose one per app with `<html data-theme="…">`.
  Every theme defines light and dark values and meets WCAG AA contrast
  for text, muted text, button text, links and status text in both
  modes.
- **Type**: Inter for UI and JetBrains Mono for code and IDs, both
  self-hosted. Body and controls are 14px (`--text-base`). Page titles
  are 24px, section titles 18px, metadata 13px, badges and table headers
  12px. Numbers use tabular figures (`.num`, and on by default in
  tables).
- **Spacing**: `--space-1` to `--space-8` (4, 8, 12, 16, 24, 32, 48 and
  64px). Spacing between page blocks is 24px; within a group it's 12–16px.
- **Shape**: radius 6px for controls and 10px for cards and dialogs.
  Elevation is subtle: cards get `--shadow-sm`, and `--shadow-lg` is only
  for dialogs and sticky bars.
- **Light / dark**: automatic from the system setting. To force it, set
  `<html data-mode="dark">` or `data-mode="light"`. This is separate from
  the theme, so any theme can be shown in either mode.
- **Icons**: inline SVG, 24×24 viewBox, `stroke="currentColor"`,
  stroke width 2, sized by context (1rem in buttons and nav). Lucide
  (ISC licence) is a good source; copy the individual icons you need
  rather than adding a dependency.

## 9. Layout helpers

For arranging things inside a page, reach for these before writing CSS:

| Class | Does | Gap |
|---|---|---|
| `.stack` | Vertical column of children | `--gap`, default 16px |
| `.cluster` | Horizontal wrapping row, items centred | default 8px |
| `.split` | Row with the ends pushed apart: title left, actions right | default 12px |
| `.grid` | Responsive equal columns, min width `--min` (16rem) | default 16px |
| `.with-aside` | Main column plus a side column that wraps under on narrow screens | default 24px |

Set the gap with `.gap-1` … `.gap-6`, or `style="--gap: var(--space-2)"`,
on the primitive itself. Each primitive sets its own default, so a gap
set on an outer container never leaks into nested ones.
Utilities like `.muted`, `.small`, `.num`, `.mono`, `.truncate`,
`.nowrap` and `.visually-hidden` are for one-off text tweaks. If you're
stacking several utilities on one element, it probably wants to be a
component.

## 10. Phones and touch

Same pages, same URLs, one stylesheet. The layout adapts below 48rem
(phones), and controls grow on touch screens. Firefox for Android is the
main mobile browser to test.

### What changes on a phone

- **The page scrolls, not `<main>`.** This lets the browser's toolbar
  collapse while scrolling and keeps pull-to-refresh working.
- **The app header sticks to the top.** Flash messages drop to a
  full-width row under the brand.
- **The sidenav becomes a bottom tab bar**: icon above a one-word label,
  fixed to the bottom, clear of the phone's home indicator. It fits about
  five items. Hide secondary groups with `.hide-narrow`, or move them to
  a "More" page. Item counts are hidden.
- **Sticky footer bars** sit just above the tab bar.
- **The toolbar wraps**, and search takes a full row.
- **Inline forms stack**: one field per row, with narrow fields in
  pairs.
- **Grids reflow.** Tiles go to one column, galleries to two, and stats
  to two.

### Touch screens (`pointer: coarse`)

- Buttons and inputs grow to 44px (`--control-height`); small ones to
  36px.
- Inputs, selects and textareas use at least 16px text. Below that, iOS
  Safari zooms the page when a field gets focus.
- Checkboxes and radios grow to 20px.
- Hover-only effects, such as the gallery lift, are limited to
  `@media (hover: hover)`, so they don't stick after a tap.

### Tables on phones

Wide tables don't work on a phone. Pick one of these per table:

1. **`table.responsive`** (the usual choice). Below 40rem each row becomes
   a list item. Line one has the `.primary-cell` on the left and the first
   `.num` cell on the right. The other cells follow on the next line,
   small and muted, wrapping inline. Cells containing inputs take the
   full width, so bulk-edit tables work too. Add `data-label="Category"`
   to a cell to prefix it with a label (useful for inputs and ambiguous
   values). Put `.hide-narrow` on the `th` and `td` of columns that
   don't matter on a phone.
2. **Horizontal scroll** (`.card.scroll-x`) for tables whose columns
   only make sense side by side.
3. **A different view.** Render the collection as a list or tile view
   when it reads better that way.

```html
<table class="responsive">
  <thead><tr><th>Date</th><th class="hide-narrow">Description</th><th>Merchant</th><th class="num">Amount</th></tr></thead>
  <tbody>
    <tr><td>2026-11-21</td><td class="hide-narrow">TRADER JOES #552</td>
        <td class="primary-cell">Trader Joe's</td><td class="num">$84.12</td></tr>
  </tbody>
</table>
```

### Viewport and keyboard

Use this viewport tag in every page:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

`viewport-fit=cover` lets the header and tab bar extend under the
notch and home indicator; the CSS pads them with `env(safe-area-inset-*)`.
Don't set `interactive-widget`. With the default (`resizes-visual`, in
both Firefox and Chrome on Android), the on-screen keyboard covers the
tab bar instead of pushing it up into the page.

### Helpers

- `.hide-narrow` hides an element on phones.
- `.show-narrow` shows an element only on phones.


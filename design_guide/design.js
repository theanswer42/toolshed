/*
 * design.js — optional behaviour for design.css
 * version: 0.2.0
 *
 * No dependencies. Load with <script src=".../design.js" defer></script>.
 * Everything here works with or without htmx.
 *
 *  1. Dismissible flash messages: any element with [data-dismiss] removes
 *     its closest `.flash` (or the selector given as its value) on click.
 *  2. Confirm dialog: a styled <dialog> that replaces the browser confirm().
 *     - htmx:  hx-confirm="Delete this budget?"          (no change to templates)
 *     - plain: data-confirm="Delete this budget?"        (links, buttons, submit buttons)
 *     Optional attributes on the same element:
 *       data-confirm-title="Delete budget"   heading (default: "Are you sure?")
 *       data-confirm-label="Delete"          confirm button text (default: "Confirm")
 *       data-confirm-tone="primary"          confirm button style (default: "danger")
 *     From script: design.confirm("Message", {title, label, tone}) → Promise<boolean>
 *  3. Current nav link: marks the .sidenav link matching the current URL with
 *     aria-current="page", on load and after htmx history changes
 *     (push, replace, back/forward).
 */
(function () {
  "use strict";

  /* ---------- 1. Flash dismiss ---------- */
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-dismiss]");
    if (!btn) return;
    var target = btn.closest(btn.getAttribute("data-dismiss") || ".flash");
    if (target) target.remove();
  });

  /* ---------- 2. Confirm dialog ---------- */
  var dialog = null;

  function buildDialog() {
    dialog = document.createElement("dialog");
    dialog.className = "confirm";
    dialog.setAttribute("aria-labelledby", "confirm-title");
    dialog.setAttribute("aria-describedby", "confirm-message");
    dialog.innerHTML =
      '<form method="dialog">' +
      '<div class="dialog-body">' +
      '<h2 id="confirm-title"></h2>' +
      '<p id="confirm-message"></p>' +
      "</div>" +
      '<div class="dialog-actions">' +
      '<button value="cancel" autofocus>Cancel</button>' +
      '<button value="ok" data-role="ok"></button>' +
      "</div>" +
      "</form>";
    document.body.appendChild(dialog);
    return dialog;
  }

  function confirmDialog(message, opts) {
    opts = opts || {};
    if (typeof HTMLDialogElement !== "function") {
      return Promise.resolve(window.confirm(message));
    }
    var d = dialog || buildDialog();
    d.querySelector("#confirm-title").textContent = opts.title || "Are you sure?";
    d.querySelector("#confirm-message").textContent = message;
    var ok = d.querySelector('[data-role="ok"]');
    ok.textContent = opts.label || "Confirm";
    ok.className = opts.tone || "danger";
    d.returnValue = "";
    return new Promise(function (resolve) {
      d.addEventListener("close", function onClose() {
        d.removeEventListener("close", onClose);
        resolve(d.returnValue === "ok");
      });
      d.showModal();
    });
  }

  function optsFrom(el) {
    return {
      title: el.getAttribute("data-confirm-title"),
      label: el.getAttribute("data-confirm-label"),
      tone: el.getAttribute("data-confirm-tone"),
    };
  }

  // htmx: intercept hx-confirm and show our dialog instead of window.confirm
  document.addEventListener("htmx:confirm", function (e) {
    if (!e.detail.question) return;
    e.preventDefault();
    confirmDialog(e.detail.question, optsFrom(e.detail.elt)).then(function (yes) {
      if (yes) e.detail.issueRequest(true);
    });
  });

  // Plain HTML: [data-confirm] on links, buttons and submit buttons
  var HX_REQUEST = "[hx-get],[hx-post],[hx-put],[hx-patch],[hx-delete]";

  // True when htmx will issue a request for this click and an hx-confirm
  // (on the element or inherited from an ancestor) already covers it, so
  // the htmx:confirm handler above shows the one and only dialog.
  function htmxWillConfirm(el) {
    var source = el.matches(HX_REQUEST) ? el
      : (el.form && el.form.matches(HX_REQUEST) && el.matches("button:not([type]), [type=submit]")) ? el.form
      : null;
    return !!(source && source.closest("[hx-confirm]"));
  }

  document.addEventListener(
    "click",
    function (e) {
      var el = e.target.closest("[data-confirm]");
      if (!el || htmxWillConfirm(el)) return;
      if (el.dataset.confirmed === "1") {
        delete el.dataset.confirmed;
        return; // let the re-dispatched click through
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      confirmDialog(el.getAttribute("data-confirm"), optsFrom(el)).then(function (yes) {
        if (!yes) return;
        el.dataset.confirmed = "1";
        try {
          el.click();
        } finally {
          // If the click didn't dispatch (e.g. the element was disabled in
          // the meantime) the flag must not linger and skip the next confirm.
          delete el.dataset.confirmed;
        }
      });
    },
    true
  );

  /* ---------- 3. Current nav link ---------- */
  // Longest-prefix match, so /ui/budgets/3/edit still highlights "Budgets".
  // A root link ("/") only matches the root itself. Fragment-only and
  // other-origin links never match. If nothing matches, the
  // server-rendered aria-current is left alone.
  function markCurrentNav() {
    var here = window.location;
    var path = here.pathname.replace(/\/$/, "");
    var links = document.querySelectorAll(".sidenav a");
    var best = null, bestLen = -1;
    links.forEach(function (a) {
      var target = a.getAttribute("data-path") || a.getAttribute("href") || a.getAttribute("hx-get");
      if (!target || target.charAt(0) === "#") return;
      var url = new URL(target, here.href);
      if (url.origin !== here.origin) return;
      var p = url.pathname.replace(/\/$/, "");
      var matches = p === "" ? path === "" : (path === p || path.indexOf(p + "/") === 0);
      if (matches && p.length > bestLen) {
        best = a;
        bestLen = p.length;
      }
    });
    if (!best) return;
    links.forEach(function (a) {
      if (a === best) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }
  document.addEventListener("DOMContentLoaded", markCurrentNav);
  ["htmx:pushedIntoHistory", "htmx:replacedInHistory", "htmx:historyRestore"].forEach(function (ev) {
    document.addEventListener(ev, markCurrentNav);
  });
  window.addEventListener("popstate", markCurrentNav);

  window.design = { confirm: confirmDialog };
})();

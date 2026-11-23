/*
 * demo.js — fake interactions for the demo pages only.
 * Real apps do these things with htmx and server-rendered fragments.
 * Do not copy this file into apps.
 */
(function () {
  "use strict";
  var root = document.documentElement;

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) { return null; }
  }

  /* Theme: auto → light → dark */
  var themes = ["auto", "light", "dark"];
  function applyTheme(t) {
    if (t === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", t);
    document.querySelectorAll("[data-demo-theme] .label").forEach(function (l) { l.textContent = t; });
  }
  var theme = store("demo-theme") || "auto";
  applyTheme(theme);

  /* Accent hue */
  var hue = store("demo-hue");
  if (hue) root.style.setProperty("--accent-hue", hue);

  document.addEventListener("DOMContentLoaded", function () {
    applyTheme(theme);
    var slider = document.querySelector("[data-demo-hue]");
    if (slider) {
      var out = document.querySelector("[data-demo-hue-value]");
      slider.value = hue || getComputedStyle(root).getPropertyValue("--accent-hue").trim();
      if (out) out.textContent = slider.value;
      slider.addEventListener("input", function () {
        root.style.setProperty("--accent-hue", slider.value);
        if (out) out.textContent = slider.value;
        store("demo-hue", slider.value);
      });
    }
  });

  var icons = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
    danger: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
  };

  function flash(kind, message) {
    var region = document.getElementById("flash");
    if (!region) return;
    // Mirrors what the server sends: the region is replaced with one message.
    region.innerHTML =
      '<div class="flash ' + kind + '">' + icons[kind] +
      "<span></span>" +
      '<button type="button" class="dismiss" data-dismiss aria-label="Dismiss">×</button></div>';
    region.querySelector("span").textContent = message;
  }

  document.addEventListener("click", function (e) {
    var el;

    if ((el = e.target.closest("[data-demo-theme]"))) {
      theme = themes[(themes.indexOf(theme) + 1) % themes.length];
      store("demo-theme", theme === "auto" ? null : theme);
      applyTheme(theme);
      return;
    }

    if ((el = e.target.closest("[data-demo-flash]"))) {
      var parts = el.getAttribute("data-demo-flash").split("|");
      flash(parts[0], parts[1]);
      return;
    }

    // View switcher: <div class="segmented" data-demo-views="collection-id">
    if ((el = e.target.closest("[data-demo-views] [data-view]"))) {
      e.preventDefault();
      var group = el.closest("[data-demo-views]");
      group.querySelectorAll("[data-view]").forEach(function (b) {
        b.setAttribute("aria-pressed", b === el ? "true" : "false");
      });
      var container = document.getElementById(group.getAttribute("data-demo-views"));
      container.querySelectorAll(":scope > [data-view-pane]").forEach(function (p) {
        p.hidden = p.getAttribute("data-view-pane") !== el.getAttribute("data-view");
      });
      return;
    }

    // In-place edit: swap display cell ↔ edit cell
    if ((el = e.target.closest("[data-demo-edit]"))) {
      var row = el.closest("tr");
      row.classList.add("is-editing");
      row.querySelector("[data-display]").hidden = true;
      row.querySelector("[data-editor]").hidden = false;
      row.querySelector("[data-editor] input").focus();
      return;
    }
    if ((el = e.target.closest("[data-demo-edit-cancel], [data-demo-edit-save]"))) {
      e.preventDefault();
      var r = el.closest("tr");
      var input = r.querySelector("[data-editor] input");
      if (el.hasAttribute("data-demo-edit-save")) {
        r.querySelector("[data-display]").textContent = "$" + Number(input.value).toFixed(2);
        flash("success", "Budget updated");
      }
      r.classList.remove("is-editing");
      r.querySelector("[data-display]").hidden = false;
      r.querySelector("[data-editor]").hidden = true;
      return;
    }

    // Delete row (runs only after the design.js confirm dialog says yes)
    if ((el = e.target.closest("[data-demo-delete]"))) {
      e.preventDefault();
      el.closest("tr, li").remove();
      flash("success", el.getAttribute("data-demo-delete") || "Deleted");
      return;
    }

    // Busy state
    if ((el = e.target.closest("[data-demo-busy]"))) {
      e.preventDefault();
      el.setAttribute("aria-busy", "true");
      setTimeout(function () { el.removeAttribute("aria-busy"); }, 1500);
      return;
    }

    if ((el = e.target.closest("[data-demo-confirm-js]"))) {
      window.design
        .confirm("This will archive 3 albums. You can restore them later.", {
          title: "Archive albums?", label: "Archive", tone: "primary",
        })
        .then(function (yes) { flash(yes ? "success" : "info", yes ? "Albums archived" : "Cancelled"); });
      return;
    }
  });

  // Fake form submits: show a flash instead of navigating
  document.addEventListener("submit", function (e) {
    var form = e.target.closest("[data-demo-submit]");
    if (!form) return;
    e.preventDefault();
    flash("success", form.getAttribute("data-demo-submit"));
  });
})();

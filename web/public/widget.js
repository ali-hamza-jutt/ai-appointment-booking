/*
 * BookWise booking widget.
 *
 *   <script src="https://YOUR-BOOKWISE-HOST/widget.js" data-business="your-slug" async></script>
 *
 * Adds a "Book now" button that opens the business's booking page in a
 * frame. The frame keeps its own session and styles apart from this page;
 * the only message it sends here is a request to close.
 *
 * Optional attributes: data-label (button text), data-color (#rrggbb).
 */
(function () {
  "use strict";

  var script = document.currentScript;

  if (!script || window.__bookwiseWidget) return;
  window.__bookwiseWidget = true;

  var slug = script.getAttribute("data-business");

  if (!slug) {
    console.warn("BookWise widget: add data-business=\"your-booking-link\" to the script tag.");
    return;
  }

  var origin = new URL(script.src, window.location.href).origin;
  var label = script.getAttribute("data-label") || "Book now";
  var color = /^#[0-9a-f]{6}$/i.test(script.getAttribute("data-color") || "") ? script.getAttribute("data-color") : "#0f766e";
  var frame = null;
  var isOpen = false;

  var button = document.createElement("button");

  button.type = "button";
  button.textContent = label;
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  button.style.cssText = [
    "position:fixed",
    "right:20px",
    "bottom:20px",
    "z-index:2147483000",
    "padding:12px 20px",
    "border:0",
    "border-radius:999px",
    "background:" + color,
    "color:#fff",
    "font:600 15px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
    "box-shadow:0 8px 24px rgba(15,23,42,.25)",
    "cursor:pointer",
  ].join(";");

  function place() {
    if (!frame) return;

    var small = window.innerWidth < 520;

    frame.style.cssText = [
      "position:fixed",
      "z-index:2147483001",
      "border:0",
      "background:#fff",
      "box-shadow:0 16px 48px rgba(15,23,42,.3)",
      small ? "inset:0;width:100%;height:100%;border-radius:0" : "right:20px;bottom:84px;width:400px;height:min(680px,calc(100vh - 110px));border-radius:16px",
      "display:" + (isOpen ? "block" : "none"),
    ].join(";");
  }

  function open() {
    if (!frame) {
      frame = document.createElement("iframe");
      frame.src = origin + "/embed/" + encodeURIComponent(slug);
      frame.title = "Book an appointment";
      frame.setAttribute("allow", "payment");
      document.body.appendChild(frame);
    }

    isOpen = true;
    place();
    button.setAttribute("aria-expanded", "true");
    frame.focus();
  }

  function close() {
    isOpen = false;
    place();
    button.setAttribute("aria-expanded", "false");
    button.focus();
  }

  button.addEventListener("click", function () {
    if (isOpen) close();
    else open();
  });

  // Only messages from our own frame count.
  window.addEventListener("message", function (event) {
    if (!frame || event.origin !== origin || event.source !== frame.contentWindow) return;
    if (event.data && event.data.type === "bookwise:close") close();
  });

  document.addEventListener("keydown", function (event) {
    if (isOpen && event.key === "Escape") close();
  });

  window.addEventListener("resize", place);

  function mount() {
    document.body.appendChild(button);
  }

  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();

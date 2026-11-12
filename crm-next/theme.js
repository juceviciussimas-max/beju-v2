/* Applies the saved look before the first paint (CSP allows no inline script). crm.js owns the picker. */
(function () {
  var MODE = { frost: "light", graphite: "dark", forest: "dark", ocean: "dark", sunset: "dark" }, t = null, m = null;
  try { t = localStorage.getItem("beju-crm-look"); m = localStorage.getItem("beju-crm-motion"); } catch (e) {}
  if (!MODE[t]) t = "frost";
  var h = document.documentElement;
  h.dataset.theme = t; h.dataset.mode = MODE[t]; h.dataset.motion = m === "calm" ? "calm" : "full";
})();

// markers/panel.js — левая выпадающая панель «Markers» (оболочка).
// Сами разделы живут в отдельных файлах (places.js, ...) и передаются в sections;
// стили: public/styles/markers/panel.css (оболочка) + public/styles/markers/<раздел>.css (каждый раздел).

/**
 * @param {object} deps
 * @param {HTMLElement} deps.toggle   кнопка «Markers»
 * @param {HTMLElement} deps.panel    выпадающая панель
 * @param {Array<{id: string}>} [deps.sections]  подключённые разделы (результаты createXxxSection)
 */
export function createMarkers({ toggle, panel, sections = [] }) {
  if (!toggle || !panel) return null;

  toggle.addEventListener('click', function () {
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  });

  // разделы-аккордеоны внутри панели (по умолчанию свёрнуты)
  panel.querySelectorAll('.side-head').forEach(function (h) {
    h.addEventListener('click', function () {
      const open = h.getAttribute('aria-expanded') !== 'true';
      h.setAttribute('aria-expanded', String(open));
      const body = document.getElementById(h.getAttribute('aria-controls'));
      if (body) body.hidden = !open;
    });
  });

  return { sections };
}

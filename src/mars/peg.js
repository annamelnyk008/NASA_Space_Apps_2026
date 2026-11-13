// mars/peg.js — «человечек» / peg
/**
 * @param {object} deps
 */
export function createPeg(deps) {
  const {
    pegBtn,
    pegGhost,
    marsHint,
    getMarsHintText,
    getMode,
    getTransitioning,
    renderer,
    setHomeArmed,
    getHomeArmed,
    pickMars,
    placePin,
    clearPin
  } = deps;

  let pegDrag = null;
  let pegArmed = false;

  function setArmed(on) {
    pegArmed = on;
    if (on && getHomeArmed()) setHomeArmed(false);
    pegBtn.setAttribute('aria-pressed', String(on));
    if (marsHint) {
      marsHint.textContent = on
        ? 'Click a spot to drop a pin, then press “Land here” · click elsewhere to move the pin'
        : getMarsHintText();
    }
    if (!on) clearPin();
    if (getMode() === 'mars') renderer.domElement.style.cursor = on ? 'crosshair' : 'grab';
  }

  function getPegArmed() {
    return pegArmed;
  }

  function pegEnd() {
    pegDrag = null;
    pegGhost.hidden = true;
    pegGhost.classList.remove('over');
  }

  pegBtn.addEventListener('pointerdown', function (e) {
    if (getMode() !== 'mars' || getTransitioning()) return;
    e.preventDefault();
    pegDrag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false };
    try {
      pegBtn.setPointerCapture(e.pointerId);
    } catch (err) { /* ignore */ }
  });

  pegBtn.addEventListener('pointermove', function (e) {
    if (!pegDrag || e.pointerId !== pegDrag.id) return;
    if (!pegDrag.moved && Math.hypot(e.clientX - pegDrag.x0, e.clientY - pegDrag.y0) > 8) {
      pegDrag.moved = true;
      pegGhost.hidden = false;
      setArmed(false);
    }
    if (pegDrag.moved) {
      pegGhost.style.transform = 'translate(' + (e.clientX - 14) + 'px,' + (e.clientY - 38) + 'px)';
      pegGhost.classList.toggle('over', !!pickMars(e.clientX, e.clientY));
    }
  });

  pegBtn.addEventListener('pointerup', function (e) {
    if (!pegDrag || e.pointerId !== pegDrag.id) return;
    const d = pegDrag;
    pegEnd();
    if (d.moved) {
      const hit = pickMars(e.clientX, e.clientY);
      if (hit) {
        setArmed(true);
        placePin(hit.lon, hit.lat);
      }
    } else {
      setArmed(!pegArmed);
    }
  });

  pegBtn.addEventListener('pointercancel', pegEnd);
  pegBtn.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setArmed(!pegArmed);
    }
  });

  const cv = renderer.domElement;
  const homeDown = { x: 0, y: 0 }; // shared with home click guard; home module also sets it
  cv.addEventListener('pointerdown', function (e) {
    homeDown.x = e.clientX;
    homeDown.y = e.clientY;
  });
  cv.addEventListener('click', function (e) {
    if (getMode() !== 'mars' || !pegArmed || getTransitioning()) return;
    if (Math.hypot(e.clientX - homeDown.x, e.clientY - homeDown.y) > 6) return;
    const hit = pickMars(e.clientX, e.clientY);
    if (hit) placePin(hit.lon, hit.lat);
  });

  return {
    setArmed,
    getPegArmed,
    pegDrag: () => pegDrag,
    pegGhost
  };
}

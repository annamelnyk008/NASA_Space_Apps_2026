// surface/music.js
export function createSurfaceMusic() {
  let audio = null;

  function load(src) {
    if (audio) {
      audio.pause();
      audio.src = '';
    }

    audio = new Audio(src);
    audio.loop = true;
    audio.volume = 0.05;
    audio.preload = 'auto';
  }

  async function play() {
    if (!audio) return;

    try {
      await audio.play();
    } catch (err) {
      console.warn('Surface music playback was blocked:', err);
    }
  }

  function stop() {
    if (!audio) return;

    audio.pause();
    audio.currentTime = 0;
  }

  function setVolume(value) {
    if (audio) {
      audio.volume = Math.max(0, Math.min(1, value));
    }
  }

  function destroy() {
    if (!audio) return;

    audio.pause();
    audio.src = '';
    audio.load();
    audio = null;
  }

  return {
    load,
    play,
    stop,
    setVolume,
    destroy
  };
}
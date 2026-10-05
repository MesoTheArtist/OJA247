// Draws Google's "Continue with Google" button so it fits the space it's in.
//
// Google's renderButton() only accepts a width in pixels (no "100%"), between
// 200 and 400. A fixed 320 overflows the card on very small phones, so the
// width is measured from the container instead, and redrawn if the screen
// size changes (rotating a phone, resizing a window).

const MIN_WIDTH = 200; // Google ignores anything narrower
const MAX_WIDTH = 400; // ...and anything wider
const FALLBACK_WIDTH = 320;

export function fitGoogleButtonWidth(container) {
  const available =
    container?.clientWidth || container?.parentElement?.clientWidth || FALLBACK_WIDTH;
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.floor(available)));
}

// Renders the button into `container` and keeps it fitted. Returns a cleanup
// function for the caller's useEffect. `options` are the usual renderButton
// options (theme, size, text); width is worked out here.
export function renderGoogleButton(container, options = {}) {
  if (!container || !window.google?.accounts?.id) return () => {};

  let lastWidth = 0;
  let timer;

  const draw = () => {
    const width = fitGoogleButtonWidth(container);
    if (width === lastWidth) return; // nothing changed, skip the flicker
    lastWidth = width;
    container.innerHTML = "";
    window.google.accounts.id.renderButton(container, { ...options, width });
  };

  const onResize = () => {
    clearTimeout(timer);
    timer = setTimeout(draw, 150);
  };

  draw();
  window.addEventListener("resize", onResize);

  return () => {
    clearTimeout(timer);
    window.removeEventListener("resize", onResize);
  };
}
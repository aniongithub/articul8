/**
 * A procedural curve painted across a row — a *function* channel (automation
 * curve, LFO, generator) rather than stored keyframes. The control stays
 * oblivious to what the function means: it is handed a pure `sample(t)` plus the
 * amplitude domain to map values into the lane, and it draws the trace across
 * the visible window using its own transform (so zoom, scroll and resize come
 * for free). The horizontal extent is bounded to `[domainStart, domainEnd]` so a
 * curve hard-starts at its origin instead of bleeding across the scroll width.
 *
 * Rendering is screen-space per-column min/max: a few sub-samples per pixel
 * column are reduced to their extremes, so a fast signal zoomed out shows its
 * envelope (audio-waveform style) instead of aliasing, while a slow signal
 * zoomed in collapses onto a clean line.
 */
export interface TimelineRowCurve {
  /** The signal: a parameter → value. `undefined`/non-finite samples are skipped. */
  sample: (t: number) => number | undefined;
  /** Amplitude domain mapped to the lane's vertical extent (min at the bottom). */
  min: number;
  max: number;
  /** Horizontal bounds in value units; outside this the curve is not drawn. */
  domainStart?: number;
  domainEnd?: number;
  /** Stroke colour of the trace. */
  color?: string;
  /** Stroke thickness in px (default 1.5). */
  thickness?: number;
  /** Opacity of the filled envelope under the trace (default 0.22, 0 to disable). */
  fillAlpha?: number;
}

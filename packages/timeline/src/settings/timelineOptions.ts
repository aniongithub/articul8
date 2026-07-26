import { TimelineRowStyle } from './styles/timelineRowStyle';
import { TimelineStyle } from './styles/timelineStyle';
import { TimelineRanged } from '../models/timelineRanged';

export interface TimelineOptions extends TimelineRanged {
  /**
   * Id or HTMLElement of the timeline container.
   */
  id?: string | HTMLElement | null;
  /**
   * Check whether snapping is enabled.
   */
  snapEnabled?: boolean;
  /**
   *  Snap all selected keyframes as one bundle during the drag.
   */
  snapAllKeyframesOnMove?: boolean;
  /**
   * Approximate step for the timeline in pixels for 1 second
   */
  stepPx?: number;
  /**
   * Number of points that should fit into the one stepPx.
   */
  stepVal?: number;
  stepSmallPx?: number;
  /**
   * Snap step in units. from 0 to stepVal
   */
  snapStep?: number;
  /**
   * additional left margin in pixels to start the line gauge from.
   */
  leftMargin?: number;
  /**
   * Component header background color.
   */
  headerFillColor?: string;
  /**
   * Component background color.
   */
  fillColor?: string;
  /**
   * Header labels color.
   */
  labelsColor?: string;
  /**
   * Header gauge tick color.
   */
  tickColor?: string;
  /**
   * Selection rectangle color.
   */
  selectionColor?: string;

  /**
   * Header height in pixels
   */
  headerHeight?: number;
  /**
   * Header ticks font
   */
  font?: string;
  /**
   * Default zoom level = 1. where screen pixels are equals to the corresponding stepVal stepPx.
   */
  zoom?: number;
  /**
   * Default zoom speed.
   */
  zoomSpeed?: number;
  /**
   * Max zoom value.
   */
  zoomMin?: number;
  /**
   * Min zoom value.
   */
  zoomMax?: number;
  /**
   * Set this to true in a MAC OS environment: The Meta key will be used instead of the Ctrl key.
   */
  controlKeyIsMetaKey?: boolean;
  /**
   * Access the scroll container via this class for e.g. scroll bar styling.
   */
  scrollContainerClass?: string;
  /**
   * Default rows style.
   * Can be overridden by setting style individually for each row.
   */
  rowsStyle?: TimelineRowStyle;
  /**
   * Timeline indicator style.
   */
  timelineStyle?: TimelineStyle;

  /**
   * keyframes group is draggable. Default: true
   */
  groupsDraggable?: boolean;
  /**
   * keyframes group is draggable. Default: true
   */
  keyframesDraggable?: boolean;
  /**
   * Timeline can be dragged or position can be changed by user interaction. Default: true
   */
  timelineDraggable?: boolean;

  /**
   * Array of the denominators used to determine 'beautiful' numbers to be rendered for the gauge.
   * Default: [1, 2, 5, 10];
   */
  denominators?: number[];

  /**
   * Format a gauge value into its tick label. The control has no notion of what
   * a value *means* (milliseconds, a coordinate, degrees…) — it just renders the
   * number the host gives it. Supply this to label the axis in the host's unit;
   * when omitted the control falls back to its built-in HMS-from-milliseconds
   * formatting.
   */
  formatUnits?: (val: number) => string;

  /**
   * Quantization step applied to the playhead value when the user scrubs or when
   * it is set programmatically. The control historically rounds time to whole
   * units (a millisecond assumption); on a non-integer axis (a `[0,1]` coordinate,
   * say) that collapses every position onto the integers. Set this to the axis's
   * natural grid — `1` for whole milliseconds, or `0` (or a negative value) to
   * leave the value continuous. Defaults to `1` (whole units) for back-compat.
   */
  timeRounding?: number;
}

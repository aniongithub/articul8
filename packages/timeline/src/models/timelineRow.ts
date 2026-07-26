import { TimelineKeyframe } from './timelineKeyframe';
import { TimelineRowStyle } from '../settings/styles/timelineRowStyle';
import { TimelineRanged } from './timelineRanged';
import { TimelineRowCurve } from './timelineRowCurve';

export interface TimelineRow extends TimelineRanged {
  style?: TimelineRowStyle;
  keyframes?: TimelineKeyframe[] | null;
  /**
   * An optional procedural curve painted across the row (a function channel /
   * automation curve). Independent of `keyframes` — a row may carry either or
   * both. The control samples it across the visible window and draws its trace.
   */
  curve?: TimelineRowCurve;
  hidden?: boolean;
  /**
   * Whether group keyframes are draggable.
   */
  keyframesDraggable?: boolean;
  groupsDraggable?: boolean;
}

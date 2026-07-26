/**
 * The rig the editor edits. For v0 the cat example is the dogfood source — the
 * SAME asset the reference host ships, imported as raw text (Vite `?raw`) so
 * there is exactly one copy on disk. `parseRig` strips JSONC comments; the raw
 * text stays the source of truth for surgical edits later.
 */
import { parseRig, type RigData } from "@articul8/runtime";

import svgText from "../../../examples/cat/public/cat.svg?raw";
import rigText from "../../../examples/cat/public/cat.rig.jsonc?raw";

export const source = { svgText, rigText };
export const data: RigData = parseRig(rigText);

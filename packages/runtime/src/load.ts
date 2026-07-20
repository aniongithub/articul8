import { parse, printParseErrorCode, type ParseError } from "jsonc-parser";
import { type RigData } from "./rig";

/**
 * Parse a rig authored as JSONC — JSON with comments and trailing commas — into
 * the plain `RigData` the runtime consumes. This is the one place comments are
 * allowed to exist and the one place they are stripped: authors (and the agents
 * and editors that will read the rig back) get to explain every keyframe inline,
 * yet the evaluator downstream still sees ordinary data.
 *
 * Kept pure on purpose. The runtime owns no I/O — the caller owns the clock, and
 * the caller owns the fetch. A host reads the document however it likes (network,
 * disk, a string in a test) and hands the text here:
 *
 *     const data = parseRig(await (await fetch("cat.rig.jsonc")).text());
 *
 * Parse errors are collected rather than swallowed: a stray comma or a broken
 * brace throws with the offending offset, so a malformed rig fails loudly at load
 * instead of surfacing as a mysterious `undefined` three layers down.
 */
export function parseRig(text: string): RigData {
  const errors: ParseError[] = [];
  const data = parse(text, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  }) as RigData;
  if (errors.length > 0) {
    const detail = errors
      .map((e) => `${printParseErrorCode(e.error)} at offset ${e.offset}`)
      .join(", ");
    throw new Error(`parseRig: invalid JSONC — ${detail}`);
  }
  return data;
}

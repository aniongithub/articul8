/**
 * Path morphing = componentwise lerp of matched-topology path data. Every morph
 * target must have the same command structure and number ordering as the base.
 */

const NUM_RE = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;

interface ParsedPath {
  /** the path string with numbers replaced by placeholders */
  template: string;
  numbers: number[];
}

function parsePath(d: string): ParsedPath {
  const numbers: number[] = [];
  const template = d.replace(NUM_RE, (m) => {
    numbers.push(parseFloat(m));
    return "\u0000";
  });
  return { template, numbers };
}

/**
 * Blend a base path with weighted morph targets:
 *   d = base + Σ weight_i * (target_i - base)
 * Returns the base unchanged if topology doesn't match (fail-safe).
 */
export function blendPath(
  base: string,
  targets: Record<string, string>,
  weights: Record<string, number>,
): string {
  const activeNames = Object.keys(weights).filter((n) => (weights[n] ?? 0) !== 0 && targets[n]);
  if (activeNames.length === 0) return base;

  const baseP = parsePath(base);
  const parsedTargets: Record<string, ParsedPath> = {};
  for (const name of activeNames) {
    const p = parsePath(targets[name]!);
    if (p.numbers.length !== baseP.numbers.length || p.template !== baseP.template) {
      return base; // topology mismatch — refuse to distort
    }
    parsedTargets[name] = p;
  }

  const out = baseP.numbers.slice();
  for (const name of activeNames) {
    const w = weights[name] ?? 0;
    const tn = parsedTargets[name]!.numbers;
    for (let i = 0; i < out.length; i++) {
      out[i] = out[i]! + w * (tn[i]! - baseP.numbers[i]!);
    }
  }

  let i = 0;
  return baseP.template.replace(/\u0000/g, () => String(round(out[i++]!)));
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

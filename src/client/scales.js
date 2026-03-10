/**
 * Shared scale-mapping functions used by GUI sliders and preset codec.
 *
 * Each pair converts between a real parameter value and a normalized 0..1
 * slider position through a non-linear curve.
 */

// --- Logarithmic scale ---
// `base` controls steepness (higher = more room at the low end).

export function logFromNorm(t, min, max, base) {
  if (base <= 1) return min + t * (max - min);
  return min + (max - min) * (Math.pow(base, t) - 1) / (base - 1);
}

export function normFromLog(value, min, max, base) {
  if (base <= 1) return (value - min) / (max - min);
  return Math.log(1 + (value - min) / (max - min) * (base - 1)) / Math.log(base);
}

// --- Exponential (power-curve) scale ---

export function expFromNorm(t, min, max, power) {
  if (power <= 1) return min + t * (max - min);
  return min + (max - min) * Math.pow(t, power);
}

export function normFromExp(value, min, max, power) {
  if (power <= 1) return (value - min) / (max - min);
  return Math.pow((value - min) / (max - min), 1 / power);
}

/**
 * Preset format version table.
 *
 * Each version defines the ordered list of parameter fields, their encoding,
 * bit widths, ranges, and default values.  The codec uses this to pack and
 * unpack presets.  When parameters change, bump CURRENT_VERSION and add a new
 * entry — old versions remain so legacy URLs still decode.
 *
 * Field encoding types:
 *   'lin'  — linear quantization over [min, max] (continuous)
 *   'int'  — integer parameter: stores (value - min) directly
 *   'log'  — quantized in normalized log-space (needs base)
 *   'bool' — single bit
 *   'color' — 24-bit RGB parsed from hex string
 *   'semitones' — variable-length array (length = current numChimes)
 *   'gradient'  — 3 × 24-bit RGB (bottom, mid, top colors)
 */

export const CURRENT_VERSION = 1;

/**
 * Helper: compute how many bits are needed for `numValues` distinct values.
 */
function bitsFor(numValues) {
  return Math.ceil(Math.log2(numValues));
}

// Version 1 field table.
// Order matters — this defines the bitfield and value packing order.
const V1_FIELDS = [
  // --- Physics: World ---
  { key: 'gravity',             enc: 'lin', bits: 8,  min: -20,    max: 0,      def: -9.81 },
  { key: 'solverIterations',    enc: 'int', bits: 6,  min: 1,      max: 50,    def: 10 },

  // --- Physics: Damping ---
  { key: 'ringDamping',         enc: 'lin', bits: 7,  min: 0,      max: 1,     def: 0.6 },
  { key: 'chimeDamping',        enc: 'lin', bits: 7,  min: 0,      max: 1,     def: 0.05 },
  { key: 'chimeAngularDamping', enc: 'lin', bits: 7,  min: 0,      max: 1,     def: 0.15 },
  { key: 'clapperDamping',      enc: 'lin', bits: 7,  min: 0,      max: 1,     def: 0.03 },

  // --- Physics: Contact ---
  { key: 'chimeFriction',       enc: 'log', bits: 8,  min: 0.001,  max: 1,     base: 5,  def: 0.1 },
  { key: 'chimeRestitution',    enc: 'log', bits: 8,  min: 0.01,   max: 1,     base: 3,  def: 0.35 },
  { key: 'clapperFriction',     enc: 'log', bits: 8,  min: 0.001,  max: 1,     base: 5,  def: 0.1 },
  { key: 'clapperRestitution',  enc: 'log', bits: 8,  min: 0.01,   max: 1,     base: 3,  def: 0.4 },

  // --- Wind ---
  { key: 'windForceScale',      enc: 'log', bits: 8,  min: 0.001,  max: 0.3,   base: 10, def: 0.15 },
  { key: 'windForceCurveExp',   enc: 'log', bits: 8,  min: 0.01,   max: 10,    base: 10, def: 2.5 },
  { key: 'windAmplitudeX',      enc: 'log', bits: 8,  min: 0,      max: 1,     base: 10, def: 1.0 },
  { key: 'windAmplitudeZ',      enc: 'log', bits: 8,  min: 0,      max: 1,     base: 10, def: 1.0 },
  { key: 'windBiasX',           enc: 'lin', bits: 8,  min: -1,     max: 1,     def: 0.25 },
  { key: 'windBiasZ',           enc: 'lin', bits: 8,  min: -1,     max: 1,     def: -0.1 },
  { key: 'windRate',            enc: 'log', bits: 8,  min: 0.001,  max: 5,     base: 10, def: 0.1 },

  // --- Geometry: Ring ---
  { key: 'anchorY',             enc: 'lin', bits: 7,  min: 0.5,    max: 5,     def: 2.85 },
  { key: 'anchorStringLen',     enc: 'lin', bits: 8,  min: 0.1,    max: 2,     def: 0.85 },
  { key: 'ringRadius',          enc: 'lin', bits: 6,  min: 0.05,   max: 0.5,   def: 0.20 },
  { key: 'ringThickness',       enc: 'lin', bits: 7,  min: 0.002,  max: 0.1,   def: 0.02 },
  { key: 'ringMass',            enc: 'lin', bits: 8,  min: 0.05,   max: 2,     def: 0.3 },

  // --- Geometry: Chimes ---
  // numChimes must come before chimeSemitones (decoder reads it first)
  { key: 'numChimes',           enc: 'int', bits: 4,  min: 1,      max: 12,    def: 6 },
  { key: 'chimeRadius',         enc: 'lin', bits: 7,  min: 0.005,  max: 0.1,   def: 0.024 },
  { key: 'chimeBaseHalfLen',    enc: 'lin', bits: 7,  min: 0.05,   max: 0.8,   def: 0.25 },
  { key: 'chimeHalfLenStep',    enc: 'lin', bits: 6,  min: -0.1,   max: 0.2,   def: 0.06 },
  { key: 'chimeBaseMass',       enc: 'lin', bits: 6,  min: 0.005,  max: 0.2,   def: 0.03 },
  { key: 'chimeMassStep',       enc: 'lin', bits: 5,  min: -0.05,  max: 0.1,   def: 0.01 },
  { key: 'chimeBaseStringLen',  enc: 'lin', bits: 8,  min: 0.1,    max: 1.5,   def: 0.55 },
  { key: 'chimeStringLenStep',  enc: 'lin', bits: 6,  min: -0.15,  max: 0.15,  def: -0.03 },

  // --- Geometry: Clapper ---
  { key: 'clapperRadius',       enc: 'lin', bits: 6,  min: 0.02,   max: 0.2,   def: 0.09 },
  { key: 'clapperMass',         enc: 'lin', bits: 6,  min: 0.02,   max: 0.5,   def: 0.12 },
  { key: 'clapperStringLen',    enc: 'lin', bits: 8,  min: 0.2,    max: 2,     def: 0.8 },

  // --- Wind Arrow ---
  { key: 'windArrowVisible',    enc: 'bool', bits: 1, def: true },
  { key: 'windArrowY',          enc: 'lin', bits: 7,  min: -3,     max: 1,     def: -1.3 },
  { key: 'windArrowLength',     enc: 'lin', bits: 8,  min: 0.05,   max: 8,     def: 1.3 },
  { key: 'windArrowWidth',      enc: 'lin', bits: 7,  min: 0.002,  max: 0.1,   def: 0.01875 },
  { key: 'windArrowColor',      enc: 'color', bits: 24, def: '#88ccff' },

  // --- Audio: Tuning ---
  { key: 'baseFreq',            enc: 'lin', bits: 11, min: 100,    max: 2000,  def: 440 },
  { key: 'detuneAmount',        enc: 'lin', bits: 7,  min: 0,      max: 1,     def: 0.10 },
  { key: 'attack',              enc: 'lin', bits: 7,  min: 0.001,  max: 0.1,   def: 0.003 },
  { key: 'decay',               enc: 'lin', bits: 7,  min: 0.1,    max: 10,    def: 2.3 },
  { key: 'maxGain',             enc: 'lin', bits: 7,  min: 0,      max: 1,     def: 0.25 },
  { key: 'masterGain',          enc: 'lin', bits: 7,  min: 0,      max: 1,     def: 0.7 },

  // --- Wind Sound ---
  { key: 'windSoundGain',       enc: 'lin', bits: 8,  min: 0,      max: 2,     def: 0.8 },
  { key: 'windSoundMinGain',    enc: 'lin', bits: 7,  min: 0,      max: 0.5,   def: 0.05 },
  { key: 'windGainFadeIn',      enc: 'lin', bits: 7,  min: 0,      max: 1,     def: 0.33 },
  { key: 'windFilterMinFreq',   enc: 'log', bits: 8,  min: 50,     max: 800,   base: 2,  def: 600 },
  { key: 'windFilterMaxFreq',   enc: 'log', bits: 8,  min: 100,    max: 16000, base: 2,  def: 12000 },
  { key: 'windFilterQ',         enc: 'lin', bits: 8,  min: 0.5,    max: 15,    def: 1.5 },
  { key: 'windFlangerDepth',    enc: 'lin', bits: 8,  min: 0,      max: 0.5,   def: 0.003 },
  { key: 'windFlangerRate',     enc: 'log', bits: 8,  min: 0.005,  max: 2,     base: 2,  def: 0.25 },
  { key: 'windFlangerMix',      enc: 'lin', bits: 6,  min: 0,      max: 0.5,   def: 0.0 },
  { key: 'windFlangerFeedback', enc: 'lin', bits: 8,  min: -0.95,  max: 0.95,  def: 0.6 },

  // --- Rendering ---
  { key: 'enableBokeh',         enc: 'bool', bits: 1, def: false },
  { key: 'bokehFocus',          enc: 'lin', bits: 7,  min: 0.5,    max: 10,    def: 3.0 },

  // --- Sky ---
  { key: 'backgroundColor',     enc: 'color', bits: 24, def: '#001020' },

  // --- Variable-length & compound ---
  { key: 'chimeSemitones', enc: 'semitones', bits: 6, maxItems: 12,
    def: [0, 3, 7, 0, 3, 7, 10, 12, 15, 19] },

  { key: 'skyGradient0', enc: 'gradient', bits: 72,
    def: ['#001020', '#004080', '#88ccff'] },
  { key: 'skyGradient1', enc: 'gradient', bits: 72,
    def: ['#202020', '#400040', '#ff88ff'] },
  { key: 'skyGradient2', enc: 'gradient', bits: 72,
    def: ['#201000', '#403000', '#ffcc88'] },
  { key: 'skyGradient3', enc: 'gradient', bits: 72,
    def: ['#102020', '#304040', '#88ff88'] },
];

export const FORMAT_VERSIONS = {
  1: V1_FIELDS,
};

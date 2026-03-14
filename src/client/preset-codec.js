/**
 * Preset encoder/decoder.
 *
 * Binary format (MSB-first bitstream):
 *   [CRC-16: 16 bits] [version: 8 bits] [bitfield: N bits] [values…] [padding]
 *
 * The CRC-16 covers everything after it (version + bitfield + values + padding).
 * The bitfield has one bit per field in the version's format table: 1 = non-default
 * (value follows), 0 = default (no data stored).  Values are packed sequentially
 * using the bit widths from the format table.
 *
 * The resulting bytes are encoded as base64url (no padding) for URL hashes.
 */

import { CURRENT_VERSION, FORMAT_VERSIONS } from './preset-format.js';
import { normFromLog, logFromNorm } from './scales.js';

// ---------------------------------------------------------------------------
// Bitstream reader / writer
// ---------------------------------------------------------------------------

class BitWriter {
  constructor() {
    this.bytes = [];
    this.cur = 0;
    this.pos = 0; // bits written into cur (0-7)
  }

  write(value, bits) {
    for (let i = bits - 1; i >= 0; i--) {
      this.cur = (this.cur << 1) | ((value >>> i) & 1);
      if (++this.pos === 8) {
        this.bytes.push(this.cur);
        this.cur = 0;
        this.pos = 0;
      }
    }
  }

  finish() {
    if (this.pos > 0) {
      this.bytes.push(this.cur << (8 - this.pos));
    }
    return new Uint8Array(this.bytes);
  }
}

class BitReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.bytePos = 0;
    this.bitPos = 0;
  }

  read(bits) {
    let val = 0;
    for (let i = 0; i < bits; i++) {
      const bit = (this.bytes[this.bytePos] >>> (7 - this.bitPos)) & 1;
      val = (val << 1) | bit;
      if (++this.bitPos === 8) {
        this.bytePos++;
        this.bitPos = 0;
      }
    }
    return val;
  }
}

// ---------------------------------------------------------------------------
// CRC-16-CCITT
// ---------------------------------------------------------------------------

function crc16(data) {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc;
}

// ---------------------------------------------------------------------------
// Base64url (no padding)
// ---------------------------------------------------------------------------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function bytesToBase64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    s += B64[b0 >>> 2];
    s += B64[((b0 & 3) << 4) | (b1 >>> 4)];
    if (i + 1 < bytes.length) s += B64[((b1 & 0xF) << 2) | (b2 >>> 6)];
    if (i + 2 < bytes.length) s += B64[b2 & 0x3F];
  }
  return s;
}

function base64urlToBytes(str) {
  const lut = new Uint8Array(128);
  for (let i = 0; i < 64; i++) lut[B64.charCodeAt(i)] = i;

  const outLen = Math.floor(str.length * 3 / 4);
  const bytes = new Uint8Array(outLen);
  let j = 0;
  for (let i = 0; i < str.length; ) {
    const a = lut[str.charCodeAt(i++)];
    const b = i < str.length ? lut[str.charCodeAt(i++)] : 0;
    const c = i < str.length ? lut[str.charCodeAt(i++)] : 0;
    const d = i < str.length ? lut[str.charCodeAt(i++)] : 0;
    if (j < outLen) bytes[j++] = (a << 2) | (b >>> 4);
    if (j < outLen) bytes[j++] = ((b & 0xF) << 4) | (c >>> 2);
    if (j < outLen) bytes[j++] = ((c & 3) << 6) | d;
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Quantize / dequantize helpers
// ---------------------------------------------------------------------------

function parseColor(hex) {
  return parseInt(hex.slice(1), 16);
}

function formatColor(n) {
  return '#' + n.toString(16).padStart(6, '0');
}

/** Quantize a real value to an integer in [0, maxVal] over [min, max]. */
function quantizeLin(value, min, max, bits) {
  const maxVal = (1 << bits) - 1;
  const t = (value - min) / (max - min);
  return Math.max(0, Math.min(maxVal, Math.round(t * maxVal)));
}

function dequantizeLin(q, min, max, bits) {
  const maxVal = (1 << bits) - 1;
  return min + (q / maxVal) * (max - min);
}

/** Quantize through the log curve used by the GUI sliders. */
function quantizeLog(value, min, max, base, bits) {
  const maxVal = (1 << bits) - 1;
  const norm = normFromLog(value, min, max, base);
  return Math.max(0, Math.min(maxVal, Math.round(norm * maxVal)));
}

function dequantizeLog(q, min, max, base, bits) {
  const maxVal = (1 << bits) - 1;
  return logFromNorm(q / maxVal, min, max, base);
}

// ---------------------------------------------------------------------------
// Read param value from the live params object
// ---------------------------------------------------------------------------

function readParam(params, field) {
  if (field.enc === 'gradient') {
    const idx = parseInt(field.key.replace('skyGradient', ''));
    return params.skyGradients[idx].map(stop => stop.color);
  }
  return params[field.key];
}

// ---------------------------------------------------------------------------
// Quantize a field value to its integer representation
// ---------------------------------------------------------------------------

function quantizeField(value, field) {
  switch (field.enc) {
    case 'lin':   return quantizeLin(value, field.min, field.max, field.bits);
    case 'int': {
      const v = Math.round(value) - field.min;
      return Math.max(0, Math.min((1 << field.bits) - 1, v));
    }
    case 'log':   return quantizeLog(value, field.min, field.max, field.base, field.bits);
    case 'bool':  return value ? 1 : 0;
    case 'color': return parseColor(value);
    case 'semitones': return value.map(v => Math.max(0, Math.min((1 << field.bits) - 1, v)));
    case 'gradient':  return value.map(parseColor);
    default: throw new Error('Unknown encoding: ' + field.enc);
  }
}

function dequantizeField(q, field) {
  switch (field.enc) {
    case 'lin':   return dequantizeLin(q, field.min, field.max, field.bits);
    case 'int':   return q + field.min;
    case 'log':   return dequantizeLog(q, field.min, field.max, field.base, field.bits);
    case 'bool':  return q === 1;
    case 'color': return formatColor(q);
    case 'semitones': return q;  // already an array of ints
    case 'gradient':  return q.map(formatColor);
    default: throw new Error('Unknown encoding: ' + field.enc);
  }
}

// ---------------------------------------------------------------------------
// Check if a field is at its default value (compare quantized)
// ---------------------------------------------------------------------------

function isDefault(params, field, numChimes) {
  const value = readParam(params, field);

  if (field.enc === 'semitones') {
    const defSlice = field.def.slice(0, numChimes);
    const curSlice = value.slice(0, numChimes);
    if (curSlice.length !== defSlice.length) return false;
    for (let i = 0; i < defSlice.length; i++) {
      if (curSlice[i] !== defSlice[i]) return false;
    }
    return true;
  }

  if (field.enc === 'gradient') {
    const colors = value;
    for (let i = 0; i < 3; i++) {
      if (parseColor(colors[i]) !== parseColor(field.def[i])) return false;
    }
    return true;
  }

  const qVal = quantizeField(value, field);
  const qDef = quantizeField(field.def, field);
  return qVal === qDef;
}

// ---------------------------------------------------------------------------
// Encode
// ---------------------------------------------------------------------------

export function encodePreset(params) {
  const fields = FORMAT_VERSIONS[CURRENT_VERSION];
  const numChimes = params.numChimes;

  // Build default flags
  const defaults = fields.map(f => isDefault(params, f, numChimes));

  // Pack payload: version + bitfield + values
  const payload = new BitWriter();
  payload.write(CURRENT_VERSION, 8);

  // Bitfield
  for (let i = 0; i < fields.length; i++) {
    payload.write(defaults[i] ? 0 : 1, 1);
  }

  // Values (non-default only)
  for (let i = 0; i < fields.length; i++) {
    if (defaults[i]) continue;
    const field = fields[i];
    const value = readParam(params, field);

    if (field.enc === 'semitones') {
      const items = value.slice(0, numChimes);
      for (let j = 0; j < numChimes; j++) {
        const v = Math.max(0, Math.min((1 << field.bits) - 1, items[j] || 0));
        payload.write(v, field.bits);
      }
    } else if (field.enc === 'gradient') {
      const colors = value;
      for (let j = 0; j < 3; j++) {
        payload.write(parseColor(colors[j]), 24);
      }
    } else {
      payload.write(quantizeField(value, field), field.bits);
    }
  }

  const payloadBytes = payload.finish();

  // Prepend CRC-16
  const crc = crc16(payloadBytes);
  const full = new Uint8Array(2 + payloadBytes.length);
  full[0] = (crc >>> 8) & 0xFF;
  full[1] = crc & 0xFF;
  full.set(payloadBytes, 2);

  return bytesToBase64url(full);
}

// ---------------------------------------------------------------------------
// Decode — returns { values: Object } on success, or { error: string }
// ---------------------------------------------------------------------------

export function decodePreset(str) {
  let bytes;
  try {
    bytes = base64urlToBytes(str);
  } catch {
    return { error: 'Invalid base64' };
  }

  if (bytes.length < 4) return { error: 'Too short' };

  // Split CRC and payload
  const storedCrc = (bytes[0] << 8) | bytes[1];
  const payloadBytes = bytes.subarray(2);
  const computedCrc = crc16(payloadBytes);
  if (storedCrc !== computedCrc) return { error: 'Checksum mismatch' };

  const reader = new BitReader(payloadBytes);

  // Version
  const version = reader.read(8);
  const fields = FORMAT_VERSIONS[version];
  if (!fields) return { error: 'Unknown version ' + version };

  // Bitfield
  const nonDefault = [];
  for (let i = 0; i < fields.length; i++) {
    nonDefault.push(reader.read(1) === 1);
  }

  // Determine numChimes (needed for semitones length).
  // It's always present in the field list; read its value from the bitfield
  // or fall back to the default.
  const numChimesField = fields.find(f => f.key === 'numChimes');
  let numChimes = numChimesField ? numChimesField.def : 6;

  // Build result from defaults, overriding non-default fields
  const values = {};
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];

    if (!nonDefault[i]) {
      // Use default
      if (field.enc === 'semitones') {
        values[field.key] = field.def.slice(0, numChimes);
      } else if (field.enc === 'gradient') {
        values[field.key] = [...field.def];
      } else {
        values[field.key] = field.def;
      }
    } else {
      // Read from bitstream
      if (field.enc === 'semitones') {
        const items = [];
        for (let j = 0; j < numChimes; j++) {
          items.push(reader.read(field.bits));
        }
        values[field.key] = items;
      } else if (field.enc === 'gradient') {
        const colors = [];
        for (let j = 0; j < 3; j++) {
          colors.push(formatColor(reader.read(24)));
        }
        values[field.key] = colors;
      } else {
        const q = reader.read(field.bits);
        values[field.key] = dequantizeField(q, field);
      }
    }

    // Track numChimes so semitones knows its length
    if (field.key === 'numChimes') {
      numChimes = values.numChimes;
    }
  }

  return { values };
}

// ---------------------------------------------------------------------------
// Decode — returns Object on success, or { error: string }
// ---------------------------------------------------------------------------

export function decodeDefaults()
{
  // Version
  const max_version = CURRENT_VERSION;
	const fields = [];
	for (let version = 1; version <= max_version; version++) {
		fields.push(...FORMAT_VERSIONS[version]);
	}
  if (!fields) return { error: 'Unknown preset format version ' + version };

  // Determine numChimes (needed for semitones length).
  // It's always present in the field list; read its value from the bitfield
  // or fall back to the default.
  const numChimesField = fields.find(f => f.key === 'numChimes');
  let numChimes = numChimesField ? numChimesField.def : 6;

  // Build result from defaults, overriding non-default fields
  const values = {};
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];

		// Use default
		if (field.enc === 'semitones') {
			values[field.key] = field.def.slice(0, numChimes);
		} else if (field.enc === 'gradient') {
			values[field.key] = [...field.def];
		} else {
			values[field.key] = field.def;
		}

    // Track numChimes so semitones knows its length
    if (field.key === 'numChimes') {
      numChimes = values.numChimes;
    }
  }

	return { values };
}

// ---------------------------------------------------------------------------
// Apply decoded values to the live params object
// ---------------------------------------------------------------------------

export function applyPreset(decoded, params) {
	if (decoded['values'] != undefined) {
		decoded = decoded['values'];
	}
  for (const [key, value] of Object.entries(decoded)) {
		if (key === 'chimeSemitones') {
			params['chimeSemitones'] = params['chimeSemitones'] || [];
      //params.chimeSemitones.length = 0;
      value.forEach(v => params.chimeSemitones.push(v));
		} else if (key.startsWith('skyGradient')) {
			params['skyGradients'] = params['skyGradients'] || [];
      const idx = parseInt(key.replace('skyGradient', ''));
      params['skyGradients'][idx] = params.skyGradients[idx] || [];
			for (let j = 0; j < 3; j++) {
				params.skyGradients[idx][j] = { 'color': value[j], 'stop': 0.5 * j };
      }
    } else {
      params[key] = value;
    }
  }
}

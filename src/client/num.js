/* -------------------------------------------------------------------------
//
// num.js
//
// "A collection of utility functions for working with nested iterables in
// JavaScript, inspired by numpy and other array libraries, but without using
// any external dependencies."
//
// (C) 2026 megamoon by Victor M. C. Ondras <un1tz3r0@gmail.com>
//
// Use of this source code is governed by the UNLICENSE license, for complete
// terms, conditions and credible threats, see the LICENSE.md file distributed
// with the code.
//
// ------------------------------------------------------------------------- */


// Check if something is iterable, i.e. can be passed to Array.from()
export function canArrayFrom(x) {
	return typeof x === 'object' && typeof x[Symbol.iterator] === 'function';
}

// return the shape of a nested iterable, optionally checking that all iterables at each depth are of the same size
// e.g. shape([[1, 2], [3, 4]]) => [2, 2]
export function shape(x, checkUniform = true) {
	if (!canArrayFrom(x)) return [];
	const s = [x.length];
	if (s[0] === 0) return s;
	const subShape = shape(x[0], checkUniform);
	s.push(...subShape);
	if (checkUniform) {
		for (const item of x) {
			const itemShape = shape(item, false);
			if (itemShape.length !== subShape.length || !itemShape.every((v, i) => v === subShape[i])) {
				throw new Error(`Non-uniform shape at ${JSON.stringify(item)}: expected ${subShape}, got ${itemShape}`);
			}
		}
	}
	return s;
}

// broadcast a function across nested iterables, applying it to each scalar element and returning a nested array of results with the same shape as the input
export function broadcast(fn, ...args) {
	const argShapes = args.map(arg => shape(arg));
	const maxShape = argShapes.reduce((max, s) => {
		if (s.length > max.length) return s;
		for (let i = 0; i < s.length; i++) {
			if (s[i] > (max[i] || 0)) max[i] = s[i];
		}
		return max;
	}, []);
	function applyAt(shape, ...values) {
		if (shape.length === 0) return fn(...values);
		const [dim, ...restShape] = shape;
		const result = [];
		for (let i = 0; i < dim; i++) {
			const subValues = values.map((v, j) => {
				if (argShapes[j].length > 0 && argShapes[j][0] > i) {
					return v[i];
				} else {
					return v;
				}
			});
			result.push(applyAt(restShape, ...subValues));
		}
		return result;
	}
	return applyAt(maxShape, ...args);
}

// remove dimensions of length 1 from a nested array, e.g. squeeze([[1], [2], [3]]) => [1, 2, 3]
export function squeeze(x) {
	if (!canArrayFrom(x)) return x;
	if (x.length === 1) return squeeze(x[0]);
	return x.map(squeeze);
}

export function flatten(x) {
	if (!canArrayFrom(x)) return [x];
 return x.reduce((acc, item) => acc.concat(flatten(item)), []);
}

export function reshape(x, shape) {
	if (shape.length === 0) return x[0];
	const [dim, ...restShape] = shape;
	const result = [];
	for (let i = 0; i < dim; i++) {
		result.push(reshape(x.slice(i * restShape.reduce((a, b) => a * b, 1), (i + 1) * restShape.reduce((a, b) => a * b, 1)), restShape));
	}
	return result;
}


// Elementwise decorator to make a function which takes scalar arguments and returns a scalar
// also work with iterable arguments, by applying the function to each element and returning an array of results.
// scalar arguments are treated as a single-element iterable. if all of the arguments are scalars, the output will
// be a scalar. if any single input is an iterable, the output will be a one dimensional array. of multiple inputs
// are iterables, then the output will be a nested array with as many dimensions as the number of input dimensions
// e.g. if you pass in a 2D array and a scalar, the output will be a 2D array with the function applied to each
// element of the first array. if you pass in two 2D arrays, the output will be a 4D array where each element is
// the result of applying the function to the corresponding elements of the input arrays, with the first two dimensions
// corresponding to the first input array and the second two dimensions corresponding to the second input array.

export function elementwiseFunc(fn) {
	return function (arg) {
		return (canArrayFrom(arg) ? Array.from(arg).map(fn) : fn(arg));
	}
}

// Simple getter helper to define properties with a function that computes the value on access
function getter(fn) {
	return { get: fn };
}

// add a getter to Function.prototype that returns an elementwise version of the function
Function.prototype.elementwise = getter(function() {
	return elementwiseFunc(this);
});

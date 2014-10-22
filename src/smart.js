/** Smart value parsers
 * $filename: smart.js $
 */

"use strict";

//var debug = require('nor-debug');
var is = require('nor-is');

/** Parse integers */
function parseSmartInt(s) {
	if (/^([0-9]+) *% *$/.test(''+s)) {
		return Math.floor(parseInt(''+s, 10) / 100.0);
	}
	if(/^([0-9]+)$/.test(''+s)) {
		return parseInt(''+s, 10);
	}
}

/** Parse numbers */
function parseSmartNumber(s) {

	if(is.number(s)) {
		return s;
	}

	s = ''+s;

	// Turn numbers like "10,20" to "10.20"
	if(s.indexOf(',') !== -1) {
		s = s.split(',').join('.');
	}

	if (/^([0-9]+(\.[0-9]*)?) *% *$/.test(s)) {
		return parseFloat(s) / 100.0;
	}
	if(/^([0-9]+(\.[0-9]*)?)$/.test(s)) {
		return parseFloat(s);
	}
}

/** Parse percentages */
function parseSmartPercent(s) {
	if(/^([0-9]+([\.,][0-9]*)?)$/.test(''+s)) {
		return parseSmartNumber('' + s + '%');
	}
	return parseSmartNumber(s);
}

// Exports
module.exports = {
	'parseInt': parseSmartInt,
	'parseNumber': parseSmartNumber,
	'parsePercent': parseSmartPercent
};

/* EOF */

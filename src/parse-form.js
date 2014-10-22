/* $filename: parse_form.js $ */

"use strict";

var ARRAY = require('nor-array');
var _Q = require('q');
var tv4 = require('tv4');
var $ = require('jquery');
//var copy = require('nor-data').copy;
var is = require('nor-is');
var debug = require('nor-debug');
var smart = require('./smart.js');

/** Built in type converters */
var converters = {
	'string' : function(x) { return '' + x; },
	'int'    : function(x) { return smart.parseInt(x); },
	'number' : function(x) { return smart.parseNumber(x); },
	'float'  : function(x) { return smart.parseNumber(x); },
	'percent'  : function(x) { return smart.parsePercent(x); },
	'boolean'  : function(x) { return !!(x); }
};

/** Constructor for an instance to indicate this field should be handled like invalid input field */
function FormInputFailed() {
}

/** Returns the keys that failed in JSON Schema */
function collect_failed_keys(data, schema) {
	debug.assert(data).is('object');
	debug.assert(schema).is('object');
	debug.assert(schema.type).is('string');
	debug.assert(schema.properties).is('object');
	var failed_keys = [];

	//debug.log('data = ' , data);
	//debug.log('schema = ' , schema);

	ARRAY(Object.keys(data)).forEach(function(key){
		debug.assert(key).is('string');
		var value = data[key];
		var key_schema = schema.properties[key];
		if(!is.object(key_schema)) {
			debug.warn('No schema for property ' + key);
			return;
		}
		debug.assert(key_schema).is('object');
		var key_result = tv4.validateMultiple(value, key_schema);
		if (!key_result.valid) {
			debug.log('value = ', value);
			debug.log('key_schema = ', key_schema);
			failed_keys.push(key);
		}
	});

	return failed_keys;
}

/** Toggle `input-error` classes on specific properties in `keys` array */
function toggle_error_classes(keys, input_map) {
	debug.assert(keys).is('array');
	debug.assert(input_map).is('object');
	return ARRAY(keys).map(function(key) {
		if(input_map[key]) {
			input_map[key].toggleClass("input-error");
		}
		return key;
	}).valueOf();
}

/** Toggle `input-error` classes on input fields which failed according to the JSON schema */
/*
function toggle_error_classes_by_schema(data, schema, input_map) {
	debug.assert(data).is('object');
	debug.assert(schema).is('object');
	debug.assert(input_map).is('object');

	var result = tv4.validateMultiple(data, schema);
	if(result.valid) {
		return [];
	}

	debug.info('JSON schema validation failed!');
	debug.log('schema =' , schema);
	debug.log('data =' , data);

	return toggle_error_classes(collect_failed_keys(data, schema), input_map);
}
*/

/** Change property value in an object by user defined key
 * @param data {object} The object which will be changed
 * @param key {string} The property name to change which supports sub properties like `"foo.bar"` for `data.foo.bar`
 * @param value {mixed} The new value
 */
function change_property(data, key, value) {
	debug.assert(data).is('object');
	debug.assert(key).is('string');

	var parts = key.split('.');
	var name = parts.pop();
	var obj = parts.reduce(function(prev, curr) {
		if(prev[curr] === undefined ) {
			prev[curr] = {};
		}
		return prev[curr];
	}, data);
	obj[name] = value;
}

/** Convert form values into JavaScript object
 * @param opts.types {object} NoPg object types
 * @param opts.postProcessing {Function|Promise} Called after initial data has been fetched from the form and before JSON schema validation.
 * @returns {object} A promise of the final data object
 */
var parse_form = module.exports = function parse_form(form, opts) {
	opts = opts || {};
	debug.assert(opts).is('object');

	opts.types = opts.types || {};
	debug.assert(opts.types).is('object');

//	var tmp;
	var input_map = {};
	var nopg_type = $(form).attr('data-nopg-type');

	return _Q.fcall(function() {

		var data = {};

		//debug.log('nopg_type = ', nopg_type);

		// Read input elements
		$(form).find('input, select, textarea').each(function handle_input_elements() {
			var id = $(this).attr('id');
			var type = $(this).attr('type');
			var key = $(this).attr('name') || id;
			var value = $(this).val();
			input_map[key] = $(this);

			$(this).removeClass("input-error");

			var default_datatype = 'string';

			if(type === 'checkbox') {
				default_datatype = 'boolean';
				value = $(this).is(':checked');
			}
	
			// Ignore unchecked radio buttons
			if( (type === 'radio') && (!$(this).is(':checked')) ) {
				return;
			}

			var datatype = $(this).attr('data-type') || default_datatype;

			if(typeof converters[datatype] === 'function') {
				value = converters[datatype](value);
			} else {
				value = converters.string(value);
			}

			// Handle object properties
			if(key && (key.indexOf('.') >= 0) ) {
				change_property(data, key, value);
			} else if(key) {
				data[key] = value;
			} else {
				debug.warn('No key detected for value: ', value);
			}
		});

		debug.log('input_map = ', Object.keys(input_map));

		return data;
	}).then(function(data) {

		// User defined custom checks and modifications
		return _Q.when(opts.postProcessing).then(function(postProcessing) {
			if(is.func(postProcessing)) {
				return _Q.when(postProcessing(data)).then(function(tmp) {
					if(tmp === undefined) {
						return data;
					}
					return tmp;
				});
			}
			return data;
		});

	}).then(function(data) {

		// Toggle failed properties
		var failed_keys = ARRAY(Object.keys(data)).filter(function(key) {
			return data[key] instanceof FormInputFailed;
		}).valueOf();

		// JSON schema validation
		if(nopg_type && is.obj(opts.types[nopg_type]) && (opts.types[nopg_type].$schema !== undefined)) {
			//debug.log( "nopg_type = ", nopg_type );
			//debug.log( "opts.types[nopg_type] = ", opts.types[nopg_type] );
			failed_keys = ARRAY(failed_keys).concat(collect_failed_keys(data, opts.types[nopg_type].$schema)).valueOf();
		}

		// FIXME: Implement support for .$validate

		// If we got errors let's abort here.
		if(failed_keys.length !== 0) {
			toggle_error_classes(failed_keys, input_map);
			throw new TypeError("Input parsing failed for keys: " + failed_keys.join(', '));
		}

		return data;
	});
};

/** This can be used for example in the postProcessing to indicate specific field should be handled as failed input */
parse_form.fail = function() {
	return new FormInputFailed();
};

/* EOF */

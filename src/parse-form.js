/* $filename: parse_form.js $ */

"use strict";

var _Q = require('q');
var tv4 = require('tv4');
var $ = require('jquery');
var copy = require('nor-data').copy;
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
		
/** Returns the keys that failed in JSON Schema */
function collect_failed_keys(data, schema) {
	debug.assert(data).is('object');
	debug.assert(schema).is('object');
	debug.assert(schema.type).is('string');
	debug.assert(schema.properties).is('object');
	var failed_keys = [];

	//debug.log('data = ' , data);
	//debug.log('schema = ' , schema);

	Object.keys(data).forEach(function(key){
		debug.assert(key).is('string');
		var value = data[key];
		var key_schema =  schema.properties[key];
		if(!is.object(key_schema)) {
			debug.warn('Warning! No schema for property ' + key);
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

/** Toggle `input-error` classes on input fields which failed according to the JSON schema */
function toggle_error_classes(data, schema, input_map) {
	debug.assert(data).is('object');
	debug.assert(schema).is('object');
	debug.assert(input_map).is('object');

	var result = tv4.validateMultiple(data, schema);
	if(result.valid) {
		return false;
	}
	collect_failed_keys(data, schema).forEach(function(key){
		if(input_map[key]) {
			input_map[key].toggleClass("input-error");
		}
	});
	return true;
}

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

	var tmp;
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
		// JSON schema validation
		if(nopg_type && is.obj(opts.types[nopg_type]) && (opts.types[nopg_type].$schema !== undefined)) {
			//debug.log( "nopg_type = ", nopg_type );
			//debug.log( "opts.types[nopg_type] = ", opts.types[nopg_type] );
			if(toggle_error_classes(data, opts.types[nopg_type].$schema, input_map)) {
				debug.log('schema =' , opts.types[nopg_type].$schema);
				debug.log('data =' , data);
				throw new TypeError("JSON Schema validation failed");
			}
		}
	
		// FIXME: Implement support for .$validate
		
		return data;
	});
};

/* EOF */

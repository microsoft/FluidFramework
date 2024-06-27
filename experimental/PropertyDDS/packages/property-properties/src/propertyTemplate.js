/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview Declaration of the PropertyTemplate module.
 * PropertyTemplate is used to describe a static property.
 */
const { TypeIdHelper } = require("@fluid-experimental/property-changeset");
const { ConsoleUtils } = require("@fluid-experimental/property-common");
const { MSG } = require("@fluid-experimental/property-common").constants;
const _ = require("lodash");
const { cloneDeep: deepCopy } = _;

/**
 * @internal
 */
export class PropertyTemplate {
	/**
	 * Constructor for creating a PropertyTemplate based on the given parameters.
	 * @param {object} in_params - List of parameters
	 * @param {string} in_params.id - id of the property
	 * @param {string} in_params.name - Name of the property
	 * @param {string} in_params.typeid - The type identifier
	 * @param {number=} [in_params.length=1] - The length of the property. Only valid if
	 * the property is an array, otherwise the length defaults to 1
	 * @param {string} in_params.context - The type of property this template represents
	 * i.e. array, hash, etc.
	 * @param {Array.<object>} in_params.properties - List of property templates that
	 * are used to define children properties
	 * @param {Array.<object>} in_params.constants - List of property templates that
	 * are used to define constant properties and their values
	 * @param {Array.<string>} in_params.inherits - List of property template typeids that this
	 * PropertyTemplate inherits from
	 *
	 * @constructor
	 * @protected
	 * @category Properties
	 */
	constructor(in_params = {}) {
		let params = deepCopy(in_params);
		/** The identifier of the property */
		this.id = params.id;
		/** The type identifier of the property */
		this.typeid = params.typeid;

		/** Size of the property (if this is an array) */
		if (params.context === "array") {
			this.length = params.length !== undefined ? params.length : 0;
		} else {
			this.length = 1;
		}
		ConsoleUtils.assert(_.isNumber(this.length), MSG.LENGTH_MUST_BE_NUMBER + this.length);

		/** The context of the property */
		this.context = params.context;

		/** Array with sub-properties */
		this.properties = params.properties;

		/** The annotation object */
		this.annotation = params.annotation || {};

		/** Array with constant properties */
		this.constants = params.constants;

		/** Typeids of properties this property inherits from */
		this.inherits = _.isString(params.inherits) ? [params.inherits] : params.inherits;

		if (_.includes(this.inherits, "Enum")) {
			this._enumDictionary = this._parseEnums(this.properties);
		}
		// check for inlined enums and parse them:
		this._digestNestedInlineEnumProperties(this);
		this._serializedParams = in_params;
	}

	hasNestedProperties() {
		return this.properties && this.properties.length > 0;
	}

	hasNestedConstants() {
		return this.constants && this.constants.length > 0;
	}

	/**
	 * Internal function to recursivly traverse a property template and create dictionaries for found inline enums
	 * @param {{}} in_currentPropertyLevel - The current level in the template hierarchie
	 */
	_digestNestedInlineEnumProperties(in_currentPropertyLevel) {
		if (in_currentPropertyLevel.properties) {
			for (var i = 0; i < in_currentPropertyLevel.properties.length; i++) {
				if (in_currentPropertyLevel.properties[i].typeid === "Enum") {
					var dictionary = this._parseEnums(in_currentPropertyLevel.properties[i].properties);
					in_currentPropertyLevel.properties[i]._enumDictionary = dictionary;
				} else if (in_currentPropertyLevel.properties[i].properties) {
					// call self
					this._digestNestedInlineEnumProperties(in_currentPropertyLevel.properties[i]);
				}
			}
		}
	}

	/**
	 * read the enum types list of a template and create a dictionary [value->enum] and [enum->value] for it
	 * to efficiently lookup enums/values when setting/getting them from the property
	 * @param {Array} in_enumProperties - the list of enums and their values and annotations
	 * @return {{}} a dictionary [value->enum] and [enum->value]
	 */
	_parseEnums(in_enumProperties) {
		var enumDictionary = {
			enumEntriesById: {},
			enumEntriesByValue: {},
			defaultValue: undefined,
		};
		var minValue;
		if (in_enumProperties.length !== 0) {
			minValue = in_enumProperties[0].value;
		}
		for (var i = 0; i < in_enumProperties.length; i++) {
			var enumEntry = in_enumProperties[i];
			var value = enumEntry.value;
			ConsoleUtils.assert(enumEntry.id, MSG.ENUM_TYPEID_MISSING);
			ConsoleUtils.assert(!_.isNaN(enumEntry.value), MSG.ENUM_VALUE_NOT_NUMBER + value);
			enumDictionary.enumEntriesById[enumEntry.id] = {
				value: value,
				annotation: enumEntry.annotation,
			};
			enumDictionary.enumEntriesByValue[value] = {
				id: enumEntry.id,
				annotation: enumEntry.annotation,
			};
			minValue = value < minValue ? value : minValue;
		}

		enumDictionary.defaultValue = enumDictionary.enumEntriesByValue.hasOwnProperty(0)
			? 0
			: minValue;

		return enumDictionary;
	}

	/**
	 * Clones the PropertyTemplate
	 *
	 * @return {property-properties.PropertyTemplate} The cloned template
	 */
	clone() {
		return new PropertyTemplate(deepCopy(this._serializedParams));
	}

	/**
	 * Method used to check whether the template is versioned.
	 * A versioned template is of the form `xxxx-1.0.0`
	 * @return {boolean} Returns true if the template is versioned, false otherwise
	 */
	_isVersioned() {
		var splitTypeId = TypeIdHelper.extractVersion(this.typeid);

		if (!splitTypeId.version) {
			return false;
		}

		var version = splitTypeId.version;

		return /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(version);
	}

	/**
	 * Return the version number of the template.
	 * @return {string} The version string is returned.
	 */
	getVersion() {
		if (this._isVersioned()) {
			var splitTypeId = TypeIdHelper.extractVersion(this.typeid);
			var version = splitTypeId.version;
			return version;
		} else {
			console.warn(MSG.TEMPLATE_NOT_VERSIONED, this.typeid);
			return undefined;
		}
	}

	/**
	 * Canonical representation of a PropertyTemplate.
	 * This is similar to a deep copy but with adjustments so that the target is in
	 * canonical form for a template property i.e. a) if array length
	 * is not specified it is set to 0 in the target, b) string value
	 * for 'inherits' property is converted to single-value array
	 * Deep copy an object.
	 *
	 * @param {*} in_obj - The object to create a canonical copy of.
	 * @param {Object|Array} [in_target_] - Copy into this object.
	 * @param {string} [in_key_] - Key in in_target_ at which to place the copied object.
	 * @param {boolean} [in_preserve_ = false] - Do not overwrite structs / arrays in an existing object
	 *
	 * @return {*} in_target_ if specified, new object containing canonical copy of @obj
	 * otherwise.
	 * @return {string} The version string is returned.
	 */
	_canonicalForm(in_obj, in_target_, in_key_, in_preserve_) {
		in_preserve_ = in_preserve_ === undefined ? false : in_preserve_;

		var target, copyMembers;
		var copyDirectlyIntoKey = false;
		if (
			in_target_ &&
			(in_key_ === undefined ||
				(in_key_ &&
					in_target_.hasOwnProperty(in_key_) &&
					_.isObject(in_target_[in_key_]) &&
					in_preserve_))
		) {
			// If no key is given, we directly copy into the
			// target object. Additionally, when a key is given, the member already exists
			// in the target object and preserve is set, we also keep the target object.
			// This is only possible if the target is already an
			// object.
			target = in_key_ ? in_target_[in_key_] : in_target_;

			if (
				_.isFunction(in_obj) ||
				_.isDate(in_obj) ||
				_.isRegExp(in_obj) ||
				_.isObject(in_obj) !== _.isObject(target) ||
				_.isArray(in_obj) !== _.isArray(target) ||
				!_.isObject(target)
			) {
				throw new TypeError(MSG.INVALID_TARGET_PROPERTY_TEMPLATE + this.typeid);
			}
			copyMembers = true;
			copyDirectlyIntoKey = true;
		} else {
			// If no existing target object, we create a new object.

			// literals are directly assigned to the target
			if (!in_obj || !_.isObject(in_obj) || _.isFunction(in_obj)) {
				target = in_obj;
				// Special case handlers for dates and regexps
				// (https://github.com/jashkenas/underscore/pull/595)
			} else if (_.isDate(in_obj)) {
				target = new Date(in_obj.getTime());
			} else if (_.isRegExp(in_obj)) {
				target = new RegExp(in_obj.source, in_obj.toString().replace(/.*\//, ""));
				// For objects and arrays we create a new object/array
			} else if (_.isObject(in_obj)) {
				target = _.isArray(in_obj) ? [] : {};
				copyMembers = true;
			} else {
				throw new TypeError(MSG.MISSING_CASE_IN_TEMPLATE_SERIALIZATION + this.typeid);
			}
		}

		// If this is either an object or an array, we have to do a 'normalized' deep copy
		// and recursively copy all members. Normalized means the target will be a normalized
		// representation of the input property with respect to the canonical representation
		// of a template i.e. : if array length is not specified it is set to 0.
		// Other rules will follow
		if (copyMembers) {
			var keys = _.keys(in_obj);
			var l = keys.length;
			for (var i = 0; i < l; i++) {
				var key = keys[i];
				this._canonicalForm(in_obj[key], target, key, in_preserve_);
			}

			// If context is array and length is absent set it to 0
			if (
				_.includes(keys, "context") &&
				in_obj["context"] === "array" &&
				!_.includes(keys, "length")
			) {
				target["length"] = 0;
			}

			// If inherit value is present and is a single string convert it to single element array
			if (
				_.includes(keys, "inherits") &&
				in_obj["inherits"] &&
				!_.isObject(in_obj["inherits"])
			) {
				target["inherits"] = [in_obj["inherits"]];
			}
		}

		if (!in_key_) {
			// If you don't give a path, then we return the original or copied object
			return target;
		} else if (!copyDirectlyIntoKey) {
			// If you give a path, we use the path as a key.
			in_target_[in_key_] = target;
		}

		return in_target_;
	}

	/**
	 * Return the serialized parameters passed in the constructor
	 * @return {object} Serialized parameters
	 */
	serialize() {
		return deepCopy(this._serializedParams);
	}

	/**
	 * Return the serialized parameters passed in the constructor, in a template canonical form
	 * @return {object} canonical serialized parameters
	 */
	serializeCanonical() {
		return PropertyTemplate.prototype._canonicalForm(this._serializedParams);
	}

	/**
	 * Return the typeid of the template without the version number
	 * i.e. autodesk.core:color instead of autodesk.core:color-1.0.0
	 * @return {string} The typeid without the version is returned.
	 * If the template is not versioned, the typeid is return.
	 */
	getTypeidWithoutVersion() {
		if (this._isVersioned()) {
			var splitTypeId = TypeIdHelper.extractVersion(this.typeid);
			return splitTypeId.typeidWithoutVersion;
		} else {
			return this.typeid;
		}
	}

	/**
	 * Determines if the argument is a template structure
	 *
	 * @param {object} in_param - Parameter to assess
	 *
	 * @return {Boolean} true if in_param is a template
	 */
	static isTemplate(in_param) {
		if (in_param.typeid && in_param.typeid.indexOf(":") !== -1) {
			return true;
		}
		return false;
	}

	/**
	 * Extracts typeids directly referred to in a template
	 *
	 * @param {object} template - Structure from which to extract dependencies
	 *
	 * @return {Array} List of typeids this template refers directly to
	 */
	static extractDependencies(template) {
		var dependencies = {};

		if (template.inherits) {
			var inherits =
				typeof template.inherits === "string" ? [template.inherits] : template.inherits;
			for (var i = 0; i < inherits.length; i++) {
				var elem = TypeIdHelper.extractTypeId(inherits[i]);
				dependencies[elem] = true;
			}
		}

		if (template.properties) {
			var properties = template.properties;
			for (var i = 0; i < properties.length; i++) {
				var property = properties[i];
				if (PropertyTemplate.isTemplate(property)) {
					var typeid = TypeIdHelper.extractTypeId(property.typeid);
					dependencies[typeid] = true;

					if (property.typedValue) {
						for (var t = 0; t < property.typedValue.length; t++) {
							var typedValue = property.typedValue[t];
							dependencies[typedValue.typeid] = true;
						}
					}
				} else if (property.properties) {
					var deps = PropertyTemplate.extractDependencies(property);
					for (var j = 0; j < deps.length; j++) {
						var typeid = TypeIdHelper.extractTypeId(deps[j]);
						dependencies[typeid] = true;
					}
				}
			}
		}

		if (template.constants) {
			var constants = template.constants;
			for (var i = 0; i < constants.length; i++) {
				var constant = constants[i];
				if (PropertyTemplate.isTemplate(constant)) {
					var typeid = TypeIdHelper.extractTypeId(constant.typeid);
					dependencies[typeid] = true;
				} else if (
					constant.context === "map" &&
					constant.contextKeyType === "typeid" &&
					constant.value
				) {
					var keys = Object.keys(constant.value);
					for (var k = 0; k < keys.length; k++) {
						var typeid = TypeIdHelper.extractTypeId(keys[k]);
						dependencies[typeid] = true;
					}
				}

				// Search for typeid hidden in typedValue
				// the context could be inherited and therefore missing, so we have to try them all.
				if (constant.typedValue) {
					// for arrays
					if (_.isArray(constant.typedValue)) {
						for (var t = 0; t < constant.typedValue.length; t++) {
							var typedValue = constant.typedValue[t];
							dependencies[typedValue.typeid] = true;
						}
						// for singles
					} else if (constant.typedValue.typeid) {
						dependencies[constant.typedValue.typeid] = true;
						// for maps
					} else {
						var keys = Object.keys(constant.typedValue);
						for (var k = 0; k < keys.length; k++) {
							var typeid = constant.typedValue[keys[k]].typeid;
							if (typeid) {
								dependencies[typeid] = true;
							}
						}
					}
				}
			}
		}

		return Object.keys(dependencies);
	}
}

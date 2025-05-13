/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview Definition of the reference map property class
 */
const { PathHelper, TypeIdHelper } = require("@fluid-experimental/property-changeset");
const { MSG } = require("@fluid-experimental/property-common").constants;
const _ = require("lodash");

const { BaseProperty } = require("./baseProperty");
const { ContainerProperty } = require("./containerProperty");
const { ReferenceProperty } = require("./referenceProperty");
const { StringMapProperty } = require("./valueMapProperty");

/**
 * A StringMapProperty which stores reference values
 * @internal
 */
export class ReferenceMapProperty extends StringMapProperty {
	/**
	 * @param {Object} in_params - Input parameters for property creation
	 *
	 * @constructor
	 * @protected
	 * @extends property-properties.StringMapProperty
	 * @alias property-properties.ReferenceMapProperty
	 * @category Maps
	 */
	constructor(in_params) {
		super(in_params);
	}

	/**
	 * Returns the typeid for the target of this reference
	 *
	 * Note: This is the type that is specified in the typeid of this reference and not the actual type
	 * of the referenced object, which might inherit from that typeid.
	 *
	 * @returns {string} The typeid of the nodes this reference may point to
	 */
	getReferenceTargetTypeId() {
		return TypeIdHelper.extractReferenceTargetTypeIdFromReference(this.getTypeid());
	}

	/**
	 * Resolves the referenced property for the given key
	 *
	 * @param {string | Array<string | number>} in_ids - The ID of the property or an array of IDs
	 * if an array is passed, the .get function will be performed on each id in sequence
	 * for example .get(['position','x']) is equivalent to .get('position').get('x').
	 * If .get resolves to a ReferenceProperty, it will return the property that the ReferenceProperty
	 * refers to.
	 * @param {Object} in_options - parameter object
	 * @param {property-properties.BaseProperty.REFERENCE_RESOLUTION} [in_options.referenceResolutionMode=ALWAYS] - How
	 * should this function behave during reference resolution?
	 *
	 * @returns {BaseProperty | undefined} The property object the reference points to or undefined
	 * if it could not be resolved
	 */
	get(in_ids, in_options) {
		in_options = in_options || {};
		in_options.referenceResolutionMode =
			in_options.referenceResolutionMode === undefined
				? BaseProperty.REFERENCE_RESOLUTION.ALWAYS
				: in_options.referenceResolutionMode;

		if (_.isArray(in_ids)) {
			// Forward handling of arrays to the BaseProperty function
			return AbstractStaticCollectionProperty.prototype.get.call(this, in_ids, in_options);
		} else {
			var value = this._dynamicChildren[in_ids];
			if (value === undefined || value === "") {
				return undefined;
			}
			return this.getParent().resolvePath(value, in_options);
		}
	}

	/**
	 * Removes the entry with the given key from the map
	 *
	 * @param {string} in_key - The key of the entry to remove from the map
	 * @throws If trying to remove an entry that does not exist
	 * @returns {String} the item removed (a string pathT
	 */
	remove(in_key) {
		var item = this.getValue(in_key);
		this._removeByKey(in_key, true);
		return item;
	}

	/**
	 * Returns an object with all the nested path values.
	 *
	 * @example
	 *
	 * ```javascript
	 * {
	 *   'firstPath': '/path',
	 *   'secondPath': '/path2'
	 * }
	 * ```
	 */
	getValues() {
		var ids = this.getIds();
		var result = {};
		for (var i = 0; i < ids.length; i++) {
			result[ids[i]] = this.getValue(ids[i]);
		}
		return result;
	}

	/**
	 * Sets or inserts the reference to point to the given property object or to be equal to the given path string.
	 *
	 * @param {string} in_key - The key under which the entry is stored
	 * @param {property-properties.BaseProperty|undefined|String} in_value - The property to assign to the reference or
	 * the path to this property. If undefined is passed, the reference will be set to an empty string to
	 * indicate an empty reference.
	 * @throws If in_key is not a string
	 * @throws If in_value is defined, but is not a property or a string.
	 * @throws If map is read only
	 */
	set(in_key, in_value) {
		if (!_.isString(in_key)) {
			throw new TypeError(MSG.KEY_NOT_STRING + in_key);
		}
		var value = ReferenceProperty._convertInputToPath(in_value);
		StringMapProperty.prototype.set.call(this, in_key, value);
	}

	/**
	 * Sets or inserts the reference to point to the given property object or to be equal to the given path string.
	 *
	 * @param {string} in_key - The key under which the entry is stored
	 * @param {property-properties.BaseProperty|undefined|String} in_value - The property to assign to the reference or
	 * the path to this property. If undefined is passed, the reference will be set to an empty string to
	 * indicate an empty reference.
	 * @throws If in_key is not a string
	 * @throws If in_value is defined, but is not a property or a string.
	 * @deprecated
	 */
	setValue(...args) {
		return this.set(...args);
	}

	/**
	 * Inserts the reference to point to the given property object or to be equal to the given path string.
	 *
	 * @param {string} in_key - The key under which the entry is stored
	 * @param {property-properties.BaseProperty|undefined|String} in_value - The property to assign to the reference or
	 * the path to this property. If undefined is passed, the reference will be set to an empty string to
	 * indicate an empty reference.
	 * @throws If there is already an entry under in_key
	 * @throws If in_value is defined, but is not a property or a string.
	 */
	insert(in_key, in_value) {
		var value = ReferenceProperty._convertInputToPath(in_value);
		this._insert(in_key, value, true);
	}

	/**
	 * Checks whether the reference is valid. This is either the case when it is empty or when the referenced
	 * property exists.
	 *
	 * @param {string} in_key - Key of the entry to check
	 * @returns {boolean} True if the reference is valid, otherwise false.
	 */
	isReferenceValid(in_key) {
		return (
			this.has(in_key) && (this.getValue(in_key) === "" || this.get(in_key) !== undefined)
		);
	}

	/**
	 * Returns the string value stored in the map
	 * @param {string} in_key - The key of the reference
	 * @returns {string} The path string
	 */
	getValue(in_key) {
		return this._getValue(in_key);
	}

	/**
	 * @inheritdoc
	 */
	_resolvePathSegment(in_segment, in_segmentType) {
		// Array tokens are automatically resolved
		return in_segmentType === PathHelper.TOKEN_TYPES.ARRAY_TOKEN
			? this.get(in_segment, {
					referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER,
				})
			: // Everything else is handled by the implementation in the base property
				AbstractStaticCollectionProperty.prototype._resolvePathSegment.call(
					this,
					in_segment,
					in_segmentType,
				);
	}
}

ReferenceMapProperty.prototype._typeid = "Reference";

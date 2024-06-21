/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview Definition of the set property class
 */

const { PathHelper, TypeIdHelper } = require("@fluid-experimental/property-changeset");
const { MSG } = require("@fluid-experimental/property-common").constants;
const _ = require("lodash");

const { AbstractStaticCollectionProperty } = require("./abstractStaticCollectionProperty");
const { BaseProperty } = require("./baseProperty");
const { IndexedCollectionBaseProperty } = require("./indexedCollectionBaseProperty");
const { LazyLoadedProperties: Property } = require("./lazyLoadedProperties");

var PATH_TOKENS = BaseProperty.PATH_TOKENS;

/**
 * A SetProperty is a collection class that can contain an unordered set of properties. These properties
 * must derive from NamedProperty and their URN is used to identify them within the set.
 * @internal
 */
export class SetProperty extends IndexedCollectionBaseProperty {
	/**
	 * @param {Object} in_params - Input parameters for property creation
	 * @param {string|undefined} in_scope - The scope in which the map typeid is defined
	 *
	 * @constructor
	 * @protected
	 * @extends property-properties.IndexedCollectionBaseProperty
	 * @alias property-properties.SetProperty
	 * @category Other Collections
	 */
	constructor(in_params, in_scope) {
		super(in_params);

		this._scope = in_scope;

		/** Contains the actual entries of the set, indexed by their GUID */
		this._dynamicChildren = {};
	}

	// A set property falls back to NamedProperty, if none is specified

	/**
	 * Is this property a leaf node with regard to flattening?
	 *
	 * TODO: Which semantics should flattening have? It stops at primitive types and collections?
	 *
	 * @return {boolean} Is it a leaf with regard to flattening?
	 */
	_isFlattenLeaf() {
		return true;
	}

	/**
	 * Returns an object with all the nested values contained in this property.
	 * @return {object} An object representing the values of your property.
	 * For example:
	 *
	 * ```json
	 * {
	 *   position: {
	 *     x: 2,
	 *     y: 5
	 *   }
	 * }
	 * ```
	 */
	getValues() {
		var ids = this.getIds();
		var result = {};
		for (var i = 0; i < ids.length; i++) {
			var child = this.get(ids[i]);
			result[ids[i]] =
				child instanceof Property.ValueProperty || child instanceof Property.StringProperty
					? this.get(ids[i]).getValue()
					: child.getValues();
		}
		return result;
	}

	/**
	 * Returns the full property type identifier for the ChangeSet including the enum type id
	 * @param {boolean} [in_hideCollection=false] - If true the collection type (if applicable) will be omitted
	 * @return {string} The typeid
	 */
	getFullTypeid(in_hideCollection = false) {
		return in_hideCollection
			? this._typeid
			: TypeIdHelper.createSerializationTypeId(this._typeid, "set");
	}

	/**
	 * Returns the path segment for a child
	 *
	 * @param {property-properties.NamedProperty} in_childNode - The child for which the path is returned
	 *
	 * @return {string} The path segment to resolve the child property under this property
	 * @protected
	 */
	_getPathSegmentForChildNode(in_childNode) {
		return "[" + in_childNode.getGuid() + "]";
	}

	/**
	 * Resolves a direct child node based on the given path segment
	 *
	 * @param {String} in_segment - The path segment to resolve
	 * @param {property-properties.PathHelper.TOKEN_TYPES} in_segmentType - The type of segment in the tokenized path
	 *
	 * @return {BaseProperty | undefined} The child property that has been resolved
	 * @protected
	 */
	_resolvePathSegment(in_segment, in_segmentType) {
		// Base Properties only support paths separated via dots
		return in_segmentType === PathHelper.TOKEN_TYPES.ARRAY_TOKEN
			? this._dynamicChildren[in_segment]
			: AbstractStaticCollectionProperty.prototype._resolvePathSegment.call(
					this,
					in_segment,
					in_segmentType,
				);
	}

	/**
	 * Inserts a property into the set
	 *
	 * @param {property-properties.NamedProperty} in_property - The property to insert
	 * @throws if trying to insert non-named properties
	 * @throws if trying to insert a property that has a parent
	 * @throws if a property already exists with the same guid as in_property
	 */
	insert(in_property) {
		if (in_property instanceof AbstractStaticCollectionProperty && in_property.has("guid")) {
			var guid = in_property.getGuid();
			this._insert(guid, in_property, true);
		} else {
			throw new Error(MSG.CANT_INSERT_NON_NAMED_PROPERTIES);
		}
	}

	/**
	 * Adds a property to the set.
	 *
	 * - If the property's key exists, the entry is replaced with new one.
	 *
	 * - If the property's key does not exist, the property is appended.
	 *
	 * @param {NamedProperty|NamedNodeProperty|Object} in_property - The property to add to the list.
	 * @return { BaseProperty }
	 */
	set(in_property) {
		this._checkIsNotReadOnly(true);

		if (in_property instanceof AbstractStaticCollectionProperty && in_property.has("guid")) {
			var guid = in_property.getGuid();
			if (this.has(guid)) {
				this.remove(guid);
			}

			this.insert(in_property);
		} else {
			throw new Error(MSG.CANT_INSERT_NON_NAMED_PROPERTIES);
		}
	}

	/**
	 * Removes the given property from the set
	 *
	 * @param {property-properties.NamedProperty|string} in_entry - The property or its URN to remove from the set
	 * @return {property-properties.NamedProperty} the property that was removed.
	 * @throws if trying to remove an entry that does not exist
	 */
	remove(in_entry) {
		if (_.isString(in_entry)) {
			var item = this.get(in_entry);
			this._removeByKey(in_entry, true);
			return item;
		} else {
			this._removeByKey(in_entry.getGuid(), true);
			return in_entry;
		}
	}

	/**
	 * Returns an Object with all the entries of the set.
	 *
	 * WARNING: This is a direct access to the internal data-structure and the collection MUST NOT be modified.
	 * It is read only for fast access and iteration. Insertion and deletion MUST be done via the insert and
	 * remove functions of this class.
	 *
	 * @return {Object<String, property-properties.NamedProperty>} The map with all entries in the set.
	 */
	getEntriesReadOnly() {
		return this._dynamicChildren;
	}

	/**
	 * Returns the name of all the sub-properties of this property.
	 *
	 * @return {Array.<string>} An array of all the property ids
	 */
	getIds() {
		return Object.keys(this._dynamicChildren);
	}

	/**
	 * Returns the collection entry with the given ID
	 *
	 * @param {string | Array<string | number>} in_ids - key of the entry to return or an array of keys if an array is
	 * passed, the .get function will be performed on each id in sequence for example .get(['position','x']) is
	 * equivalent to .get('position').get('x'). If .get resolves to a ReferenceProperty, it will return the property
	 * that the ReferenceProperty refers to.
	 * @param {Object} in_options - parameter object
	 * @param {property-properties.BaseProperty.REFERENCE_RESOLUTION} [in_options.referenceResolutionMode=ALWAYS] - How
	 * should this function behave during reference resolution?
	 *
	 * @return {BaseProperty | undefined} The entry in the collection or undefined if none could be
	 * found
	 */
	get(in_ids, in_options) {
		if (_.isArray(in_ids)) {
			// Forward handling of arrays to the BaseProperty function
			return AbstractStaticCollectionProperty.prototype.get.call(this, in_ids, in_options);
		} else {
			var prop = this;
			in_options = in_options || {};
			in_options.referenceResolutionMode =
				in_options.referenceResolutionMode === undefined
					? BaseProperty.REFERENCE_RESOLUTION.ALWAYS
					: in_options.referenceResolutionMode;
			switch (in_ids) {
				case PATH_TOKENS.ROOT: {
					prop = prop.getRoot();
					break;
				}
				case PATH_TOKENS.UP: {
					prop = prop.getParent();
					break;
				}
				case PATH_TOKENS.REF: {
					throw new Error(MSG.NO_GET_DEREFERENCE_ONLY);
				}
				default: {
					prop = prop._dynamicChildren[in_ids];
					break;
				}
			}

			return prop;
		}
	}

	/**
	 * Checks whether a property with the given name exists
	 *
	 * @param {string} in_id - Name of the property
	 * @return {boolean} True if the property exists, otherwise false.
	 */
	has(in_id) {
		return this._dynamicChildren[in_id] !== undefined;
	}

	/**
	 * Adds a list of properties to the set.
	 * See {@link SetProperty.setValues}
	 * @param {NamedProperty[]|NamedNodeProperty[]|Object[]} in_properties - The list of properties to add to the list
	 * @param {Boolean} in_typed - If the set's items have a typeid and a value then create the
	 * properties with that typeid, else use the set's typeid (support polymorphic items).
	 * @private
	 */
	_setValuesInternal(in_properties, in_typed) {
		this._checkIsNotReadOnly(true);

		var that = this;
		_.each(in_properties, function (property) {
			if (property instanceof BaseProperty) {
				that.set(property);
			} else {
				// If value is a JSON object (i.e: passed through a default value), create the property and add it to the set.
				if (in_typed) {
					that.set(
						Property.PropertyFactory._createProperty(
							property.typeid || that._typeid,
							null,
							property.value,
							that._getScope(),
						),
					);
				} else {
					that.set(
						Property.PropertyFactory._createProperty(
							that._typeid,
							null,
							property,
							that._getScope(),
						),
					);
				}
			}
		});
	}

	/**
	 * Adds a list of properties to the set. See {@link SetProperty.setValues}
	 * @param {NamedProperty[]|NamedNodeProperty[]|Object[]} in_properties - The list of properties to add to the list
	 * @param {boolean} in_typed - If the set's items have a typeid and a value then create the properties with that
	 * typeid, else use the set's typeid (support polymorphic items).
	 * @param {boolean} in_initial - Whether we are setting default/initial values or if the function is called directly
	 * with the values to set.
	 * @override
	 */
	_setValues(in_properties, in_typed, in_initial) {
		if (in_initial) {
			this.clear();
		}

		this._setValuesInternal(in_properties, in_typed);
	}

	/**
	 * Adds a list of properties to the set.
	 * - If the property's key exists, the entry is replaced with new one.
	 * - If the property's key does not exist, the property is appended.
	 * @param {NamedProperty[]|NamedNodeProperty[]|Object[]} in_properties - The list of properties to add to the list
	 * @override
	 */
	setValues(in_properties) {
		var checkoutView = this._getCheckoutView();
		if (checkoutView !== undefined) {
			checkoutView.pushNotificationDelayScope();
			SetProperty.prototype._setValues.call(this, in_properties, false, false);
			checkoutView.popNotificationDelayScope();
		} else {
			SetProperty.prototype._setValues.call(this, in_properties, false, false);
		}
	}

	/**
	 * Returns all entries of the set as an array.
	 *
	 * NOTE: This function creates a copy and thus is less efficient as getEntriesReadOnly.
	 *
	 * @return {Array.<property-properties.NamedProperty>} Array with all entries of the set. This array is a shallow copy
	 * which can be modified by the caller without effects on the set.
	 */
	getAsArray() {
		return _.values(this._dynamicChildren);
	}

	/**
	 * Get the scope to which this property belongs to.
	 * @return {string|undefined} The guid representing the scope in which the
	 * set belongs to. If there is a workspace scope return it, else return the scope of this set.
	 * @override
	 * @private
	 */
	_getScope() {
		var scope = IndexedCollectionBaseProperty.prototype._getScope.call(this);

		return scope !== undefined ? scope : this._scope;
	}

	/**
	 * Delete all values from Set
	 */
	clear() {
		var that = this;
		this.getIds().forEach(function (id) {
			that.remove(id);
		});
	}
}

SetProperty.prototype._typeid = "NamedProperty";
SetProperty.prototype._context = "set";

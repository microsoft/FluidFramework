/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview Definition of the map property class
 */
const { PathHelper, TypeIdHelper } = require('@fluid-experimental/property-changeset');
const { MSG } = require('@fluid-experimental/property-common').constants;
const { ConsoleUtils } = require('@fluid-experimental/property-common');
const _ = require('lodash');
const { AbstractStaticCollectionProperty } = require('./abstractStaticCollectionProperty');
const { BaseProperty } = require('./baseProperty');
const { IndexedCollectionBaseProperty } = require('./indexedCollectionBaseProperty');
const { LazyLoadedProperties: Property } = require('./lazyLoadedProperties');

const PATH_TOKENS = BaseProperty.PATH_TOKENS;

/**
 * typedef {property-properties.BaseProperty|string|number|boolean} property-properties.MapProperty~MapValueType
 *
 * The type of the values that are set/inserted into the map. Depending on the type of the map, these can either
 * be property objects or primitive values
 */

/**
 * A MapProperty is a collection class that can contain an dictionary that maps from strings to properties.
 */
export class MapProperty extends IndexedCollectionBaseProperty {
    /**
     * @param {Object} in_params - Input parameters for property creation
     * @param {string|undefined} in_scope - The scope in which the map typeid is defined
     * @constructor
     * @protected
     * @extends property-properties.IndexedCollectionBaseProperty
     * @alias property-properties.MapProperty
     * @category Maps
     */
    constructor(in_params, in_scope) {
        super(in_params);

        this._scope = in_scope;
        this._contextKeyType = in_params.contextKeyType || 'string';

        /** Contains the actual entries of the map */
        this._dynamicChildren = {};
    }

    /**
     * Returns the full property type identifier for the ChangeSet including the enum type id
     * @param {boolean} [in_hideCollection=false] - If true the collection type (if applicable) will be omitted
     * @return {string} The typeid
     */
    getFullTypeid(in_hideCollection = false) {
        if (in_hideCollection) {
            return this._typeid;
        } else {
            return TypeIdHelper.createSerializationTypeId(this._typeid, 'map');
        }
    }

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
     * Sets multiple values in a map.
     *
     * See {@link MapProperty.setValues}
     *
     * @param {object} in_values - to assign to the collection
     * @param {Boolean} in_typed - If the map's items have a typeid and a value then create the
     *   properties with that typeid, else use the set's typeid (support polymorphic items).
     * @private
     */
    _setValuesInternal(in_values, in_typed) {
        if (this._containsPrimitiveTypes) {
            var that = this;
            _.each(in_values, function(value, key) {
                if (that.has(key)) {
                    that.remove(key);
                }

                that.insert(key, value);
            });
        } else {
            var that = this;
            _.each(in_values, function(value, key) {
                var property = that.get(String(key), { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER });
                // if key exists in set replace its value else insert a new key/value
                if (property) {
                    if (property instanceof Property.ValueProperty || property instanceof Property.StringProperty) {
                        property.setValue(value);
                    } else if (property instanceof BaseProperty && _.isObject(value)) {
                        property._setValues(value, false, false);
                    } else {
                        throw new TypeError(MSG.SET_VALUES_PATH_INVALID + key);
                    }
                } else {
                    if (value instanceof BaseProperty) {
                        that.insert(key, value);
                    } else {
                        if (in_typed) {
                            that.insert(key, Property.PropertyFactory._createProperty(
                                value.typeid || that._typeid, null, value.value, that._getScope()));
                        } else {
                            that.insert(key, Property.PropertyFactory._createProperty(
                                that._typeid, null, value, that._getScope()));
                        }
                    }
                }
            });
        }
    }

    /**
     * Sets multiple values in a map.
     *
     * See {@link MapProperty.setValues}
     *
     * @param {object} in_values - to assign to the collection
     * @param {Bool} in_typed - Whether the values are typed/polymorphic.
     * @param {Bool} in_initial - Whether we are setting default/initial values or if the function is called directly
     * with the values to set.
     *
     * @override
     */
    _setValues(in_values, in_typed, in_initial) {
        if (in_initial) {
            this.clear();
        }

        this._setValuesInternal(in_values, in_typed);
    }

    /**
     * Sets multiple values in a map.
     *
     * @param {object} in_values - to assign to the collection
     * @throws If one of the path in in_values does not exist in this property
     * @throws If trying to set a value to a path that leads to a Property other than ValueProperty or StringProperty
     *
     * @override
     */
    setValues(in_values) {
        var checkoutView = this._getCheckoutView();
        if (checkoutView !== undefined) {
            checkoutView.pushNotificationDelayScope();
            this._setValues(in_values, false, false);
            checkoutView.popNotificationDelayScope();
        } else {
            this._setValues(in_values, false, false);
        }
    }

    /**
     * Returns an object with all the nested values contained in this property.
     *
     * @example
     * ```javascript
     * {
     *   'firstString': {
     *     'stringValue': 'test1'
     *   },
     *   'secondString': {
     *     'stringValue': 'test2'
     *   }
     * }
     */
    getValues() {
        var ids = this.getIds();
        var result = {};
        for (var i = 0; i < ids.length; i++) {
            var child = this.get(ids[i]);
            if (child.isPrimitiveType()) {
                result[ids[i]] = this.get(ids[i]).getValue();
            } else {
                result[ids[i]] = child.getValues();
            }
        }
        return result;
    }

    /**
     * Returns the path segment for a child
     *
     * @param {property-properties.BaseProperty} in_childNode - The child for which the path is returned
     *
     * @return {string} The path segment to resolve the child property under this property
     * @protected
     */
    _getPathSegmentForChildNode(in_childNode) {
        return '[' + PathHelper.quotePathSegmentIfNeeded(in_childNode._id) + ']';
    }

    /**
     * Resolves a direct child node based on the given path segment
     *
     * @param {String} in_segment - The path segment to resolve
     * @param {property-properties.PathHelper.TOKEN_TYPES} in_segmentType - The type of segment in the tokenized path
     *
     * @return {property-properties.BaseProperty|undefined} The child property that has been resolved
     * @protected
     */
    _resolvePathSegment(in_segment, in_segmentType) {
        if (in_segmentType === PathHelper.TOKEN_TYPES.ARRAY_TOKEN) {
            return this._dynamicChildren[in_segment];
        } else {
            return AbstractStaticCollectionProperty.prototype._resolvePathSegment.call(
                this,
                in_segment,
                in_segmentType);
        }
    }

    /**
     * Inserts a property or value into the map
     *
     * Note: This will trigger an exception when this key already exists in the map. If you want to overwrite
     *       existing entries you can use the set function.
     *
     * @param {string} in_key - The key under which the entry is added
     * @param {property-properties.Property} in_property - The property to insert
     * @throws If the property already exists
     * @throws If the property already has a parent
     * @throws If in_key is not a string
     * @throws If the property is a root property
     */
    insert(in_key, in_property) {
        ConsoleUtils.assert(_.isString(in_key), MSG.KEY_NOT_STRING + in_key);
        if (this._dynamicChildren[in_key] !== undefined) {
            throw new Error(MSG.PROPERTY_ALREADY_EXISTS + in_key);
        }
        if (in_property instanceof BaseProperty) {
            in_property._validateInsertIn(this);
            // Set the ID of the entry, to make sure it corresponds to the used key
            in_property._setId(in_key);

            // Insert the entry into the collection
            this._insert(in_key, in_property, true);
        } else {
            throw new TypeError(MSG.NONVALUE_MAP_INSERT_PROP);
        }
    }

    /**
     * Removes the entry with the given key from the map
     *
     * @param {string} in_key - The key of the entry to remove from the map
     * @throws If trying to remove an entry that does not exist
     * @return {*} the item removed
     */
    remove(in_key) {
        var item = this.get(in_key);
        this._removeByKey(in_key, true);
        return item;
    }

    /**
     * Sets the entry with the given key to the property passed in
     *
     * Note: this will overwrite an already existing value
     *
     * @param {string} in_key - The key under which the entry is stored
     * @param {property-properties.MapProperty~MapValueType} in_property - The property to store in the map
     * @throws If in_property is not a property
     * @throws If trying to insert a property that has a parent
     * @throws If in_key is not a string or a number
     */
    set(in_key, in_property) {
        this._checkIsNotReadOnly(true);
        if (this._dynamicChildren[in_key] !== in_property) {
            if (this._containsPrimitiveTypes === false && in_property.getParent() !== undefined) {
                throw new Error(MSG.INSERTED_ENTRY_WITH_PARENT);
            }
            if (this._dynamicChildren[in_key] !== undefined) {
                this._removeByKey(in_key, false);
            }
            // Set the ID of the entry, to make sure it corresponds to the used key
            if (this._containsPrimitiveTypes === false) {
                in_property._setId(in_key);
            }
            this._insert(in_key, in_property, false);

            // Make one final report
            this._reportDirtinessToView();
        }
    }

    /**
     * Returns an Object with all the entries of the map.
     * Contrary ot .getValues, for Property Maps, this will return the Property, not an object with their nested values.
     * WARNING: This is a direct access to the internal data-structure and the collection MUST NOT be modified. It is
     * read only for fast access and iteration. Insertion and deletion MUST be done via the insert and remove functions
     * of this class.
     *
     * @return {Object} The map with all entries in the map.
     */
    getEntriesReadOnly() {
        return this._dynamicChildren;
    }

    /**
     * Returns the collection entry with the given key
     *
     * @param {string|array<string>} in_ids - key of the entry to return or an array of keys
     *     if an array is passed, the .get function will be performed on each id in sequence
     *     for example .get(['position','x']) is equivalent to .get('position').get('x').
     *     If .get resolves to a ReferenceProperty, it will return the property that the ReferenceProperty
     *     refers to.
     * @param {Object} in_options - parameter object
     * @param {property-properties.BaseProperty.REFERENCE_RESOLUTION} [in_options.referenceResolutionMode=ALWAYS]- -
     *     How should this function behave during reference resolution?
     *
     * @return {property-properties.Property|*|undefined} The entry in the collection or undefined
     *     if none could be found
     */
    get(in_ids, in_options) {
        if (_.isArray(in_ids)) {
            // Forward handling of arrays to the BaseProperty function
            return AbstractStaticCollectionProperty.prototype.get.call(this, in_ids, in_options);
        } else {
            in_options = in_options || {};
            in_options.referenceResolutionMode =
                in_options.referenceResolutionMode === undefined ? BaseProperty.REFERENCE_RESOLUTION.ALWAYS :
                    in_options.referenceResolutionMode;

            var prop = this;
            if (in_ids === PATH_TOKENS.ROOT) {
                prop = prop.getRoot();
            } else if (in_ids === PATH_TOKENS.UP) {
                prop = prop.getParent();
            } else if (in_ids === PATH_TOKENS.REF) {
                throw new Error(MSG.NO_GET_DEREFERENCE_ONLY);
            } else {
                prop = prop._dynamicChildren[in_ids];
            }

            // Handle automatic reference resolution
            if (in_options.referenceResolutionMode === BaseProperty.REFERENCE_RESOLUTION.ALWAYS) {
                if (prop instanceof Property.ReferenceProperty) {
                    prop = prop.ref;
                }
            }

            return prop;
        }
    }

    /**
     * Checks whether an entry with the given name exists
     *
     * @param {string} in_id - Name of the property
     * @return {boolean} True if the property exists, otherwise false.
     */
    has(in_id) {
        return this._dynamicChildren[in_id] !== undefined;
    }

    /**
     * Returns all entries of the map as an array.
     *
     * NOTE: This function creates a copy and thus is less efficient as getEntriesReadOnly.
     *
     * @return {Array.<property-properties.BaseProperty | *>} Array with all entries of the map. This array
     *     is a shallow copy which can be modified by the caller without effects on the map.
     */
    getAsArray() {
        return _.values(this._dynamicChildren);
    }

    /**
     * Returns all keys found in the map
     *
     * NOTE: This function creates a copy and thus is less efficient as getEntriesReadOnly.
     *
     * @return {Array.<string>} The keys
     */
    getIds() {
        return Object.keys(this._dynamicChildren);
    }

    /**
     * Get the scope to which this property belongs to.
     * @return {string|undefined} The guid representing the scope in which the
     * map belongs to. If there is a workspace scope return it, else return the scope of this map.
     * @override
     * @private
     */
    _getScope() {
        var scope = IndexedCollectionBaseProperty.prototype._getScope.call(this);

        if (scope !== undefined) {
            return scope;
        } else {
            return this._scope;
        }
    }

    /**
     * Deletes all values from the Map
     */
    clear() {
        var that = this;
        this.getIds().forEach(function(id) {
            that.remove(id);
        });
    }
}

MapProperty.prototype._typeid = 'BaseProperty';
MapProperty.prototype._context = 'map';

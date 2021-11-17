/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview Definition of the set property class
 */
import _ from 'lodash';
import { BaseProperty, IBasePropertyParams } from './baseProperty';
import { AbstractStaticCollectionProperty } from './abstractStaticCollectionProperty';
import { IndexedCollectionBaseProperty } from './indexedCollectionBaseProperty';
import { PathHelper, TypeIdHelper } from '@fluid-experimental/property-changeset';
import { constants } from '@fluid-experimental/property-common';
import { LazyLoadedProperties as Property } from './lazyLoadedProperties';
import { NamedNodeProperty, NamedProperty } from '.';

const { PATH_TOKENS } = BaseProperty;
const { MSG } = constants;

type PropertyTypeAndValue = { typeid: string, value: any }

/**
 * A SetProperty is a collection class that can contain an unordered set of properties. These properties
 * must derive from NamedProperty and their URN is used to identify them within the set.
 */
export class SetProperty extends IndexedCollectionBaseProperty<NamedProperty> {
    _scope: string;


    constructor(in_params: IBasePropertyParams, in_scope?: string) {
        super({ typeid: 'NamedProperty', ...in_params });

        this._scope = in_scope;

        /** Contains the actual entries of the set, indexed by their GUID */
        this._dynamicChildren = {};
    };


    get _context() { return 'set'; }
    // A set property falls back to NamedProperty, if none is specified

    /**
     * Is this property a leaf node with regard to flattening?
     *
     * TODO: Which semantics should flattening have? It stops at primitive types and collections?
     *
     * @returns Is it a leaf with regard to flattening?
     */
    _isFlattenLeaf(): boolean {
        return true;
    };

    /**
    * Returns an object with all the nested values contained in this property
    * @return {object} an object representing the values of your property
    * for example: {
    *   position: {
    *    x: 2,
    *    y: 5
    *   }
    * }
    */
    getValues() {
        var ids = this.getIds();
        var result = {};
        for (var i = 0; i < ids.length; i++) {
            var child: any = this.get(ids[i]);
            if (child instanceof Property.ValueProperty || child instanceof Property.StringProperty) {
                result[ids[i]] = child.getValue();
            } else {
                result[ids[i]] = child.getValues();
            }
        }
        return result;
    };

    /**
     * Returns the full property type identifier for the ChangeSet including the enum type id
     * @param in_hideCollection - if true the collection type (if applicable) will be omitted
     * @returns The typeid
     */
    getFullTypeid(in_hideCollection = false): string {
        if (in_hideCollection) {
            return this._typeid;
        } else {
            return TypeIdHelper.createSerializationTypeId(this._typeid, 'set');
        }
    };

    /**
     * Returns the path segment for a child
     *
     * @param in_childNode - The child for which the path is returned
     *
     * @returns The path segment to resolve the child property under this property
     * @protected
     */
    _getPathSegmentForChildNode(in_childNode: NamedProperty): string {
        return '[' + in_childNode.getGuid() + ']';
    };

    /**
     * Resolves a direct child node based on the given path segment
     *
     * @param in_segment - The path segment to resolve
     * @param in_segmentType - The type of segment in the tokenized path
     *
     * @returns The child property that has been resolved
     * @protected
     */
    _resolvePathSegment(in_segment: string, in_segmentType: PathHelper.TOKEN_TYPES): BaseProperty | undefined {
        // Base Properties only support paths separated via dots
        if (in_segmentType === PathHelper.TOKEN_TYPES.ARRAY_TOKEN) {
            return this._dynamicChildren[in_segment];
        } else {
            return AbstractStaticCollectionProperty.prototype._resolvePathSegment.call(this, in_segment, in_segmentType);
        }
    };

    /**
     * Inserts a property into the set
     *
     * @param in_property - The property to insert
     * @throws if trying to insert non-named properties
     * @throws if trying to insert a property that has a parent
     * @throws if a property already exists with the same guid as in_property
     */
    insert(in_property: NamedProperty) {
        if (in_property instanceof AbstractStaticCollectionProperty && in_property.has('guid')) {
            var guid = in_property.getGuid();
            this._insert(guid, in_property, true);
        } else {
            throw new Error(MSG.CANT_INSERT_NON_NAMED_PROPERTIES);
        }
    };

    /**
     * Adds a property to the set
     * - If the property's key exists, the entry is replaced with new one.
     * - If the property's key does not exist, the property is appended.*
     *
     * @param in_property - The property to add to the list
     */
    set(in_property: NamedProperty) {
        this._checkIsNotReadOnly(true);

        if (in_property instanceof AbstractStaticCollectionProperty && in_property.has('guid')) {
            var guid = in_property.getGuid();
            if (this.has(guid)) {
                this.remove(guid);
            }

            this.insert(in_property);
        } else {
            throw new Error(MSG.CANT_INSERT_NON_NAMED_PROPERTIES);
        }
    };

    /**
     * Removes the given property from the set
     *
     * @param in_entry - The property or its URN to remove from the set
     * @returns the property that was removed.
     * @throws if trying to remove an entry that does not exist
     */
    remove(in_entry: NamedProperty | string): NamedProperty {
        if (_.isString(in_entry)) {
            var item = this.get(in_entry);
            this._removeByKey(in_entry, true);
            return item;
        } else {
            this._removeByKey(in_entry.getGuid(), true);
            return in_entry;
        }
    };

    /**
     * Returns an Object with all the entries of the set.
     *
     * WARNING: This is a direct access to the internal data-structure and the collection MUST NOT be modified.
     * It is read only for fast access and iteration. Insertion and deletion MUST be done via the insert and
     * remove functions of this class.
     *
     * @return The map with all entries in the set.
     */
    getEntriesReadOnly(): Record<string, NamedProperty> {
        return this._dynamicChildren;
    };

    /**
     * Returns the name of all the sub-properties of this property.
     *
     * @returns An array of all the property ids
     */
    getIds(): string[] {
        return Object.keys(this._dynamicChildren);
    };

    /**
     * Returns the collection entry with the given ID
     *
     * @param in_ids - key of the entry to return or an array of keys
     *     if an array is passed, the .get function will be performed on each id in sequence
     *     for example .get(['position','x']) is equivalent to .get('position').get('x').
     *     If .get resolves to a ReferenceProperty, it will return the property that the ReferenceProperty
     *     refers to.
     * @param in_options - parameter object
     *
     * @returns The entry in the collection or undefined if none could be found
     */
    get(
        in_ids: BaseProperty.PropertyResolutionPath,
        in_options: BaseProperty.PathResolutionOptions = {}
    ): NamedProperty | undefined {
        if (Array.isArray(in_ids)) {
            // Forward handling of arrays to the BaseProperty function
            return AbstractStaticCollectionProperty.prototype.get.call(this, in_ids, in_options);
        } else {
            var prop: any = this;
            in_options.referenceResolutionMode =
                in_options.referenceResolutionMode === undefined ? BaseProperty.REFERENCE_RESOLUTION.ALWAYS :
                    in_options.referenceResolutionMode;
            if (in_ids === PATH_TOKENS.ROOT) {
                prop = prop.getRoot();
            } else if (in_ids === PATH_TOKENS.UP) {
                prop = prop.getParent();
            } else if (in_ids === PATH_TOKENS.REF) {
                throw new Error(MSG.NO_GET_DEREFERENCE_ONLY);
            } else {
                prop = prop._dynamicChildren[in_ids as string];
            }

            return prop as NamedNodeProperty;
        }
    };

    /**
     * Checks whether a property with the given name exists
     *
     * @param in_id - Name of the property
     * @returns True if the property exists, otherwise false.
     */
    has(in_id: string): boolean {
        return this._dynamicChildren[in_id] !== undefined;
    };

    /**
     * Adds a list of properties to the set.
     * @param in_properties - The list of properties to add to the list
     * @param in_typed - If the set's items have a typeid and a value then create the
     *   properties with that typeid, else use the set's typeid (support polymorphic items).
     * @private
     */
    _setValuesInternal(in_properties: Array<NamedProperty | PropertyTypeAndValue>, in_typed: boolean) {
        this._checkIsNotReadOnly(true);

        var that = this;
        _.each(in_properties, function(property) {
            if (property instanceof BaseProperty) {
                that.set(property);
            } else {
                // If value is a JSON object (i.e: passed through a default value), create the property and add it to the set.
                if (in_typed) {
                    that.set(Property.PropertyFactory._createProperty(
                        property.typeid || that._typeid, null, property.value, that._getScope()));
                } else {
                    that.set(Property.PropertyFactory._createProperty(
                        that._typeid, null, property, that._getScope()));
                }
            }
        });
    };

    /**
     * Adds a list of properties to the set.
     * @param in_properties - The list of properties to add to the list
     * @param in_typed - If the set's items have a typeid and a value then create the
     *   properties with that typeid, else use the set's typeid (support polymorphic items).
     * @param in_initial  - Whether we are setting default/initial values
     *   or if the function is called directly with the values to set.
     * @override
     */
    _setValues(in_properties: Array<NamedProperty | PropertyTypeAndValue>, in_typed: boolean, in_initial: boolean) {
        if (in_initial) {
            this.clear();
        }

        this._setValuesInternal(in_properties, in_typed);
    };

    /**
     * Adds a list of properties to the set.
     * - If the property's key exists, the entry is replaced with new one.
     * - If the property's key does not exist, the property is appended.
     * @param in_properties - The list of properties to add to the list
     * @override
     */
    setValues(in_properties: Array<NamedProperty | PropertyTypeAndValue>) {
        var checkoutView = this._getCheckoutView();
        if (checkoutView !== undefined) {
            checkoutView.pushNotificationDelayScope();
            SetProperty.prototype._setValues.call(this, in_properties, false, false);
            checkoutView.popNotificationDelayScope();
        } else {
            SetProperty.prototype._setValues.call(this, in_properties, false, false);
        }
    };

    /**
     * Returns all entries of the set as an array.
     *
     * NOTE: This function creates a copy and thus is less efficient as getEntriesReadOnly.
     *
     * @returns Array with all entries of the set. This array is a shallow copy
     * which can be modified by the caller without effects on the set.
     */
    getAsArray(): NamedProperty[] {
        return _.values(this._dynamicChildren);
    };

    /**
     * Get the scope to which this property belongs to.
     * @return {string|undefined} The guid representing the scope in which the
     * set belongs to. If there is a workspace scope return it, else return the scope of this set.
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
    };

    /**
     * Delete all values from Set
     */
    clear() {
        var that = this;
        this.getIds().forEach(function(id) {
            that.remove(id);
        });
    };

}

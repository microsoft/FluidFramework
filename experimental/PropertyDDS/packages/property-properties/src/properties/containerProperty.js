/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview This file contains the implementation of the ContainerProperty class
 */
const { MSG } = require("@fluid-experimental/property-common").constants;
const { ConsoleUtils } = require("@fluid-experimental/property-common");
const _ = require("underscore");

const { validationsEnabled } = require("../enableValidations");

const { AbstractStaticCollectionProperty } = require("./abstractStaticCollectionProperty");
const { BaseProperty } = require("./baseProperty");
const { IndexedCollectionBaseProperty } = require("./indexedCollectionBaseProperty");

/**
 * A property object that allows to add child properties dynamically.
 * @internal
 */
export class ContainerProperty extends IndexedCollectionBaseProperty {
	/**
	 * @param {Object} in_params - Input parameters for property creation
	 * @protected
	 */
	constructor(in_params) {
		super(in_params);

		if (in_params.optionalChildren) {
			this._optionalChildren = {};
			this._dynamicChildren = {};
		}
	}

	/**
	 * Returns the name of all the sub-properties of this property.
	 * @return {Array.<string>} An array of all the property ids
	 */
	_getIds() {
		return AbstractStaticCollectionProperty.prototype._getIds
			.call(this)
			.concat(Object.keys(this._dynamicChildren));
	}

	/**
	 * Returns the sub-property having the given name in this property.
	 *
	 * @param {string|number} in_id - The id of the prop you wish to retrieve.
	 *
	 * @return {property-properties.BaseProperty | undefined} The property you seek or undefined if none is found.
	 */
	_get(in_id) {
		return (
			AbstractStaticCollectionProperty.prototype._get.call(this, in_id) ||
			this._dynamicChildren[in_id]
		);
	}

	/**
	 * Adds an optional child to list of possible optional children.
	 * @param {string} in_id - Id of the optional child
	 * @param {string} in_typeid - typeid which determines what type the child should be
	 * @private
	 */
	_addOptionalChild(in_id, in_typeid) {
		if (this._optionalChildren === ContainerProperty.prototype._optionalChildren) {
			this._optionalChildren = {};
			this._dynamicChildren = {};
		}
		this._optionalChildren[in_id] = in_typeid;
	}

	/**
	 * Appends a property
	 *
	 * @param {String | property-properties.BaseProperty } in_id - The id under which the property is added.
	 * This parameter is optional. For NamedProperties it can be omitted. In that case the GUID of the named
	 * property will be used.
	 *
	 * @param {property-properties.BaseProperty} [in_property] - The property to add
	 * @throws if in_id is not a string or a number
	 * @throws if there is already an entry for in_id
	 * @throws if in_property is not a property
	 * @throws if in_property does not have an id
	 * @throws if in_property has a parent
	 * @throws if in_property is a root property
	 */
	insert(in_id, in_property) {
		if (in_property === undefined) {
			// If no id is passed, the property is passed as first parameter
			in_property = in_id;
			ConsoleUtils.assert(
				in_property instanceof BaseProperty,
				"insert error: " + MSG.NOT_A_PROPERTY,
			);
		} else {
			ConsoleUtils.assert(_.isString(in_id) || _.isNumber(in_id), MSG.ID_STRING_OR_NUMBER);
			ConsoleUtils.assert(
				!_.isString(in_id) || !_.isEmpty(in_id),
				MSG.ID_SHOULD_NOT_BE_EMPTY_STRING,
			);
			ConsoleUtils.assert(
				in_property instanceof BaseProperty,
				"insert error: " + MSG.NOT_A_PROPERTY,
			);
			if (this._dynamicChildren[in_id] !== undefined) {
				throw new Error(MSG.PROPERTY_ALREADY_EXISTS + in_id);
			}
			if (validationsEnabled.enabled) {
				in_property._validateInsertIn(this);
			}
			// If an id is passed, it is stored in the child property object
			in_property._setId(in_id);
		}

		if (validationsEnabled.enabled) {
			this._validateInsert(in_property.getId(), in_property);
		}

		// Add the child property to the dynamic properties
		this._insert(in_property.getId(), in_property, true);
	}

	/**
	 * Validates if inserting the property is valid.
	 *
	 * @param {string} in_id - id to be validated.
	 * @param {string} in_property - property to be validated.
	 * @throws if id is not on optional list.
	 * @throws if the typeid of the property doesn't match the schema.
	 * @protected
	 */
	_validateInsert(in_id, in_property) {
		if (!(this._optionalChildren && this._optionalChildren[in_id])) {
			throw new Error(MSG.CANNOT_INSERT_UNKNOWN_PROPERTY + in_id);
		}

		if (
			this._optionalChildren[in_id].toUpperCase() !== in_property.getTypeid().toUpperCase()
		) {
			throw new Error(
				MSG.MISMATCHING_PROPERTY_TYPEID +
					this._optionalChildren[in_id] +
					" instead it's: " +
					in_property.getTypeid(),
			);
		}
	}

	/**
	 * @override
	 * @inheritdoc
	 */
	_getScope() {
		if (this._parent) {
			return this.getRoot()._getScope();
		} else {
			return this._checkedOutRepositoryInfo
				? this._checkedOutRepositoryInfo.getScope()
				: undefined;
		}
	}

	/**
	 * Removes the given property
	 *
	 * @param {string|property-properties.BaseProperty} in_property - The property to remove (either its id or the
	 * whole property).
	 * @throws if trying to remove an entry that does not exist
	 * @return {property-properties.BaseProperty} the property removed.
	 */
	remove(in_property) {
		var id = in_property;
		var returnValue;
		if (id instanceof BaseProperty) {
			returnValue = id;
			id = id.getId();
		} else {
			returnValue = this.get(id);
		}

		this._validateRemove(id);

		this._removeByKey(id);
		return returnValue;
	}

	/**
	 * Validates if removing a property with specified id is valid.
	 *
	 * @param {string} in_id - id to be validated.
	 * @throws if the id doesn't exist.
	 * @throws if the id is not marked as optional.
	 * @protected
	 */
	_validateRemove(in_id) {
		if (!this._dynamicChildren[in_id]) {
			const error =
				this._staticChildren[in_id] !== undefined
					? new Error(MSG.CANNOT_REMOVE_NON_OPTIONAL_PROP + in_id)
					: new Error(MSG.REMOVING_NON_EXISTING_KEY + in_id);

			throw error;
		}
	}

	/**
	 * Removes all dynamic children
	 * @throws if node property is read-only
	 */
	clear() {
		this._checkIsNotReadOnly(true);
		_.each(this._dynamicChildren, this.remove.bind(this));
	}

	/**
	 * Inserts a property into the collection
	 *
	 * @param {string} in_key - Key of the entry in the collection
	 * @param {property-properties.NamedProperty} in_property - The property to insert
	 * @param {boolean} in_reportToView - By default, the dirtying will always be reported to the checkout view and
	 * trigger a modified event there. When batching updates, this can be prevented via this flag.
	 */
	_insert(in_key, in_property, in_reportToView) {
		if (validationsEnabled.enabled) {
			this._checkIsNotReadOnly(true);
		}

		// Add the child property to the dynamic properties
		IndexedCollectionBaseProperty.prototype._insert.call(this, in_key, in_property, false);

		// We postponed the report above, to make sure the child property has actually been appended to this
		// node, before the report is forwarded to the view
		if (in_reportToView) {
			this._reportDirtinessToView();
		}
	}

	/**
	 * Removes an entry with the given key
	 *
	 * @param {string} in_key - key of the entry
	 * @param {boolean} in_reportToView - By default, the dirtying will always be reported to the checkout view and
	 * trigger a modified event there. When batching updates, this can be prevented via this flag.
	 */
	_removeByKey(in_key, in_reportToView) {
		this._checkIsNotReadOnly(true);

		if (this._dynamicChildren[in_key]) {
			// Remove from the indexed collection
			IndexedCollectionBaseProperty.prototype._removeByKey.call(this, in_key, in_reportToView);
		} else {
			console.error(MSG.REMOVING_NON_EXISTING_KEY + in_key);
		}
	}

	/**
	 * Stores the information to which CheckedOutRepositoryInfo object this root property belongs.
	 * Note: these functions should only be used internally (within the PropertySets library)
	 *
	 * @param {property-properties.CheckoutView~CheckedOutRepositoryInfo} in_checkedOutRepositoryInfo -
	 * The checked out repository info this root property belongs to.
	 * @protected
	 */
	_setCheckedOutRepositoryInfo(in_checkedOutRepositoryInfo) {
		this._checkedOutRepositoryInfo = in_checkedOutRepositoryInfo;
	}

	/**
	 * Gets the information to which CheckedOutRepositoryInfo object this root property belongs.
	 * Note: these functions should only be used internally (within the PropertySets library)
	 *
	 * @return {property-properties.CheckoutView~CheckedOutRepositoryInfo|undefined} If this is the root of the
	 * checked out hierarchy, this will return the checkout.
	 * @protected
	 */
	_getCheckedOutRepositoryInfo() {
		return this._checkedOutRepositoryInfo;
	}

	/**
	 * Returns the name of all the static sub-properties of this property.
	 *
	 * @return {Array.<string>} An array of all the static property ids
	 */
	getStaticIds() {
		return Object.keys(this._staticChildren);
	}

	/**
	 * Returns the name of all the dynamic sub-properties of this property.
	 *
	 * @return {Array.<string>} An array of all the dynamic property ids
	 */
	getDynamicIds() {
		return Object.keys(this._dynamicChildren);
	}

	/**
	 * Returns an Object with all the dynamic children of this node property.
	 *
	 * WARNING: This is a direct access to the internal data-structure and the collection MUST NOT be modified. It is
	 * read only for fast access and iteration. Insertion and deletion MUST be done via the insert and remove functions
	 * of this class.
	 *
	 * @return {Object<String, property-properties.MapProperty~MapValueType>} The map with all entries in the map.
	 */
	_getDynamicChildrenReadOnly() {
		return this._dynamicChildren;
	}

	/**
	 * Given an object that mirrors a PSet Template, assign the properties.
	 *
	 * E.g.
	 *
	 * ```
	 * <pre>
	 * Templates = {
	 *   properties: [
	 *     { id: 'foo', typeid: 'String' },
	 *     { id: 'bar', properties: [{id: 'baz', typeid: 'Uint32'}] }
	 *   ]
	 * }
	 * </pre>
	 * ```
	 *
	 * You would update the values like: `baseProperty.setValues({foo: 'hello', bar: {baz: 1}});`
	 *
	 * WARNING: not completely implemented for all types.
	 *
	 * @param {object} in_properties - The properties you would like to assign
	 * @private
	 */
	setValues(in_properties) {
		var checkoutView = this._getCheckoutView();
		if (checkoutView !== undefined) {
			checkoutView.pushNotificationDelayScope();
			ContainerProperty.prototype._setValues.call(this, in_properties, false, false);
			checkoutView.popNotificationDelayScope();
		} else {
			ContainerProperty.prototype._setValues.call(this, in_properties, false, false);
		}
	}
}

ContainerProperty.prototype._typeid = "ContainerProperty";
ContainerProperty.prototype._dynamicChildren = {};
ContainerProperty.prototype._optionalChildren = {};

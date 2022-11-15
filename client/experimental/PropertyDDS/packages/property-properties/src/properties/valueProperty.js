/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const { ChangeSet } = require('@fluid-experimental/property-changeset');
const { MSG } = require('@fluid-experimental/property-common').constants;
const { BaseProperty } = require('./baseProperty');

/**
 * This class serves as a view to read, write and listen to changes in an
 * object's value field. To do this we simply keep a pointer to the object and
 * its associated data field that we are interested in. If no data field is
 * present this property will fail constructing.
 */
export class ValueProperty extends BaseProperty {
    /**
     * @virtual
     * @param {Object=} in_params - The parameters
     * @param {Object=} in_params.dataObj - Optional argument containing an object that should be used as the backing
     * store of this value property.
     * @param {Object=} in_params.dataId - optional argument must be provided when in_params.dataObj is passed. Must
     * contain a valid member name of dataObj. This member will be used to set/get values of this value property.
     * @constructor
     * @protected
     * @extends property-properties.BaseProperty
     * @alias property-properties.ValueProperty
     * @category Value Properties
     */
    constructor(in_params) {
        super(in_params);
        this._data = undefined;
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
     * returns the current value of ValueProperty
     * @return {*} the current value
     */
    getValue() {
        return this._data;
    }

    /**
     * Ensure the array dirty mask is also cleaned when cleaning the tree.
     *
     * @param {property-properties.BaseProperty.MODIFIED_STATE_FLAGS} [in_flags] - The flags to clean.
     * If none are supplied all will be removed.
     */
    cleanDirty(in_flags) {
        this._cleanDirty(in_flags);
    }

    /**
     * @param {*} in_value - The new value
     * @throws If property is read only
     */
    setValue(in_value) {
        this._checkIsNotReadOnly(true);
        this._setValue(in_value, true);
    }

    /**
     * Internal function to update the value of a property
     *
     * @param {*} in_value - The new value
     * @param {boolean} [in_reportToView = true] - By default, the dirtying will always be reported to the checkout view
     * and trigger a modified event there. When batching updates, this can be prevented via this flag.
     * @return {boolean} true if the value was actually changed
     */
    _setValue(in_value, in_reportToView) {
        // dirtiness check: setValue casts the input e.g. in an
        // int property 1.2 gets cast to 1, in a boolean property
        // false gets cast to 0,... so we first have to cast(set)
        // and then compare the value here:
        var oldValue = this._data;
        var castedValue = this._castFunctor(in_value);
        var changed = castedValue !== oldValue;
        if (changed) {
            this._data = castedValue;
            this._setDirty(in_reportToView);
        }
        return changed;
    }

    /**
     * @inheritdoc
     */
    _deserialize(in_serializedObj, in_reportToView,
                 in_filteringOptions, in_createChangeSet) {
        if (ChangeSet.isEmptyChangeSet(in_serializedObj)) {
            console.warn(MSG.DESERIALIZE_EMPTY_CHANGESET);
            return undefined;
        } else {
            var changed = this._setValue(in_serializedObj, in_reportToView);
            return changed ? this._data : undefined;
        }
    }

    /**
     * @inheritdoc
     */
    _applyChangeset(in_changeSet, in_reportToView, in_filteringOptions) {
        if (!ChangeSet.isEmptyChangeSet(in_changeSet)) {
            var newVal = in_changeSet;
            if (typeof newVal === 'object') {
                newVal = newVal.value;
            }
            this._setValue(newVal, in_reportToView);
        }
    }

    /**
     * @inheritdoc
     */
    _reapplyDirtyFlags(in_pendingChangeSet, in_dirtyChangeSet) {
        const flags = (ChangeSet.isEmptyChangeSet(in_pendingChangeSet) ?
            BaseProperty.MODIFIED_STATE_FLAGS.CLEAN : BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE) |
            (ChangeSet.isEmptyChangeSet(in_dirtyChangeSet) ?
                BaseProperty.MODIFIED_STATE_FLAGS.CLEAN : BaseProperty.MODIFIED_STATE_FLAGS.DIRTY);
        if (flags) {
            this._setDirty(false, this, flags);
        }
    }

    /**
     * Serialize the property
     *
     * @param {boolean} in_dirtyOnly - Only include dirty entries in the serialization
     * @param {boolean} in_includeRootTypeid - Include the typeid of the root of the hierarchy.
     * Has no effect for ValueProperty
     * @param {property-properties.BaseProperty.MODIFIED_STATE_FLAGS} [in_dirtinessType] -
     * The type of dirtiness to use when reporting dirty changes. By default this is `PENDING_CHANGE`.
     * @param {boolean} [in_includeReferencedRepositories=false] - If this is set to true, the serialize
     * function will descend into referenced repositories. WARNING: if there are loops in the references
     * this can result in an infinite loop
     *
     * @return {*} The serialized representation of this property
     * @private
     */
    _serialize(in_dirtyOnly, in_includeRootTypeid,
        in_dirtinessType, in_includeReferencedRepositories) {
        if (in_dirtyOnly) {
            return this._isDirty(in_dirtinessType) ? this._data : {};
        } else {
            return this._data;
        }
    }

    /**
     * Calls back the given function with a human-readable string
     * representation of the property.
     * @param {string} indent - Leading spaces to create the tree representation
     * @param {string} externalId - Name of the current property at the upper level. Used for arrays.
     * @param {function} printFct - Function to call for printing each property
     */
    _prettyPrint(indent, externalId, printFct) {
        printFct(indent + externalId + this.getId() + ' (' + this.getTypeid() + '): ' + this.value);
    }

    /**
     * Return a JSON representation of the property.
     * @return {object} A JSON representation of the property.
     * @private
     */
    _toJson() {
        return {
            id: this.getId(),
            context: this._context,
            typeid: this.getTypeid(),
            isConstant: this._isConstant,
            value: this.getValue(),
        };
    }

    get value() {
        return this.getValue.apply(this, arguments);
    }
    set value(val) {
        this.setValue.call(this, val);
    }
}

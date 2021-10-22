/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { BaseProperty, IBasePropertyParams } from './baseProperty';
import { ChangeSet } from '@fluid-experimental/property-changeset';
import { constants } from '@fluid-experimental/property-common';

const { MSG } = constants;
/**
 * This class serves as a view to read, write and listen to changes in an
 * object's value field. To do this we simply keep a pointer to the object and
 * its associated data field that we are interested in. If no data field is
 * present this property will fail constructing.
 */
export class ValueProperty<T = any> extends BaseProperty {
    protected _data: T = undefined;
    private _castFunctor: any;


    constructor(in_params: IBasePropertyParams) {
        super(in_params);
    };


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
     * returns the current value of ValueProperty
     * @returns the current value
     */
    getValue(): T {
        return this._data;
    };

    /**
     * Ensure the array dirty mask is also cleaned when cleaning the tree.
     *
     * @param in_flags - The flags to clean, if none are supplied all
     *                                                                       will be removed
     */
    cleanDirty(in_flags?: BaseProperty.MODIFIED_STATE_FLAGS) {
        this._cleanDirty(in_flags);
    };

    /**
     * @param in_value the new value
     * @throws if property is read only
     */
    setValue(in_value: T) {
        this._checkIsNotReadOnly(true);
        this._setValue(in_value, true);
    };

    /**
     * Internal function to update the value of a property
     *
     * @param in_value the new value
     * @param in_reportToView - By default, the dirtying will always be reported to the checkout view
     *                                             and trigger a modified event there. When batching updates, this
     *                                             can be prevented via this flag.
     * @returns true if the value was actually changed
     */
    _setValue(in_value: T, in_reportToView = true): boolean {
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
    };

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
    };

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
    };

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
    };


    /**
     * Serialize the property
     *
     * @param in_dirtyOnly - Only include dirty entries in the serialization
     * @param in_includeRootTypeid - Include the typeid of the root of the hierarchy - has no effect for ValueProperty
     * @param in_dirtinessType - The type of dirtiness to use when reporting dirty changes.
     * @param in_includeReferencedRepositories - If this is set to true, the serialize
     *     function will descend into referenced repositories. WARNING: if there are loops in the references
     *     this can result in an infinite loop
     *
     * @returns The serialized representation of this property
     * @private
     */
    _serialize(
        in_dirtyOnly: boolean,
        in_includeRootTypeid: boolean,
        in_dirtinessType: BaseProperty.MODIFIED_STATE_FLAGS = BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE,
        in_includeReferencedRepositories: boolean = false
    ) {
        if (in_dirtyOnly) {
            if (this._isDirty(in_dirtinessType)) {
                return this._data;
            } else {
                return {};
            }
        } else {
            return this._data;
        }
    };

    /**
     * Calls back the given function with a human-readable string
     * representation of the property.
     * @param indent - Leading spaces to create the tree representation
     * @param externalId - Name of the current property at the upper level.
     *                              Used for arrays.
     * @param printFct - Function to call for printing each property
     */
    _prettyPrint(indent: string, externalId: string, printFct: (x: string) => void) {
        printFct(indent + externalId + this.getId() + ' (' + this.getTypeid() + '): ' + this.value);
    };

    /**
     * Return a JSON representation of the property.
     * @returns A JSON representation of the property.
     * @private
     */
    _toJson(): object {
        return {
            id: this.getId(),
            context: this._context,
            typeid: this.getTypeid(),
            isConstant: this._isConstant,
            value: this.getValue()
        };
    };

    get value() {
        return this.getValue();
    }

    set value(val: T) {
        this.setValue(val);
    }
}

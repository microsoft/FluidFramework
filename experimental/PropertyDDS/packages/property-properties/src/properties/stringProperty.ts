/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import _ from 'lodash';
import { ValueArrayProperty } from './valueArrayProperty';
import { ArrayProperty, IArrayPropertyParams } from './arrayProperty';
import { constants, StringDataArray } from '@fluid-experimental/property-common';
import { ChangeSet, SerializedChangeSet } from '@fluid-experimental/property-changeset';
import { ConsoleUtils } from '@fluid-experimental/property-common';
import { BaseProperty } from './baseProperty';

const { MODIFIED_STATE_FLAGS } = BaseProperty;
const { MSG } = constants;

// Some global constant objects that are used to indicate a few special
// cases for the dirty object. If the string was directly set to a literal,
// we don't need to store any ChangeSet, we only need to store the information
// that it was updated to a literal and the dirty flags.
// By using these special objects we avoid the memory overhead of having a separate
// object for each array in this state.
const PENDING_AND_DIRTY_SET_TO_PROPERTY_VALUE = {
    pending: 'setAsLiteral',
    dirty: 'setAsLiteral',
    flags: MODIFIED_STATE_FLAGS.PENDING_CHANGE | MODIFIED_STATE_FLAGS.DIRTY
} as const;
const NO_DIRTY_AND_PENDING_SET_TO_PROPERTY_VALUE = {
    pending: 'setAsLiteral',
    dirty: undefined,
    flags: MODIFIED_STATE_FLAGS.PENDING_CHANGE
} as const;

const DIRTY_AND_NO_PENDING_SET_TO_PROPERTY_VALUE = {
    pending: 'setAsLiteral',
    dirty: undefined,
    flags: MODIFIED_STATE_FLAGS.DIRTY
} as const;

const STRING_PROPERTY_SET_PROPERTY_VALUE_STATE_FLAGS = [
    undefined,
    NO_DIRTY_AND_PENDING_SET_TO_PROPERTY_VALUE,
    DIRTY_AND_NO_PENDING_SET_TO_PROPERTY_VALUE,
    PENDING_AND_DIRTY_SET_TO_PROPERTY_VALUE
];

/**
 * A primitive property for a string value.
 */
export class StringProperty extends ValueArrayProperty {
    _size: number;
    /**
     * @param in_params - the parameters
     */
    constructor(in_params: IArrayPropertyParams) {
        super({ ...in_params, typeid: 'String' });
        this._noDirtyInBase = true;
    };


    get _context() { return 'single'; }

    /**
     * Get the string value
     * @returns the JavaScript string primitive value of this StringProperty
     */
    getValue(): string {
        return this._dataArrayRef.getBuffer();
    };

    /**
     * Private helper function to update the internal dirty and pending changes
     *
     * @param in_changeSet - The changeset to apply
    */
    _updateChanges(in_changeSet: SerializedChangeSet) {
        // we need to convert the format to allow the application of the changes
        // since _performApplyAfterOnPropertyArray only understands insert/modify/remove commands
        var pendingChangesWereSetBefore = false;
        var pendingChanges = this._getPendingChanges();

        if (_.isString(pendingChanges)) {
            pendingChanges = { insert: [[0, pendingChanges]] };
            pendingChangesWereSetBefore = true;
        }
        ChangeSet.prototype._performApplyAfterOnPropertyArray(pendingChanges,
            in_changeSet, this.getFullTypeid(true));
        if (pendingChangesWereSetBefore) {
            pendingChanges = pendingChanges.insert[0][1];
        }

        var dirtyChangesWereSetBefore = false;
        var dirtyChanges = this._getDirtyChanges();

        if (_.isString(dirtyChanges)) {
            dirtyChanges = { insert: [[0, dirtyChanges]] };
            dirtyChangesWereSetBefore = true;
        }
        ChangeSet.prototype._performApplyAfterOnPropertyArray(dirtyChanges,
            in_changeSet, this.getFullTypeid(true));
        if (dirtyChangesWereSetBefore) {
            dirtyChanges = dirtyChanges.insert[0][1];
        }

        this._setChanges(pendingChanges, dirtyChanges);
    };

    _getPendingChanges() {
        if (this._dirty === PENDING_AND_DIRTY_SET_TO_PROPERTY_VALUE ||
            this._dirty === NO_DIRTY_AND_PENDING_SET_TO_PROPERTY_VALUE) {
            return this.getValue();
        }

        return (this._dirty && this._dirty.pending) || {};
    };

    _getDirtyChanges() {
        if (this._dirty === PENDING_AND_DIRTY_SET_TO_PROPERTY_VALUE) {
            return this.getValue();
        } else if (this._dirty === NO_DIRTY_AND_PENDING_SET_TO_PROPERTY_VALUE) {
            return {};
        }

        return (this._dirty && this._dirty.dirty) || {};
    };

    /**
     * inserts a string starting at a position and shifts the rest of
     * the String to the right. Will not overwrite existing values.
     * @param in_position - target index
     * @param in_value - value to be inserted
     * @throws if in_position is smaller than zero, larger than the length of the string or not a number
     * @throws if in_value is not a string
     */
    insert(in_position: number, in_value: string) {
        ConsoleUtils.assert(_.isString(in_value), MSG.IN_VALUE_MUST_BE_STRING + in_value);
        this._insertRange(in_position, in_value);
    };

    /**
     * Adds letters to the end of the string
     * @param in_value - the string to be pushed
     * @throws if in_value is not a string
     * @returns the new length of the string.
     */
    push(in_value: string): number {
        ConsoleUtils.assert(_.isString(in_value), MSG.IN_VALUE_MUST_BE_STRING + in_value);
        this._insertRange(this._dataArrayRef.length, in_value);
        return this.getLength();
    };


    /**
     * inserts values
     * @param in_position - target index
     * @param in_value - the string to be inserted
     */
    _insertRange(in_position: number, in_value: string) {
        this._checkIsNotReadOnly(true);
        this._insertRangeWithoutDirtying(in_position, in_value);
        this._setDirty();
    };

    /**
      * Returns the full property type identifier for the ChangeSet including the enum type id
      * @param in_hideCollection - if true the collection type (if applicable) will be omitted
      *                since that is not applicable here, this param is ignored
      * @returns The typeid
      */
    getFullTypeid(in_hideCollection = false): string {
        return this._typeid;
    };

    /**
     * returns the String to an empty string.
     */
    clear() {
        this.setValue('');
    };

    /**
     * removes a given number of elements from the array property and shifts
     * remaining values to the left.
     * @param in_offset - target start index
     * @param in_deleteCount - number of elements to be deleted
     * @throws if in_offset is not a number
     * @throws if in_deleteCount is not a number
     * @throws if trying to remove an item with a parent
     * @throws if in_offset is smaller than zero or if in_offset + in_delete count is larger than the length of the array
     * @returns the part of the string that was removed.
     */
    removeRange(in_offset: number, in_deleteCount: number): any { //TODO: fix return type to string
        ConsoleUtils.assert(_.isNumber(in_offset),
            MSG.NOT_NUMBER + 'in_offset, method: StringProperty.remove or .removeRange');
        ConsoleUtils.assert(_.isNumber(in_deleteCount),
            MSG.NOT_NUMBER + 'in_deleteCount, method: StringProperty.remove or .removeRange');
        ConsoleUtils.assert(in_offset + in_deleteCount < this.length + 1 && in_offset >= 0 && in_deleteCount > 0,
            MSG.REMOVE_OUT_OF_BOUNDS + 'Cannot remove ' + in_deleteCount + ' items starting at index ' + in_offset);
        var result = '';
        for (var i = in_offset; i < in_offset + in_deleteCount; i++) {
            result += this.get(i);
        }
        this._checkIsNotReadOnly(true);
        this._removeRangeWithoutDirtying(in_offset, in_deleteCount);
        this._setDirty();
        return result;
    };


    /**
     * @inheritdoc
     */
    _deserialize(
        in_serializedObj: SerializedChangeSet,
        in_reportToView: boolean,
        in_filteringOptions: object,
        in_createChangeSet: boolean) {
        if ((in_serializedObj.remove && in_serializedObj.remove.length > 0) ||
            (in_serializedObj.modify && in_serializedObj.modify.length > 0) ||
            (in_serializedObj.insert &&
                (in_serializedObj.insert.length > 1 ||
                    (in_serializedObj.insert.length === 1 &&
                        (in_serializedObj.insert[0][0] !== 0 ||
                            !_.isString(in_serializedObj.insert[0][1])))))) {
            throw new Error(MSG.NO_NORMALIZED_CHANGESET);
        }

        var oldStringLength = this._dataArrayRef.length;
        var newStringData;
        if (_.isString(in_serializedObj)) {
            if (this._setValue(in_serializedObj, in_reportToView)) {
                return in_serializedObj;
            } else {
                return {};
            }
        } else {
            if (!in_serializedObj.insert ||
                !in_serializedObj.insert[0]) {
                // we've got an empty object, so we have to wipe everything we've got
                if (oldStringLength > 0) {
                    this.removeRange(0, oldStringLength);
                    return {
                        remove: [[0, oldStringLength]]
                    };
                } else {
                    // the string was already empty, nothing has changed
                    return {};
                }
            } else {
                newStringData = in_serializedObj.insert[0][1];
            }
        }

        if (newStringData === this._dataArrayRef.getBuffer()) {
            // nothing changed
            return {};
        }

        // check if something was attached (very common case)
        if (newStringData.length > oldStringLength) {
            if (newStringData.substring(0, oldStringLength) === this._dataArrayRef.getBuffer()) {
                var appendChanges = {
                    insert: [[oldStringLength, newStringData.substring(oldStringLength)]]
                };
                this.insertRange(oldStringLength, newStringData.substring(oldStringLength));
                return appendChanges;
            }
        }

        // most simplistic diff method: Remove all existing data and insert the new data
        var simpleChanges: SerializedChangeSet = {
            insert: [[0, newStringData]]
        };
        if (oldStringLength > 0) {
            simpleChanges.remove = [[0, oldStringLength]];
            this._removeRangeWithoutDirtying(0, oldStringLength);
        }
        this.insertRange(0, newStringData);
        return simpleChanges;
    };

    /**
     * Serialize the property
     *
     * @param in_dirtyOnly - Only include dirty entries in the serialization
     * @param in_includeRootTypeid - Include the typeid of the root of the hierarchy - has no effect for ArrayProperty
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
        in_includeReferencedRepositories = false
    ): object {
        if (in_dirtyOnly) {
            return ArrayProperty.prototype._serialize.call(this, in_dirtyOnly, in_includeRootTypeid, in_dirtinessType);
        } else {
            // returns just the current data
            return this._dataArrayRef.getBuffer();
        }
    };

    /**
     * @param in_value - the new value
     * @throws if string property is read only
     */
    setValue(in_value: string) {
        this._checkIsNotReadOnly(true);
        this._setValue(in_value, true);
    };

    /**
     * @param in_values - the new values
     * @param in_initial  - Whether we are setting default/initial values
     *   or if the function is called directly with the values to set.
     */
    _setValues(in_values: string, in_initial: boolean) {
        throw new Error(MSG.NO_VALUE_PROPERTY_SETVALUES);
    };

    /**
     * @param in_values - the new values
     * @throws always - cannot use .setValues on a StringProperty. Use .setValue() instead.
     */
    setValues(in_values: string) {
        StringProperty.prototype._setValues.call(this, in_values, false);
    };

    // /**
    //  * @throws always - cannot call .getValues on a string. Use .getValue() instead
    //  */
    // getValues() {
    //     throw new Error(MSG.NO_VALUE_PROPERTY_GETVALUES);
    // };


    /**
     * Internal function to update the value of a property
     *
     * @param in_value - the new value
     * @param in_reportToView - By default, the dirtying will always be reported to the checkout view
     *                                             and trigger a modified event there. When batching updates, this
     *                                             can be prevented via this flag.
     * @returns true if the value was actually changed
     */
    _setValue(this: StringProperty, in_value: string, in_reportToView = true): boolean {
        var oldValue = this._dataArrayRef.getBuffer();
        var castedValue = String(in_value);
        var changed = castedValue !== oldValue;
        if (changed) {

            var stringLength = this._dataArrayRef.length;
            if (stringLength > 0) {
                this._dataArrayRemoveRange(0, stringLength);
            }
            this._dataArrayInsertRange(0, castedValue);

            this._dirty = PENDING_AND_DIRTY_SET_TO_PROPERTY_VALUE;

            // The assignment in the line above already set this property to
            // dirty, so we only update the parent (instead of calling
            // setDirty on this property)
            if (this._parent) {
                this._parent._setDirty(in_reportToView, this);
            } else if (in_reportToView === true || in_reportToView === undefined) {
                this._reportDirtinessToView();
            }
        }
        return changed;
    };

    /**
     * Sets the pending and dirty changesets
     *
     * @param in_pending - The pending changeset. If null is passed, no change will be
     *     applied. undefined indicates that the changes should be reset
     * @param in_dirty - The dirty changeset. If null is passed, no change will be
     *     applied. undefined indicates that the changes should be reset
     */
    _setChanges(in_pending: SerializedChangeSet | undefined | null, in_dirty: SerializedChangeSet) {
        if ((this._dirty === PENDING_AND_DIRTY_SET_TO_PROPERTY_VALUE ||
            this._dirty === NO_DIRTY_AND_PENDING_SET_TO_PROPERTY_VALUE) &&
            in_pending === null && in_dirty === undefined) {
            this._dirty = NO_DIRTY_AND_PENDING_SET_TO_PROPERTY_VALUE;
        } else {
            ArrayProperty.prototype._setChanges.call(this, in_pending, in_dirty);
        }
    };

    /**
     * Sets the dirty flags for this property
     * @param in_flags - The dirty flags
     */
    _setDirtyFlags(in_flags: number) {
        if (this._dirty === PENDING_AND_DIRTY_SET_TO_PROPERTY_VALUE ||
            this._dirty === NO_DIRTY_AND_PENDING_SET_TO_PROPERTY_VALUE) {
            this._dirty = STRING_PROPERTY_SET_PROPERTY_VALUE_STATE_FLAGS[in_flags];
            return;
        }

        ArrayProperty.prototype._setDirtyFlags.call(this, in_flags);
    };

    /**
     * Gets the dirty flags for this property
     * @returns The dirty flags
     */
    _getDirtyFlags(): number {
        if (this._dirty === PENDING_AND_DIRTY_SET_TO_PROPERTY_VALUE ||
            this._dirty === NO_DIRTY_AND_PENDING_SET_TO_PROPERTY_VALUE) {
            return this._dirty.flags;
        }

        return ArrayProperty.prototype._getDirtyFlags.call(this);
    };

    /**
     * @inheritdoc
     */
    _applyChangeset(in_changeSet, in_reportToView) {
        // It is unfortunate, but because StringProperty derives from ArrayProperty, it can happen
        // that we receive here a ChangeSet that is formatted for an Array. We must be able to
        // distinguish it from a reversible changeset and from a simple changeset...
        // TODO: We need a formal way to know what kind of content we are to expect in a ChangeSet,
        // we should never have to guess that.
        if (typeof in_changeSet === 'string') {
            // Let's consider it's a simple changeset.
            this._setValue(in_changeSet, in_reportToView);
        } else if (in_changeSet.value !== undefined) {
            // Let's consider it's a reversible changeset.
            this._setValue(in_changeSet.value, in_reportToView);
        } else {
            // Let's consider it's an ArrayProperty-like changeset
            ArrayProperty.prototype._applyChangeset.call(this, in_changeSet, in_reportToView);
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
        printFct(indent + externalId + this.getId() + ' (' + this.getTypeid() + '): "' + this.value + '"');
    };

    /**
     * Return a JSON representation of the property.
     * @returns A JSON representation of the property.
     */
    _toJson(): object {
        return {
            id: this.getId(),
            context: this._context,
            typeid: this.getTypeid(),
            isConstant: this._isConstant,
            value: this.value
        };
    };

    /**
     * Sets the value of a character at a single index.
     * For example, if you have a string of value 'AAAA' and do .set(1, 'a') => 'AaAA'
     * @param in_index - the index you wish to set
     * @param in_character - the character you wish to set
     * @throws if length of in_character is longer than one character
     */
    set(in_index: number, in_character: string) {
        ConsoleUtils.assert(_.isNumber(in_index), MSG.STRING_SET_NEEDS_INDEX + in_index);

        if (in_character.length !== 1) {
            throw new Error(MSG.STRING_SET_ONE_CHAR);
        }

        this.setRange(in_index, in_character);
    };

    /**
     * sets values in a string starting at an index.
     * For example, if you have a string of Value 'AAAA' and do .setRange(1, 'aa') => AaaA
     * It will set as many letters as are in in_string.
     * @param in_index - the index at which you wish to start setting
     * @param in_string - the string you wish to set
     * @throws if in_index  + length of in_string is longer than the original string
     */
    setRange(in_index: number, in_string: string) {
        ArrayProperty.prototype.setRange.call(this, in_index, in_string);
    };

    /**
     * get a letter at a given index
     * @param in_index - the index
     * @returns the single letter found at in_index
     */
    get(in_index: number): any { // TODO: fix return type to string
        return ArrayProperty.prototype.get.call(this, in_index);
    };

    /**
     * inserts a string starting at a position and shifts the rest of the String to the right.
     * Will not overwrite existing values.
     * For StringProperty, insert and insertRange work the same, except that .insert
     * checks that in_value is a string and .insertRange will accept an array of strings.
     * @param in_position - target index
     * @param in_value - value to be inserted
     * @throws if in_position is smaller than zero, larger than the length of the string or not a number
     */
    insertRange(in_position: number, in_value: string | Array<string>) {
        if (_.isArray(in_value)) {
            in_value = in_value.join('');
        }
        this._insertRange(in_position, in_value);
    };

    /**
     * Creates and initializes the data array
     */
    _dataArrayCreate() {
        this._dataArrayRef = new StringDataArray();
    };

    /**
     * Returns the length of the data array
     * @returns The length
     */
    _dataArrayGetLength(): number {
        return this._dataArrayRef.length;
    };

    /**
     * Returns the data array's internal buffer
     * @returns The buffer
     */
    _dataArrayGetBuffer(): string {
        return this._dataArrayRef.getBuffer();
    };

    /**
     * Returns an entry from the data array
     * @param in_i - Position in the array
     *
     * @return {*} The value at index in_i
     */
    _dataArrayGetValue(in_i: number) {
        in_i = in_i === undefined ? 0 : in_i;
        if (in_i >= this._size || in_i < 0) {
            throw new Error('Trying to access out of bounds!');
        }

        return this._dataArrayRef.getBuffer()[in_i];
    };

    /**
     * Set the array to the given new array
     * @param in_newString - The new contents of the array
     */
    _dataArrayDeserialize(in_newString: string) {
        this._dataArrayRef = new StringDataArray(in_newString);
    };

    /**
     * Inserts a range into the data array
     * @param in_position - Position at which the insert should be done
     * @param in_range - The array to insert
     */
    _dataArrayInsertRange(in_position: number, in_range: string) {
        this._dataArrayRef.insertRange(in_position, in_range);
    };

    /**
     * Removes a range from the data array
     * @param in_position - Position at which to start the removal
     * @param in_length - The number of entries to remove
     */
    _dataArrayRemoveRange(in_position: number, in_length: number) {
        this._dataArrayRef.removeRange(in_position, in_length);

    };

    /**
     * Overwrites a range in the data array
     * @param in_position - Position at which to start the removal
     * @param in_value - The string with which the range is overwritten
     */
    _dataArraySetRange(in_position: number, in_value: string) {
        this._dataArrayRef.set(in_position, in_value);
    };


    get value() {
        return this.getValue();
    }

    set value(val) {
        this.setValue.call(this, val);
    }
}

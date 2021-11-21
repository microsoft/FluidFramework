/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview Definition of the reference array property class
 */
import _ from 'lodash';
import { ValueArrayProperty } from './valueArrayProperty';
import { PathHelper, TypeIdHelper } from '@fluid-experimental/property-changeset';
import { BaseProperty } from './baseProperty';
import { constants } from '@fluid-experimental/property-common';
import { UniversalDataArray, ConsoleUtils } from '@fluid-experimental/property-common';
import { AbstractStaticCollectionProperty } from './abstractStaticCollectionProperty';
import { ReferenceProperty } from './referenceProperty';
import { IArrayPropertyParams } from './arrayProperty';
const { MSG } = constants;

/**
 * An ArrayProperty which stores reference values
 */
export class ReferenceArrayProperty extends ValueArrayProperty {

    /**
     * @param in_params - Input parameters for property creation
     */
    constructor(in_params: IArrayPropertyParams) {
        super({ typeid: 'Reference', ...in_params, });
    };

    /**
     * Returns the typeid for the target of this reference
     *
     * Note: This is the type that is specified in the typeid of this reference and not the actual type
     * of the referenced object, which might inherit from that typeid.
     *
     * @returns The typeid of the nodes this reference may point to
     */
    getReferenceTargetTypeId(): string {
        return TypeIdHelper.extractReferenceTargetTypeIdFromReference(this.getTypeid());
    };

    /**
     * Resolves the referenced property for the given key
     *
     * @param in_ids the ID of the property or an array of IDs
     *     if an array is passed, the .get function will be performed on each id in sequence
     *     for example .get([0, 'position','x']) is equivalent to .get(0).get('position').get('x').
     *     If .get resolves to a ReferenceProperty, it will, by default, return the property that the ReferenceProperty
     *     refers to.
     * @param in_options - parameter object
     * @param in_options.referenceResolutionMode - How should this function behave during reference resolution?
     *
     * @returns The property object the reference points to or undefined if it could not be resolved
     */
    get(
        in_ids: number | Array<string | number>,
        in_options: BaseProperty.PathResolutionOptions = {}
    ): BaseProperty | undefined {
        in_options.referenceResolutionMode =
            in_options.referenceResolutionMode === undefined ? BaseProperty.REFERENCE_RESOLUTION.ALWAYS :
                in_options.referenceResolutionMode;

        if (_.isArray(in_ids)) {
            // Forward handling of arrays to the AbstractStaticCollectionProperty function
            return AbstractStaticCollectionProperty.prototype.get.call(this, in_ids, in_options);
        } else {
            var value = this._dataArrayRef.getValue(in_ids);
            if (value === undefined || value === '') {
                return undefined;
            }

            return this.getParent().resolvePath(value, in_options);
        }
    };

    /**
     * Checks whether the reference is valid. This is either the case when it is empty or when the referenced
     * property exists.
     *
     * @param in_position the target index
     * @returns True if the reference is valid, otherwise false.
     */
    isReferenceValid(in_position: number): boolean {
        return ValueArrayProperty.prototype.get.call(this, in_position) === '' ||
            this.get(in_position) !== undefined;
    };

    /**
     * Sets the range in the array to point to the given property objects or to be equal to the given paths
     *
     * @param in_offset - target start index
     * @param in_array - contains the properties to be set or
     *   the paths to those properties. If undefined is passed, the reference will be set to an empty string to
     *   indicate an empty reference.
     * @throws if in_offset is smaller than zero, larger than the length of the array or not a number
     * @throws if in_array is not an array
     * @throws if one of the items in in_array is defined, but is not a property or a string.
     */
    setRange(in_offset: number, in_array: Array<BaseProperty | string>) {
        var arr = ReferenceArrayProperty._convertInputToPaths(in_array, 'setRange');
        ValueArrayProperty.prototype.setRange.call(this, in_offset, arr);
    };

    /**
     * Insert a range which points to the given property objects into the array
     *
     * @param in_offset - target start index
     * @param in_array  - contains the properties to be set or
     *   the paths to those properties. If undefined is passed, the reference will be set to an empty string to
     *   indicate an empty reference.
     * @throws if in_offset is smaller than zero, larger than the length of the array or not a number
     * @throws if in_array is not an array
     * @throws if one of the items in in_array is defined, but is not a property or a string.
     */
    insertRange(in_offset: number, in_array: Array<BaseProperty | string>) {
        var arr = ReferenceArrayProperty._convertInputToPaths(in_array, 'insertRange');
        ValueArrayProperty.prototype.insertRange.call(this, in_offset, arr);
    };

    /**
     * returns the path value of a reference.
     * @param in_id - the index of the property
     * @returns the path string
     */
    getValue(in_id: number): string {
        return this._dataArrayRef.getValue(in_id);
    };

    /**
     * Returns an object with all the nested values contained in this property
     * @returns an array of strings representing the paths listed in this array
     * for example: ['/path1', '/path2']
     */
    getValues(): string[] {
        var result = [];
        var ids = this.getIds();
        for (var i = 0; i < ids.length; i++) {
            result.push(this.getValue(+ids[i]));
        }
        return result;
    };

    /**
     * Removes the last element of the array
     * @throws if trying to modify a referenced property
     * @returns deleted element (string path)
     */
    pop(): string {
        if (this._dataArrayRef.length > 0) {
            var item = this.getValue(this._dataArrayRef.length - 1);
            this.remove(this._dataArrayRef.length - 1);
            return item;
        } else {
            return undefined;
        }
    };

    /**
     * Removes an element of the array and shift remaining elements to the left
     * @param in_position the index that will be removed
     * @throws if in_position is not a number
     * @throws if trying to remove an item with a parent
     * @throws if trying to remove something that does not exist
     * @returns the value that was removed (string path).
     */
    remove(in_position: number): string {
        var value = this.getValue(in_position);
        this.removeRange(in_position, 1);
        return value;
    };

    /**
     * Removes a given number of elements from the array and shifts remaining values to the left.
     * @param in_offset target start index
     * @param in_deleteCount number of elements to be deleted
     * @throws if in_offset is not a number
     * @throws if in_deleteCount is not a number
     * @throws if trying to remove an item with a parent
     * @throws if in_offset is smaller than zero or if in_offset + in_delete count is larger than the length of the array
     * @returns an array containing the values removed (string paths)
     */
    removeRange(in_offset: number, in_deleteCount: number): Array<string> {
        ConsoleUtils.assert(_.isNumber(in_offset),
            MSG.NOT_NUMBER + 'in_offset, method: ArrayProperty.removeRange or .remove');
        ConsoleUtils.assert(_.isNumber(in_deleteCount),
            MSG.NOT_NUMBER + 'in_deleteCount, method: ArrayProperty.removeRange or .remove');
        ConsoleUtils.assert(in_offset + in_deleteCount < this.length + 1 && in_offset >= 0 && in_deleteCount > 0,
            MSG.REMOVE_OUT_OF_BOUNDS + 'Cannot remove ' + in_deleteCount + ' items starting at index ' + in_offset);
        var result = [];
        for (var i = in_offset; i < in_offset + in_deleteCount; i++) {
            result.push(this.getValue(i));
        }
        this._checkIsNotReadOnly(true);
        this._removeRangeWithoutDirtying(in_offset, in_deleteCount);
        this._setDirty();
        return result;
    };

    /**
     * @inheritdoc
     */
    _resolvePathSegment(in_segment, in_segmentType) {

        // Array tokens are automatically resolved
        if (in_segmentType === PathHelper.TOKEN_TYPES.ARRAY_TOKEN) {
            return this.get(in_segment, { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER });
        } else {
            // Everything else is handled by the implementation in the base property
            return AbstractStaticCollectionProperty.prototype._resolvePathSegment.call(this, in_segment, in_segmentType);
        }
    };

    /**
     * Creates and initializes the data array
     * @param in_length - the initial length of the array
     */
    _dataArrayCreate(in_length: number) {
        this._dataArrayRef = new UniversalDataArray(in_length);
        for (var i = 0; i < in_length; i++) {
            this._dataArraySetValue(i, '');
        }
    };

    /**
     * Validates the array and returns a sanitized version of it containing only strings.
     *
     * @param in_array  - contains the properties to be set or
     *   the paths to those properties. If undefined is passed, the reference will be set to an empty string to
     *   indicate an empty reference.
     * @param in_callerName  - the name of the function that called, to make it appear in
     *   the error message if any
     * @returns the array of paths
     * @throws if in_array is not an array
     * @throws if one of the items in in_array is defined, but is not a property or a string.
     */
    static _convertInputToPaths = function(in_array: Array<BaseProperty | string>, in_callerName: string): Array<string> {
        if (!_.isArray(in_array)) {
            throw new Error(MSG.IN_ARRAY_NOT_ARRAY + 'ReferenceArrayProperty.' + in_callerName);
        }
        var len = in_array.length;
        var arr = new Array(len);
        for (var i = 0; i < len; i++) {
            arr[i] = ReferenceProperty._convertInputToPath(in_array[i]);
        }
        return arr;
    };

}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview Definition of the ReferenceProperty class
 */

import _ from 'lodash';
import { ValueProperty } from './valueProperty';
import { PathHelper, TypeIdHelper } from '@fluid-experimental/property-changeset';
import { BaseProperty, IBasePropertyParams } from './baseProperty';
import { AbstractStaticCollectionProperty } from './abstractStaticCollectionProperty';
import { _castFunctors } from './primitiveTypeCasts';
import { constants } from '@fluid-experimental/property-common';

const { MSG } = constants;

/**
 * This class serves as a view to read, write and listen to changes in an
 * object's value field. To do this we simply keep a pointer to the object and
 * it's associated data field that we are interested in. If no data field is
 * present this property will have an undefined value.
 */
export class ReferenceProperty extends ValueProperty {

    constructor(in_params: IBasePropertyParams) {
        super({ typeid: 'Reference', ...in_params });
        // default for this property type is an empty string
        this._data = '';
    };

    _castFunctor = _castFunctors.String;

    /**
     * Evaluates Reference properties as primitives.
     * @returns true since Reference properties are primitives.
     */
    isPrimitiveType(): boolean {
        return true;
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
     * Resolves the referenced property
     *
     * @param in_ids - the ID of the property or an array of IDs
     *     if an array is passed, the .get function will be performed on each id in sequence
     *     for example .get(['position','x']) is equivalent to .get('position').get('x').
     *     If .get resolves to a ReferenceProperty, it will return the property that the ReferenceProperty
     *     refers to.
     * @param in_options - parameter object
     * @returns The property object the reference points to or undefined if it
     *    could not be resolved
     */
    get(
        in_ids: string | number | Array<string | number>,
        in_options: BaseProperty.PathResolutionOptions = {}
    ): BaseProperty | undefined {
        in_options.referenceResolutionMode =
            in_options.referenceResolutionMode === undefined ? BaseProperty.REFERENCE_RESOLUTION.ALWAYS :
                in_options.referenceResolutionMode;

        if (Array.isArray(in_ids) && in_ids.length === 0) {
            return this;
        }

        // Since this is a reference property, we return undefined, if reference resolution is disabled
        if (in_options.referenceResolutionMode !== BaseProperty.REFERENCE_RESOLUTION.ALWAYS) {
            return undefined;
        }

        if (this.value === '') {
            return undefined;
        }

        if (this.getParent() === undefined) {
            return undefined;
        }
        var resolvedProperty = this.getParent().resolvePath(this.value,
            { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.ALWAYS });

        if (resolvedProperty !== undefined && Array.isArray(in_ids)) {
            // Forward handling of arrays to the BaseProperty function
            return resolvedProperty.get(in_ids, in_options);
        } else {
            return resolvedProperty;
        }
    };

    /**
     * Expand a path returning the value or property at the end.
     *
     * @param in_path - the path
     * @param in_options - parameter object
     * @returns resolved path
     * @throws if the path resolves to a primitive value
     * @throws if in_path is not a valid path
     */
    resolvePath(
        in_path: string,
        in_options: BaseProperty.PathResolutionOptions
    ) {
        if (in_options && in_options.referenceResolutionMode &&
            in_options.referenceResolutionMode === BaseProperty.REFERENCE_RESOLUTION.NEVER) {
            return undefined;
        }
        return AbstractStaticCollectionProperty.prototype.resolvePath.call(this, in_path, in_options);
    };

    /**
     * Checks whether the reference is valid. This is either the case when it is empty or when the referenced
     * property exists.
     *
     * @returns True if the reference is valid, otherwise false.
     */
    isReferenceValid(): boolean {
        return this.value === '' || this.ref !== undefined;
    };

    /**
     * Sets the reference to point to the given property object or to be equal to the given path string.
     *
     * @param in_value - The property to assign to the reference or
     *   the path to this property. If undefined is passed, the reference will be set to an empty string to
     *   indicate an empty reference.
     * @throws if property is read only
     * @throws if in_value is defined, but is not a property or a string.
     */
    setValue(in_value?: BaseProperty | string) {
        this._checkIsNotReadOnly(true);
        var value = ReferenceProperty._convertInputToPath(in_value);
        // Forward the call to setValue
        ValueProperty.prototype.setValue.call(this, value);
    };

    /**
     * Sets the reference to point to the given property object or to be equal to the given path string.
     *
     * @param in_value - The property to assign to the reference or
     *   the path to this property. If undefined is passed, the reference will be set to an empty string to
     *   indicate an empty reference.
     * @throws if property is read only
     * @throws if in_value is defined but is not a property or a string.
     */
    set(in_value?: BaseProperty | string) {
        return this.setValue(in_value);
    }

    /**
     * @inheritdoc
     */
    _resolvePathSegment(in_segment, in_segmentType) {

        // path segments and array tokens are no longer automatically forwarded to the referenced node
        if (in_segmentType === PathHelper.TOKEN_TYPES.ARRAY_TOKEN ||
            in_segmentType === PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN) {
            return undefined;
        } else {
            return AbstractStaticCollectionProperty.prototype._resolvePathSegment.call(this, in_segment, in_segmentType);
        }
    };

    // Define a property to simplify accessing the referenced path
    get ref() {
        return this.get.apply(this, arguments);
    }

    set ref(val) {
        this.set.call(this, val);
    }

    /**
     * Validates the input and does as much as possible to return a string representing a path.
     *
     * @param in_value - contains the property to be set or
     *  the path to this property. If undefined is passed, the reference will be set to an empty string to
     *  indicate an empty reference.
     * @returns the path
     * @throws if in_value is defined, but is not a property or a string.
     */
    static _convertInputToPath(in_value?: BaseProperty | string): string{
        var path;
        if (typeof in_value === 'string') {
            path = in_value;
        } else if (in_value === undefined) {
            path = '';
        } else if (in_value instanceof BaseProperty) {
            // TODO: Check whether this is still the correct path once we start to support repository references
            path = in_value.getAbsolutePath();
        } else {
            throw new Error(MSG.PROPERTY_OR_UNDEFINED + '(' + typeof in_value + ') ' + in_value);
        }
        return path;
    }

}

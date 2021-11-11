/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview Definition of the named property class
 */

import { ContainerProperty } from './containerProperty';
import { BaseProperty } from './baseProperty';
import { ValueProperty } from '..';

/**
 * A NamedProperty has a URN which uniquely identifies the property object. This makes it possible to store it in a
 * set collection.
 */
export class NamedProperty extends ContainerProperty {

    constructor(in_params) {
        super({ typeid: 'NamedProperty', ...in_params });
    };

    /**
     * Returns a string identifying the property
     *
     * If an id has been explicitly set on this property we return that one, otherwise the GUID is used.
     *
     * @returns  String identifying the property
     */
    getId(): string {
        if (this._id !== null) {
            return this._id;
        } else {
            return this.getGuid();
        }
    };

    /**
     * Returns the GUID of this named property
     * A Guid is a unique identifier for a branch, commit or repository,
     * similar to a URN. Most functions in the API will us a URN but the
     * Guid is used to traverse the commit graph.
     * @returs The GUID
     */
    getGuid(): string {
        const guid = this.get('guid', { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER }) as ValueProperty;
        return guid ? guid.getValue() : '';
    };


    //TODO: THIS IS DISABLED FOR THE MOMENT, UNTIL WE BETTER UNDERSTAND HOW REFERENCES WORK IN FLUID
    /**
     * Return the URN for this named property
     * @return {string} The URN
     */
    /*NamedProperty.prototype.getUrn = function() {

    };*/

}

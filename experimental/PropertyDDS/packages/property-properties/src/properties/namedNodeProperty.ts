/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview Definition of the named node property class
 */

import { NamedProperty } from './namedProperty';
import { NodeProperty } from './nodeProperty';

/**
 * A NamedNodeProperty is a NodeProperty that has a GUID which unique identifies the property object.
 * This makes it possible to store it in a set collection.
 */
export class NamedNodeProperty extends NodeProperty {

    constructor(in_params) {
        super({ typeid: 'NamedNodeProperty', ...in_params });
    }

    /**
     * Returns a string identifying the property
     *
     * If an id has been explicitly set on this property we return that one, otherwise the GUID is used.
     *
     * @returns string identifying the property
     */
    getId = NamedProperty.prototype.getId;

    /**
     * Returns the GUID of this named property
     * A Guid is a unique identifier for a branch, commit or repository,
     * similar to a URN. Most functions in the API will us a URN but the
     * Guid is used to traverse the commit graph.
     * @returns The GUID
     */
    getGuid = NamedProperty.prototype.getGuid;
}

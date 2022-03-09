/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview Definition of the named node property class
 */

const { NamedProperty } = require('./namedProperty');
const { NodeProperty } = require('./nodeProperty');

/**
 * A NamedNodeProperty is a NodeProperty that has a GUID which unique identifies the property object.
 * This makes it possible to store it in a set collection.
 */
export class NamedNodeProperty extends NodeProperty {
    /**
     * @param {object} in_params         - List of parameters
     * @param {string} in_params.id      - id of the property (null, if the GUID should be used for the ID)
     * @param {string} in_params.typeid  - The type identifier
     *
     * @constructor
     * @protected
     * @extends property-properties.NodeProperty
     * @alias property-properties.NamedNodeProperty
     * @category Other Collections
     */
    constructor(in_params) {
        super(in_params);
    }

    /**
     * Returns a string identifying the property
     *
     * If an id has been explicitly set on this property we return that one, otherwise the GUID is used.
     *
     * @return {string} String identifying the property
     */
    getId = NamedProperty.prototype.getId;

    /**
     * Returns the GUID of this named property
     * A Guid is a unique identifier for a branch, commit or repository,
     * similar to a URN. Most functions in the API will us a URN but the
     * Guid is used to traverse the commit graph.
     * @return {string} The GUID
     */
    getGuid = NamedProperty.prototype.getGuid;

    /**
     * Return the URN for this named property
     * @return {string} The URN
     */
    getUrn = NamedProperty.prototype.getUrn;
}

NamedNodeProperty.prototype._typeid = 'NamedNodeProperty';

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Definition of the named property class
 */

const { ContainerProperty } = require('./containerProperty');
const { BaseProperty } = require('./baseProperty');

/**
 * A NamedProperty has a URN which uniquely identifies the property object. This makes it possible to store it in a
 * set collection.
 */
export class NamedProperty extends ContainerProperty {
    /**
     * @param {object} in_params - List of parameters
     * @param {string} in_params.id - id of the property (null, if the GUID should be used for the ID)
     * @param {string} in_params.typeid - The type identifier
     *
     * @constructor
     * @protected
     * @extends property-properties.ContainerProperty
     * @alias property-properties.NamedProperty
     * @category Properties
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
    getId() {
        return this._id !== null ? this._id : this.getGuid();
    }

    /**
     * Returns the GUID of this named property
     * A Guid is a unique identifier for a branch, commit or repository,
     * similar to a URN. Most functions in the API will us a URN but the
     * Guid is used to traverse the commit graph.
     * @return {string} The GUID
     */
    getGuid() {
        var guid = this.get('guid', { referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER });
        return guid ? guid.getValue() : '';
    }

    // THIS IS DISABLED FOR THE MOMENT, UNTIL WE BETTER UNDERSTAND HOW REFERENCES WORK IN FLUID
    /**
     * Return the URN for this named property
     * @return {string} The URN
     */
    /* NamedProperty.prototype.getUrn = function() {

    }; */
}
NamedProperty.prototype._typeid = 'NamedProperty';

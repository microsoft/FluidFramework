/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Definition of the named node property class
 */

const NamedProperty = require('./named_property');
const NodeProperty = require('./node_property');

/**
 * A NamedNodeProperty is a NodeProperty that has a GUID which unique identifies the property object.
 * This makes it possible to store it in a set collection.
 *
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
var NamedNodeProperty = function(in_params) {
  NodeProperty.call(this, in_params);
};

NamedNodeProperty.prototype = Object.create(NodeProperty.prototype);

NamedNodeProperty.prototype._typeid = 'NamedNodeProperty';

/**
 * Returns a string identifying the property
 *
 * If an id has been explicitly set on this property we return that one, otherwise the GUID is used.
 *
 * @return {string} String identifying the property
 */
NamedNodeProperty.prototype.getId = NamedProperty.prototype.getId;

/**
 * Returns the GUID of this named property
 * A Guid is a unique identifier for a branch, commit or repository,
 * similar to a URN. Most functions in the API will us a URN but the
 * Guid is used to traverse the commit graph.
 * @return {string} The GUID
 */
NamedNodeProperty.prototype.getGuid = NamedProperty.prototype.getGuid;

/**
 * Return the URN for this named property
 * urn:adsk.hfdm${env}:hfdm.named-property:${repoGuid}/${branchGuid}:${propertyGuid}
 * @return {string} The URN
 */
NamedNodeProperty.prototype.getUrn = NamedProperty.prototype.getUrn;

module.exports = NamedNodeProperty;

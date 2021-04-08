/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Definition of the named property class
 */

const ContainerProperty = require('./container_property');
const BaseProperty = require('./base_property');

/**
 * A NamedProperty has a URN which uniquely identifies the property object. This makes it possible to store it in a
 * set collection.
 *
 * @param {object} in_params         - List of parameters
 * @param {string} in_params.id      - id of the property (null, if the GUID should be used for the ID)
 * @param {string} in_params.typeid  - The type identifier
 *
 * @constructor
 * @protected
 * @extends property-properties.ContainerProperty
 * @alias property-properties.NamedProperty
 * @category Properties
 */
var NamedProperty = function(in_params) {
  ContainerProperty.call(this, in_params);
};

NamedProperty.prototype = Object.create(ContainerProperty.prototype);

NamedProperty.prototype._typeid = 'NamedProperty';

/**
 * Returns a string identifying the property
 *
 * If an id has been explicitly set on this property we return that one, otherwise the GUID is used.
 *
 * @return {string} String identifying the property
 */
NamedProperty.prototype.getId = function() {
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
 * @return {string} The GUID
 */
NamedProperty.prototype.getGuid = function() {
  var guid = this.get('guid', {referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER});
  return guid ? guid.getValue() : '';
};


// THIS IS DISABLED FOR THE MOMENT, UNTIL WE BETTER UNDERSTAND HOW REFERENCES WORK IN FLUID
/**
 * Return the URN for this named property
 * urn:adsk.hfdm${env}:hfdm.named-property:${repoGuid}/${branchGuid}:${propertyGuid}
 * @return {string} The URN
 */
/*NamedProperty.prototype.getUrn = function() {
  const workspace = this.getWorkspace();
  let environment,
      repositoryGuid,
      branchGuid;

  if (workspace) {
    const hfdm = workspace.getHfdm();
    if (hfdm) {
      environment = hfdm.getEnvironment();
    }
    const activeRepository = workspace.getActiveRepository();
    if (activeRepository) {
      repositoryGuid = activeRepository.getGuid();
    }
    const activeBranch = workspace.getActiveBranch();
    if (activeBranch) {
      branchGuid = activeBranch.getGuid();
    }
  }

  return UrnUtils.getHFDMPropertyUrn(environment, repositoryGuid, branchGuid, this.getGuid());
};*/

module.exports = NamedProperty;

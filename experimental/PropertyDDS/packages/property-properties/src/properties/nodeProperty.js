/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview This file contains the implementation of the NodeProperty class
 */
 const ContainerProperty = require('./containerProperty');

 /**
  * A property object that allows to add child properties dynamically.
  *
  * @param {Object} in_params - Input parameters for property creation
  *
  * @constructor
  * @protected
  * @extends property-properties.ContainerProperty
  * @alias property-properties.NodeProperty
  * @category Other Collections
  */
 const NodeProperty = function( in_params ) {
   ContainerProperty.call( this, in_params );
 };

 NodeProperty.prototype = Object.create(ContainerProperty.prototype);

 NodeProperty.prototype._typeid = 'NodeProperty';

 /**
  * @inheritdoc
  */
 NodeProperty.prototype.isDynamic = function() { return true; };

 /**
  * @inheritdoc
  */
 NodeProperty.prototype._validateInsert = function(in_id, in_property) {
 };

 module.exports = NodeProperty;

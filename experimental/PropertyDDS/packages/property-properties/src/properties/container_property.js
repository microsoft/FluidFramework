/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
const _ = require('lodash');
const BaseProperty = require('./base_property');
const ConsoleUtils = require('@fluid-experimental/property-common').ConsoleUtils;
const MSG = require('@fluid-experimental/property-common').constants.MSG;
const PathHelper = require('@fluid-experimental/property-changeset').PathHelper;
const Property = require('./lazy_loaded_properties');
const ChangeSet = require('@fluid-experimental/property-changeset').ChangeSet;
const PROPERTY_PATH_DELIMITER = require('@fluid-experimental/property-common').constants.PROPERTY_PATH_DELIMITER;


var BREAK_TRAVERSAL = BaseProperty.BREAK_TRAVERSAL;
var PATH_TOKENS = BaseProperty.PATH_TOKENS;

/**
 * This class serves as a view to read, write and listen to changes in an
 * object's value field. To do this we simply keep a pointer to the object and
 * its associated data field that we are interested in. If no data field is
 * present this property will fail constructing.
 * @virtual
 * @param {Object=} in_params - the parameters
 * @param {Object=} in_params.dataObj optional argument containing an object
 *                  that should be used as the backing store of this value
 *                  property
 * @param {Object=} in_params.dataId optional argument must be provided when
 *                  in_params.dataObj is passed. Must contain a valid member
 *                  name of dataObj. This member will be used to set/get
 *                  values of this value property
 * @constructor
 * @protected
 * @extends property-properties.BaseProperty
 * @alias property-properties.ContainerProperty
 */
var ContainerProperty = function( in_params ) {
  BaseProperty.call( this, in_params );

  // internal management
  if (!this._children) {
    this._children = {};
  }
};

ContainerProperty.prototype = Object.create(BaseProperty.prototype);

ContainerProperty.prototype._typeid = 'ContainerProperty';

/**
 * Returns the sub-property having the given name, or following the given paths, in this property.
 *
 * @param  {string|number|array<string|number>} in_ids the ID or IDs of the property or an array of IDs
 *     if an array is passed, the .get function will be performed on each id in sequence
 *     for example .get(['position','x']) is equivalent to .get('position').get('x').
 *     If .get resolves to a ReferenceProperty, it will, by default, return the property that the
 *     ReferenceProperty refers to.
 * @param {Object} in_options - parameter object
 * @param {property-properties.BaseProperty.REFERENCE_RESOLUTION} [in_options.referenceResolutionMode=ALWAYS]
 *     How should this function behave during reference resolution?
 *
 * @throws if an in_id is neither a string or an array of strings and numbers.
 * @return {property-properties.BaseProperty | undefined} The property you seek or undefined if none is found.
 */
ContainerProperty.prototype.get = function(in_ids, in_options) {
  in_options = _.isObject(in_options) ? in_options : {};
  in_options.referenceResolutionMode =
      in_options.referenceResolutionMode === undefined ? BaseProperty.REFERENCE_RESOLUTION.ALWAYS :
                                                          in_options.referenceResolutionMode;

  var prop = this;
  if (typeof in_ids === 'string' ||
      typeof in_ids === 'number') {
    prop = this._children[in_ids];
    if (in_options.referenceResolutionMode === BaseProperty.REFERENCE_RESOLUTION.ALWAYS) {
      if (prop instanceof Property.ReferenceProperty) {
        prop = prop.ref;
      }
    }
  } else if (_.isArray(in_ids)) {
    for (var i = 0; i < in_ids.length && prop; i++) {
      var mode = in_options.referenceResolutionMode;
      // do not do anything with token itself, only changes behavior of path preceding the token;
      if (in_ids[i] === PATH_TOKENS.REF) {
        continue;
      }
      if (mode === BaseProperty.REFERENCE_RESOLUTION.NO_LEAFS) {
        mode = i !== in_ids.length - 1 ? BaseProperty.REFERENCE_RESOLUTION.ALWAYS :
                                          BaseProperty.REFERENCE_RESOLUTION.NEVER;
      }
      if (in_ids[i - 1] === PATH_TOKENS.REF ||
        in_ids[i + 1] === PATH_TOKENS.REF) {
        mode = BaseProperty.REFERENCE_RESOLUTION.NEVER;
      }
      prop = prop.get(in_ids[i], {referenceResolutionMode: mode});
      if (prop === undefined && i < in_ids.length - 1) {
        return undefined;
      }
    }
  } else if (in_ids === PATH_TOKENS.ROOT) {
    prop = prop.getRoot();
  } else if (in_ids === PATH_TOKENS.UP) {
    prop = prop.getParent();
  } else if (in_ids === PATH_TOKENS.REF) {
    throw new Error(MSG.NO_GET_DEREFERENCE_ONLY);
  } else {
    throw new Error(MSG.STRING_OR_ARRAY_STRINGS + in_ids);
  }

  return prop;
};


/**
 * returns the value of a sub-property
 * This is a shortcut for .get(in_ids, in_options).getValue()
 * @param  {string|number|array<string|number>} in_ids the ID or IDs of the property or an array of IDs
 *     if an array is passed, the .get function will be performed on each id in sequence
 *     for example .getValue(['position','x']) is equivalent to .get('position').get('x').getValue().
 *     If at any point .get resolves to a ReferenceProperty, it will, by default, return the property that the
 *     ReferenceProperty refers to.
 * @param {Object} in_options - parameter object
 * @param {property-properties.BaseProperty.REFERENCE_RESOLUTION} [in_options.referenceResolutionMode=ALWAYS]
 *     How should this function behave during reference resolution?
 * @throws if the in_ids does not resolve to a ValueProperty or StringProperty
 * @throws if in_ids is not a string or an array of strings or numbers.
 * @return {*} The value of the given sub-property
 */
ContainerProperty.prototype.getValue = function(in_ids, in_options) {
  var property = this.get(in_ids, in_options);
  ConsoleUtils.assert((property instanceof Property.ValueProperty || property instanceof Property.StringProperty ),
    MSG.GET_VALUE_NOT_A_VALUE + in_ids);
  return property.getValue();
};


/**
 * Get all sub-properties of the current property.
 * Caller MUST NOT modify the properties.
 * If entries include References, it will return the reference (will not automatically resolve the reference)
 * @return {Object.<property-properties.BaseProperty>} An object containing all the properties
 */
ContainerProperty.prototype.getEntriesReadOnly = function() {
  /* Note that the implementation is voluntarily generic so that derived classes
     should not have to redefine this function. */
  var res = {};
  var ids = this.getIds();
  for (var i = 0; i < ids.length; i++) {
    res[ids[i]] = this.get(ids[i], {referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER});
  }
  return res;
};


/**
 * Returns the name of all the sub-properties of this property.
 *
 * @return {Array.<string>} An array of all the property ids
 */
ContainerProperty.prototype.getIds = function() {
  return Object.keys( this._children );
};

  /**
   * Returns an object with all the nested values contained in this property
   * @return {object} an object representing the values of your property
   * for example: {
   *   position: {
   *    x: 2,
   *    y: 5
   *   }
   * }
   */
ContainerProperty.prototype.getValues = function() {
  var ids = this.getIds();
  var result = {};
  for (var i = 0; i < ids.length; i++) {
    var child = this.get(ids[i]);
    if (_.isUndefined(child)) {
      result[ids[i]] = undefined;
    } else if (child._context === 'single' && child.isPrimitiveType()) {
      result[ids[i]] = child.getValue();
    } else {
      result[ids[i]] = child.getValues();
    }
  }

  return result;
};

/**
 * Checks whether a property with the given name exists
 *
 * @param {string} in_id - Name of the property
 * @return {boolean} True if the property exists. Otherwise false.
 */
ContainerProperty.prototype.has = function(in_id) {
  return this._children[in_id] !== undefined;
};

/**
 * Expand a path returning the property or value at the end.
 *
 * @param {string} in_path the path
 * @param {Object} in_options - parameter object
 * @param {property-properties.BaseProperty.REFERENCE_RESOLUTION} [in_options.referenceResolutionMode=ALWAYS]
 *     How should this function behave during reference resolution?
 * @throws if in_path is not a valid path
 * @return {property-properties.BaseProperty|undefined|*} resolved path
 */
ContainerProperty.prototype.resolvePath = function( in_path, in_options ) {
  in_options = in_options || {};
  in_options.referenceResolutionMode =
      in_options.referenceResolutionMode === undefined ? BaseProperty.REFERENCE_RESOLUTION.ALWAYS :
                                                         in_options.referenceResolutionMode;

  var node = this;

  // Tokenize the path string
  var tokenTypes = [];
  var pathArr = PathHelper.tokenizePathString(in_path, tokenTypes);

  // Return to the repository root, if the path starts with a root token (a / )
  var iterationStart = 0;
  if (pathArr.length > 0 ) {
    if (tokenTypes[0] === PathHelper.TOKEN_TYPES.PATH_ROOT_TOKEN) {
      node = this.getRoot();
      iterationStart = 1;
    } else if (tokenTypes[0] === PathHelper.TOKEN_TYPES.RAISE_LEVEL_TOKEN) {
      for (var j = 0; j < pathArr.length; j++) {
        if (tokenTypes[j] === PathHelper.TOKEN_TYPES.RAISE_LEVEL_TOKEN) {
          var parent = node.getParent();
          if (parent) {
            node = parent;
          } else {
            return undefined;
          }
          iterationStart++;
        }

      }
    }
  }

  for (var i = iterationStart; i < pathArr.length && node; i++) {
    if (tokenTypes[i] !== PathHelper.TOKEN_TYPES.DEREFERENCE_TOKEN ) {
      node = node._resolvePathSegment(pathArr[i], tokenTypes[i]);
      if (in_options.referenceResolutionMode === BaseProperty.REFERENCE_RESOLUTION.ALWAYS ||
      (in_options.referenceResolutionMode === BaseProperty.REFERENCE_RESOLUTION.NO_LEAFS &&
       i !== pathArr.length - 1)) {
        if (node instanceof Property.ReferenceProperty) {
          if (tokenTypes[i + 1] !== PathHelper.TOKEN_TYPES.DEREFERENCE_TOKEN) {
            // recursive function to resolve nested reference properties
            node = node.ref;
          }
        }
      }
    }
  }
  return node;

};

/**
 * Returns the path segment for a child
 *
 * @param {property-properties.BaseProperty} in_childNode - The child for which the path is returned
 *
 * @return {string} The path segment to resolve the child property under this property
 * @protected
 */
ContainerProperty.prototype._getPathSegmentForChildNode = function(in_childNode) {
  return PROPERTY_PATH_DELIMITER + PathHelper.quotePathSegmentIfNeeded(in_childNode.getId());
};

/**
 * Resolves a direct child node based on the given path segment
 *
 * @param {String} in_segment                                   - The path segment to resolve
 * @param {property-properties.PathHelper.TOKEN_TYPES} in_segmentType - The type of segment in the tokenized path
 *
 * @return {property-properties.BaseProperty|undefined} The child property that has been resolved
 * @protected
 */
ContainerProperty.prototype._resolvePathSegment = function(in_segment, in_segmentType) {
  // Base Properties only support paths separated via dots
  if (in_segmentType !== PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN) {
    throw new Error(MSG.INVALID_PATH_TOKEN + in_segment);
  }

  if ( this.has(in_segment) ) {
    return this.get(in_segment, {referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER});
  } else {
    return undefined;
  }
};

/**
 * Given an object that mirrors a PSet Template, assigns the properties to the values
 * found in that object.
 * @see {setValues}
 * @param {object} in_values The object containing the nested values to assign
 * @param {Bool} in_typed Whether the values are typed/polymorphic.
 * @param {Bool} in_initial  - Whether we are setting default/initial values
    or if the function is called directly with the values to set.
 */
ContainerProperty.prototype._setValues = function(in_values, in_typed, in_initial) {
  ConsoleUtils.assert(_.isObject(in_values), MSG.SET_VALUES_PARAM_NOT_OBJECT);

  var that = this;
  var keys = Object.keys(in_values);

  for (var i = 0; i < keys.length; i++) {
    var propertyKey = keys[i];
    var propertyValue = in_values[propertyKey];
    var property = that.get(propertyKey, {referenceResolutionMode: BaseProperty.REFERENCE_RESOLUTION.NEVER});

    if (property instanceof Property.ValueProperty || property instanceof Property.StringProperty) {
      property.setValue(propertyValue);
    } else if (property instanceof BaseProperty && _.isObject(propertyValue)) {
      property._setValues(propertyValue, in_typed, in_initial);
    } else if (property instanceof BaseProperty) {
      const typeid = property.getTypeid();
      throw new Error(MSG.SET_VALUES_PATH_PROPERTY + propertyKey + ', of type: ' + typeid);
    } else if (property === undefined) {
      throw new Error(MSG.SET_VALUES_PATH_INVALID + propertyKey);
    }
  }
};

  /**
 * Given an object that mirrors a PSet Template, assigns the properties to the values
 * found in that object.
 * eg.
 * <pre>
 * Templates = {
 *   properties: [
 *     { id: 'foo', typeid: 'String' },
 *     { id: 'bar', properties: [{id: 'baz', typeid: 'Uint32'}] }
 *   ]
 * }
 * </pre>
 *
 * @param {object} in_values The object containing the nested values to assign
 * @throws if in_values is not an object (or in the case of ArrayProperty, an array)
 * @throws if one of the path in in_values does not correspond to a path in that property
 * @throws if one of the path to a value in in_values leads to a property in this property.
 */
ContainerProperty.prototype.setValues = function(in_values) {
  var checkoutView = this._getCheckoutView();
  if (checkoutView !== undefined) {
    checkoutView.pushNotificationDelayScope();
    ContainerProperty.prototype._setValues.call(this, in_values, false, false);
    checkoutView.popNotificationDelayScope();
  } else {
    ContainerProperty.prototype._setValues.call(this, in_values, false, false);
  }
};

/**
 * Append a child property
 *
 * This is an internal function, called by the PropertyFactory when instantiating a template and internally by the
 * NodeProperty. Adding children dynamically by the user is only allowed in the NodeProperty.
 *
 * @param {property-properties.BaseProperty} in_property the property to append
 * @param {boolean} in_allowChildMerges - Whether merging of children (nested properties) is allowed.
 *                                        This is used for extending inherited properties.
 * @protected
 * @throws {OVERWRITING_ID} - Thrown when adding a property with an existing id.
 * @throws {OVERRIDDING_INHERITED_TYPES} - Thrown when overriding inherited typed properties.
 */
ContainerProperty.prototype._append = function( in_property, in_allowChildMerges ) {
  var id = in_property.getId();
  if (this._children[id] === undefined) {
    this._children[id] = in_property;
    in_property._setParent(this);
  } else {
    if (!in_allowChildMerges) {
      throw new Error(MSG.OVERWRITING_ID + id);
    }

    // if child is untyped then merge its properties
    if (this._children[id].getTypeid() === 'ContainerProperty' && this._children[id].getContext() === 'single') {
      // if the property's type is different than the child type, throw error.
      if (this._children[id].getTypeid() !== in_property.getTypeid()) {
        throw new Error(MSG.OVERRIDDING_INHERITED_TYPES + id);
      }

      this._children[id]._merge(in_property);
    } else {
      throw new Error(MSG.OVERRIDDING_INHERITED_TYPES + id);
    }
  }
};

 /**
 * Merge child properties
 *
 * This is an internal function that merges children of two properties.
 * This is used for extending inherited properties.
 *
 * @param {property-properties.BaseProperty} in_property the property to merge its children (nested properties) with.
 * @protected
 */
ContainerProperty.prototype._merge = function( in_property ) {
  var keys = Object.keys( in_property._children );

  for (var i = 0; i < keys.length; i++) {
    this._append(in_property._children[keys[i]], true);
  }
};

/**
 * Remove a child property
 *
 * This is an internal function, called internally by NodeProperty. Removing children dynamically by the user is
 * only allowed in the NodeProperty.
 *
 * @param {String} in_id - the id of the property to remove
 * @protected
 */
ContainerProperty.prototype._remove = function( in_id ) {

  if (this._children[in_id] !== undefined) {
    this._children[in_id]._setParent(undefined);
    delete this._children[in_id];
  } else {
    throw new Error(MSG.REMOVING_NON_EXISTING_ID + in_id);
  }
};

/**
 * @inheritdoc
 */
ContainerProperty.prototype._getDirtyChildren = function(in_flags) {
  var flags = in_flags === undefined ? ~BaseProperty.MODIFIED_STATE_FLAGS.CLEAN : in_flags;
  var rtn = [];
  var childKeys = _.keys(this._children);
  for (var i = 0; i < childKeys.length; i++) {
    if ((this._children[childKeys[i]]._isDirty(flags)) !== 0 ) {
      rtn.push(childKeys[i]);
    }
  }

  return rtn;
};

/**
 * Traverses the property hierarchy downwards until all child properties are reached
 *
 * @param {Function} in_callback - Callback to invoke for each property. The traversal can be stopped
 *                                 by returning BaseProperty.BREAK_TRAVERSAL
 * @throws if in_callback is not a function.
 * @return {string|undefined} Returns BaseProperty.BREAK_TRAVERSAL if the traversal has been interrupted,
 *                            otherwise undefined
 */
ContainerProperty.prototype.traverseDown = function( in_callback ) {
  ConsoleUtils.assert(_.isFunction(in_callback), MSG.CALLBACK_NOT_FCT);
  return this._traverse( in_callback, '' );
};

/**
 * Traverses all children in the child hierarchy
 * TODO: How should this behave for collections?
 *
 * @param {function} in_callback             - Callback to invoke for every child
 * @param {string} in_pathFromTraversalStart - Path from the root of the traversal to this node
 * @return {string|undefined} Returns BaseProperty.BREAK_TRAVERSAL if the traversal has been interrupted,
 *                            otherwise undefined
 * @private
 */
ContainerProperty.prototype._traverse = function( in_callback, in_pathFromTraversalStart ) {
  if (in_pathFromTraversalStart) {
    in_pathFromTraversalStart += PROPERTY_PATH_DELIMITER;
  }

  var childKeys, child, childPath, result, i;

  childKeys = Object.keys(this._children);
  for ( i = 0; i < childKeys.length; i++ ) {
    child = this._children[childKeys[i]];
    childPath = in_pathFromTraversalStart + PathHelper.quotePathSegmentIfNeeded(child.getId());

    result = in_callback( child, childPath );
    if ( result !== BREAK_TRAVERSAL ) {
      result = child._traverse( in_callback, childPath );
      if ( result !== BREAK_TRAVERSAL ) {
        continue;
      }
    }
    return BREAK_TRAVERSAL;
  }

  return undefined;
};

/**
 * Traverses all static properties (properties declared in the template and not added dynamically) in the
 * hierarchy below this node
 *
 * @param {function} in_callback               - Callback to invoke for every property
 * @param {string?}  in_pathFromTraversalStart - Path from the root of the traversal to this node
 * @protected
 */
ContainerProperty.prototype._traverseStaticProperties = function(in_callback, in_pathFromTraversalStart ) {
  in_pathFromTraversalStart = in_pathFromTraversalStart || '';
  var propertyKeys = _.keys(this._children);
  for ( var i = 0; i < propertyKeys.length; i++) {
    var property = this._children[propertyKeys[i]];
    var childPath = in_pathFromTraversalStart +
                    (in_pathFromTraversalStart.length !== 0 ? PROPERTY_PATH_DELIMITER : '') +
                    PathHelper.quotePathSegmentIfNeeded(property.getId());

    // We only recursively traverse ContainerProperties, since these are used to define the hierarchy within
    // one template
    if (property.getTypeid() === 'ContainerProperty' && property.getContext() === 'single') {
      property._traverseStaticProperties( in_callback, childPath);
    }
    in_callback( property, childPath);
  }
};

/**
 * Serialize the property into a changeSet
 *
 * @param {boolean} in_dirtyOnly -
 *     Only include dirty entries in the serialization
 * @param {boolean} in_includeRootTypeid -
 *     Include the typeid of the root of the hierarchy
 * @param {property-properties.BaseProperty.MODIFIED_STATE_FLAGS} [in_dirtinessType] -
 *     The type of dirtiness to use when reporting dirty changes. By default this is
 *     PENDING_CHANGE
 * @param {boolean} [in_includeReferencedRepositories=false] - If this is set to true, the serialize
 *     function will descend into referenced repositories. WARNING: if there are loops in the references
 *     this can result in an infinite loop
 *
 * @return {Object} The serialized representation of this property
 * @private
 */
ContainerProperty.prototype._serialize = function( in_dirtyOnly,
                                                   in_includeRootTypeid,
                                                   in_dirtinessType,
                                                   in_includeReferencedRepositories ) {

  var serializedChildren = {};
  var childrenType;

  in_dirtyOnly = in_dirtyOnly || false;
  in_dirtinessType = in_dirtinessType === undefined ?
      BaseProperty.MODIFIED_STATE_FLAGS.PENDING_CHANGE : in_dirtinessType;

  this._traverseStaticProperties( function(in_node, in_pathFromTraversalStart ) {

    if ( in_dirtyOnly && !in_node._isDirty(in_dirtinessType) ) {
      return;
    }

    childrenType = in_node.getFullTypeid();

    if (childrenType !== 'ContainerProperty') { // we don't want to keep BaseProperties
                              // as they mostly behave as 'paths' to
                              // a ValueProperty.
      var serialized = in_node._serialize(in_dirtyOnly,
                                          false,
                                          in_dirtinessType,
                                          in_includeReferencedRepositories);

      // Add the root typeid if requested
      if (!ChangeSet.isEmptyChangeSet(serialized) || !in_dirtyOnly) {
        if ( !serializedChildren[ childrenType ] ) {
          serializedChildren[ childrenType ] = {};
        }
        serializedChildren[ childrenType ][in_pathFromTraversalStart] = serialized;
      }
    }
  });

  if (in_includeRootTypeid) {
    serializedChildren['typeid'] = this.getFullTypeid();
  }

  return serializedChildren;
};

/**
 * @inheritdoc
 */
ContainerProperty.prototype._deserialize = function(in_serializedObj, in_reportToView, in_filteringOptions) {

  var changeSet = {};
  // From the given filtering options, keep only what is relevant for this property.
  let baseFilteringOptions;
  if (in_filteringOptions) {
    let pathCoverage = PathHelper.getPathCoverage(in_filteringOptions.basePath, in_filteringOptions.paths);
    switch (pathCoverage.coverageExtent) {
      case PathHelper.CoverageExtent.FULLY_COVERED:
        // No need for filtering options anymore, keep them undefined.
        break;
      case PathHelper.CoverageExtent.PARTLY_COVERED:
        baseFilteringOptions = {
          basePath: in_filteringOptions.basePath,
          paths: pathCoverage.pathList
        };
        break;
      case PathHelper.CoverageExtent.UNCOVERED:
        // No need to create anything, it is outside the paths.
        return {};
      default:
        break;
    }
  }

  // Traverse all properties of this template
  this._traverseStaticProperties( function(in_node, in_pathFromTraversalStart ) {
    // We do not deserialize base properties, since the traverseStatic function
    // already traverses recursively
    if (in_node.getTypeid() === 'ContainerProperty' && in_node.getContext() === 'single') {
      return;
    }

    var typeid = in_node.getFullTypeid();

    // Get the ChangeSet
    // If there is a ChangeSet in the serialized object, we use that as the
    // target ChangeSet, otherwise we use an empty ChangeSet (since properties with
    // empty Sub-ChangeSets are removed from the parent ChangeSet, we have to
    // explicitly use an empty ChangeSet for those)
    var propertyChangeSet = {};
    if (in_serializedObj[typeid] !== undefined &&
        in_serializedObj[typeid][in_pathFromTraversalStart] !== undefined) {
      propertyChangeSet = in_serializedObj[typeid][in_pathFromTraversalStart];
    }
    let filteringOptions = baseFilteringOptions && {
      basePath: PathHelper.getChildAbsolutePathCanonical(baseFilteringOptions.basePath, in_node.getId()),
      paths: baseFilteringOptions.paths
    };
    // Deserialize the ChangeSet into the property
    var changes = in_node._deserialize(propertyChangeSet, false, filteringOptions);

    // And track the performed modification in the result
    if (!ChangeSet.isEmptyChangeSet(changes)) {
      changeSet[typeid] = changeSet[typeid] || {};
      changeSet[typeid][in_pathFromTraversalStart] = changes;
    }
  });

  // Finally report the dirtiness to the view (we postponed this above)
  if (in_reportToView) {
    this._reportDirtinessToView();
  }
  return changeSet;
};

/**
 * Get a flattened, tree like representation of this object and all of it's
 * descendants. The flattening will stop at primitive properties and collections.
 *
 * For non-leaf nodes, it is possible to access the corresponding node object itself via the
 * propertyNode member of the flattened representation (warning, this will overwrite a
 * property of this name).
 * TODO: Do we want to have this feature or is it to dangerous?
 *
 * @return {Object} the flat representation
 * @private
 */
ContainerProperty.prototype._flatten = function() {
  var flattenedRepresentation = {};
  var keys = Object.keys( this._children );
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var child = this._children[key];
    if (!child._isFlattenLeaf()) {
      flattenedRepresentation[key] = child._flatten();
    } else {
      flattenedRepresentation[key] = child;
    }
  }

  flattenedRepresentation.propertyNode = this;

  return flattenedRepresentation;
};

/**
 * Returns the number of children this node has
 * @return {number} The number of children
 * @private
 */
ContainerProperty.prototype._getChildrenCount = function() {
  return Object.keys(this._children).length;
};


Object.defineProperty(
  ContainerProperty.prototype,
  '_properties',
  {
    get: function() {
      return this._flatten();
    }
  }
);

module.exports = ContainerProperty;

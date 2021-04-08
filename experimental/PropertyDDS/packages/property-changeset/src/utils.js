/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
const _ = require('lodash');
const MSG = require('@fluid-experimental/property-common').constants.MSG;
const async = require('async');
const deepCopy = _.cloneDeep;
const ConsoleUtils = require('@fluid-experimental/property-common').ConsoleUtils;
const isReservedKeyword = require('./is_reseved_keyword');
const PathHelper = require('./path_helper');
const PROPERTY_PATH_DELIMITER = require('@fluid-experimental/property-common').constants.PROPERTY_PATH_DELIMITER;
const TypeIdHelper = require('./helpers/typeid_helper');
const ArrayChangeSetIterator = require('./changeset_operations/array_changeset_iterator');

/**
 * Utils
 * @alias property-changeset.Utils
 * @class
 * @protected
 * @category HFDM
 */
var Utils = {};

/**
 * Provides traversal information when parsing ChangeSets via the traverseChangeSetRecursively function.
 * @alias property-changeset.Utils.TraversalContext
 * @constructor
 * @private
 */
Utils.TraversalContext = function() {
  this._fullPath = '';
  this._lastSegment = '';
  this._lastSegmentString = '';
  this._typeid = undefined;
  this._splitTypeId = undefined;
  this._userData = undefined;
  this._traversalStopped = false;
  this._nestedChangeSet = undefined;
  this._parentNestedChangeSet = undefined;
  this._propertyContainerType = 'root';
  this._arrayLocalIndex = undefined;
  this._arrayOperationIndex = undefined;
  this._arrayOperationOffset = undefined;
  this._arrayIteratorOffset = undefined;
  this._fullPostPath = '';
  this._stackDepth = 0;
  this._typeStack = [];
  this._parentStack = [];
  this._containerStack = [];
  this._userStack = [];

  // By default, operations are modify operations
  this._operationType = 'modify';
};

/**
 * Stop the traversal for all nodes below the currently processed one
 * @private
 */
Utils.TraversalContext.prototype.stopTraversal = function() {
  this._traversalStopped = true;
};

/**
 * Returns the operation type
 * @return {string} one of 'insert', 'modify' or 'remove'
 * @private
 */
Utils.TraversalContext.prototype.getOperationType = function() {
  return this._operationType;
};

/**
 * Returns the full path to the currently visited ChangeSet
 * (from the root of the ChangeSet)
 * @return {string} The full path
 * @private
 */
Utils.TraversalContext.prototype.getFullPath = function() {
  return this._fullPath;
};

/**
 * Returns the last segment of the path, either a string with the key or a number with the position in the array.
 * If the path is part of a templated property with nested properties, this string can contain multiple path
 * segments, separated by dots. The segment is returned here in the form it appears in the changeSet. For a templated
 * property, it is an escaped (if necessary) path with dots. For a map/NodeProperty, it is an unescaped path segment
 *
 * @private
 * @return {string|number} The last segment index
 */
Utils.TraversalContext.prototype.getLastSegment = function() {
  return this._lastSegment;
};

/**
 * Returns the last segment of the path escaped to be compatible for use in a path.
 *
 * This returns the same segment as getLastSegment, but always performs escaping in such a way that this segment can
 * be used in a path
 *
 * @private
 * @return {string|number} The last segment index
 */
Utils.TraversalContext.prototype.getLastSegmentEscaped = function() {
  if (this._propertyContainerType === 'NodeProperty' ||
      this._propertyContainerType === 'map' ||
      this._propertyContainerType === 'set' ||
      this._propertyContainerType === 'root') {
    return PathHelper.quotePathSegmentIfNeeded(this._lastSegment);
  }
  return this._lastSegment;
};

/**
 * Returns true if the passed context is an empty object
 * @private
 * @param {object} in_context change set traversal context
 * @return {Boolean} Wether the object is empty
 */
const _isEmptyObject = function(in_context) {
  return _.isObject(in_context._nestedChangeSet) && _.isEmpty(in_context._nestedChangeSet);
};

const PRIMITIVE_TYPES = {
  Float32: true,
  Float64: true,
  Int8: true,
  Uint8: true,
  Int16: true,
  Uint16: true,
  Int32: true,
  Uint32: true,
  Int64: true,
  Uint64: true,
  Bool: true,
  String: true
};

/**
 * Returns true if we're at the tip of a path
 * @private
 * @return {Boolean} Wether the context is at a leaf
 */
Utils.TraversalContext.prototype.isLeafNode = function() {
  return PRIMITIVE_TYPES[this._typeid] || _isEmptyObject(this) || this.getOperationType() === 'remove';
};

/**
 * Returns the index of the last segment, either a string with the key or a number with the position in the array
 * @private
 * @return {string|number} The last segment index
 */
Utils.TraversalContext.prototype.getPostLastSegment = function() {
  if (this._propertyContainerType === 'array') {
    if (this._operationType === 'remove') {
      return this._lastSegment + this._arrayIteratorOffset - this._arrayLocalIndex;
    } else {
      return this._lastSegment + this._arrayIteratorOffset;
    }
  } else {
    return this._lastSegment;
  }
};

/**
 * Returns the typeid of the currently visited Property
 * @return {string|undefined} The typeid or undefined, if the current operation type is 'remove'
 * @private
 */
Utils.TraversalContext.prototype.getTypeid = function() {
  return this._typeid;
};

/**
 * The ChangeSet that should be applied to the currently visited node.
 *
 * If this is a remove operation, it is the whole ChangeSet of the removal operation
 * @return {property-changeset.SerializedChangeSet} The ChangeSet
 * @private
 */
Utils.TraversalContext.prototype.getNestedChangeSet = function() {
  return this._nestedChangeSet;
};

/**
 * Replace the current nested ChangeSet by another one
 *
 * @param {property-changeset.SerializedChangeSet} in_newNestedChangeset The new content
 * @private
 */
Utils.TraversalContext.prototype.replaceNestedChangeSet = function(in_newNestedChangeset) {
  var parent = this.getParentNestedChangeSet();
  if (this.getPropertyContainerType() === 'template') {
    parent = parent[this.getTypeid()];
    if (parent) {
      parent[this.getLastSegment()] = in_newNestedChangeset;
    } else {
      throw new Error('TEMPORARY - INTERNAL: Was expected to replace a nested ChangeSet under "' +
          this.getLastSegment() + '" by "' + JSON.stringify(in_newNestedChangeset) + '", but could not find "' +
          this.getTypeid() + '" in "' + JSON.stringify(this.getParentNestedChangeSet()) + '"');
    }
  } else if (this.getPropertyContainerType() === 'NodeProperty' || this.getPropertyContainerType() === 'map') {
    parent[this.getOperationType()][this.getTypeid()][this.getLastSegment()] = in_newNestedChangeset;
  } else {
    console.warn('replaceNestedChangeSet: not implemented. type: ', this.getPropertyContainerType());
  }
};

/**
 * Get the ChangeSet of the parent that contains the currently visited node.
 *
 * @return {property-changeset.SerializedChangeSet} The parent ChangeSet
 * @private
 */
Utils.TraversalContext.prototype.getParentNestedChangeSet = function() {
  return this._parentNestedChangeSet;
};

/**
 * Returns the split Typeid as returned by TypeIdHelper.extractContext
 * @return {{typeid: string, context:string, isEnum:boolean}} The split typeid
 * @private
 */
Utils.TraversalContext.prototype.getSplitTypeID = function() {
  return this._splitTypeId;
};

/**
 * Sets user data, which will be passed to the recursive calls within this scope
 *
 * @param {*} in_userData - The user data
 * @private
 */
Utils.TraversalContext.prototype.setUserData = function(in_userData) {
  this._userData = in_userData;
};

/**
 * Returns the user data set by the calling function
 *
 * @return {*} The user data
 * @private
 */
Utils.TraversalContext.prototype.getUserData = function() {
  return this._userData;
};

/**
 * Clones the current Traversal Object
 * @return {property-changeset.Utils.TraversalContext} The cloned object
 * @private
 */
Utils.TraversalContext.prototype.clone = function() {
  var result = new Utils.TraversalContext();
  result._fullPath = this._fullPath;
  result._lastSegment = this._lastSegment;
  result._lastSegmentString = this._lastSegmentString;
  result._typeid = this._typeid;
  result._splitTypeId = this._splitTypeId; // it's OK that it's not a deep copy as it's not modified partially
  result._userData = this._userData;
  result._traversalStopped = this._traversalStopped;
  result._nestedChangeSet = this._nestedChangeSet;
  result._parentNestedChangeSet = this._parentNestedChangeSet;
  result._propertyContainerType = this._propertyContainerType;
  result._arrayLocalIndex = this._arrayLocalIndex;
  result._arrayOperationIndex = this._arrayOperationIndex;
  result._arrayOperationOffset = this._arrayOperationOffset;
  result._arrayIteratorOffset = this._arrayIteratorOffset;
  result._fullPostPath = this._fullPostPath;
  result._operationType = this._operationType;
  result._stackDepth = this._stackDepth;
  result._typeStack = this._typeStack.slice();
  result._parentStack = this._parentStack.slice();
  result._containerStack = this._containerStack.slice();
  result._userStack = this._userStack.slice();

  return result;
};

/**
 * Returns the type of the property this property is contained within.
 * It can be one of ['NodeProperty', 'map', 'array', 'set', 'template', 'root']
 *
 * @return {String} The type of the property container
 * @private
 */
Utils.TraversalContext.prototype.getPropertyContainerType = function() {
  return this._propertyContainerType;
};

/**
 * If this is an array operation, it returns the index of this operations
 *
 * @return {Number} The index
 * @private
 */
Utils.TraversalContext.prototype.getArrayOperationIndex = function() {
  return this._arrayOperationIndex;
};

/**
 * If this is an array operation, it returns the offset of this operations
 *
 * @return {Number} The index
 * @private
 */
Utils.TraversalContext.prototype.getArrayOperationOffset = function() {
  return this._arrayOperationOffset;
};


/**
 * If this is an array operation, it returns the local index of this entry within the array of entries
 * of the currently processed operation
 *
 * @return {Number} The index
 * @private
 */
Utils.TraversalContext.prototype.getArrayLocalIndex = function() {
  return this._arrayLocalIndex;
};

/**
 * If this is an array operation, it returns the offset of this operation as defined by the internal
 * ArrayIteratorOffset of the currently processed operation
 * @private
 * @return {Number} The offset
 */
Utils.TraversalContext.prototype.getArrayIteratorOffset = function() {
  return this._arrayIteratorOffset;
};

/**
 * If this is an array operation, it returns the valid path post this operation. For example if the original
 * path is foo.bar[0] and we insert one element at position 0, then the valid post path will be foo.bar[1].
 * In the case of array remove operations, the path returned by this function is only valid during the traversal
 * itself, since the elements get deleted. Array entries are deleted element by element.
 * @private
 * @return {String} The path
 */
Utils.TraversalContext.prototype.getFullPostPath = function() {
  return this._fullPostPath;
};

/**
 * Returns the depth level of the current traversal state
 * @private
 * @return {Number} The Depth
 */
Utils.TraversalContext.prototype.getStackDepth = function() {
  return this._stackDepth;
};


/**
 * Returns stack of all types traversed to this node
 * @private
 * @return {Array<String>} The types traversed
 */
Utils.TraversalContext.prototype.getTypeStack = function() {
  return this._typeStack;
};

/**
 * Returns stack of all property names traversed to this node
 * @private
 * @return {Array<String>} The names traversed
 */
Utils.TraversalContext.prototype.getParentStack = function() {
  return this._parentStack;
};

/**
 * Returns stack of all container types traversed to this node
 * @private
 * @return {Array<String>} The container types traversed
 */
Utils.TraversalContext.prototype.getContainerStack = function() {
  return this._containerStack;
};

/**
 * Returns stack of all validation checks traversed to this node
 * @private
 * @return {Array<object>} The validation checks traversed
 */
Utils.TraversalContext.prototype.getUserStack = function() {
  return this._userStack;
};

/**
 * Traverses a ChangeSet recursively and invokes the callback for each visited property.
 * @protected
 * @ignore
 *
 * @param {function(property-changeset.Utils.TraversalContext)} in_preCallback  -
 *   The (pre-order) callback function that is invoked for each property
 * @param {function(property-changeset.Utils.TraversalContext)} in_postCallback -
 *   The (post-order) callback function that is invoked for each property
 * @param {property-changeset.Utils.TraversalContext}           in_context -  The
 *   traversal context for the currently processed property
 */
var _traverseChangeSetRecursively = function(in_preCallback, in_postCallback, // eslint-disable-line complexity
                                             in_context) {
  var pathSeparator = in_context._fullPath !== '' ? PROPERTY_PATH_DELIMITER : '';
  var currentPath = in_context._fullPath;
  var currentPostPath = in_context._fullPostPath;
  var nestedChangeSet = in_context._nestedChangeSet;

  // Call the callback function for this ChangeSet
  in_context._traversalStopped = false;
  var splitTypeId = in_context._typeid !== undefined ?
                    TypeIdHelper.extractContext(in_context._typeid) :
                    undefined;
  in_context._splitTypeId = splitTypeId;

  // TODO: this duplicates the context object putting stress on the GC.
  var postOrderContext;
  if (in_preCallback) {
    in_preCallback(in_context);
  }
  if (in_postCallback) {
    postOrderContext = in_context.clone();
  }
  var currentUserData = in_context.getUserData();

  if (in_context._traversalStopped ||
      in_context._operationType === 'remove' ||
      TypeIdHelper.isPrimitiveType(in_context._splitTypeId.typeid) ||
      in_context._splitTypeId.isEnum) {
    if (in_postCallback) {
      in_postCallback(postOrderContext);
    }
    return;
  }
  var currentTypeIdContext = in_context._splitTypeId.context;

  in_context._parentNestedChangeSet = nestedChangeSet;

  // Process an individual change recursively, by preparing the traversal context and invoking
  // _traverseChangeSetRecursively
  var processChange = function(in_segment,
                               in_subChangeSet,
                               in_nestedTypeid,
                               in_escape,
                               in_parentPropertyType,
                               in_arrayOperationIndex,
                               in_arrayLocalIndex,
                               in_arrayOperationOffset,
                               in_arrayIteratorOffset) {
    // Update the path
    in_context._lastSegment = in_segment;
    var escapedSegment = in_escape ? PathHelper.quotePathSegmentIfNeeded(in_segment) : in_segment;
    var nextSegmentToPushInParentStack = in_context._lastSegment;
    // Note: we don't quote the path string here, since the paths in a ChangeSet are already quoted, if necessary
    if (currentTypeIdContext === 'map' ||
        currentTypeIdContext === 'array' ||
        currentTypeIdContext === 'set') {
      in_context._lastSegmentString = '[' + escapedSegment + ']';
    } else {
      in_context._lastSegmentString = pathSeparator + escapedSegment;
    }
    in_context._fullPath = currentPath + in_context._lastSegmentString;

    // Store the typeid and nested ChangeSet
    in_context._typeid = in_nestedTypeid;
    in_context._nestedChangeSet = in_subChangeSet;
    in_context._propertyContainerType = in_parentPropertyType;
    in_context._arrayOperationIndex = in_arrayOperationIndex;
    in_context._arrayLocalIndex = in_arrayLocalIndex;
    in_context._arrayOperationOffset = in_arrayOperationOffset;
    in_context._arrayIteratorOffset = in_arrayIteratorOffset;
    if (in_arrayIteratorOffset !== undefined) {
      if (in_context._operationType === 'remove') {
        nextSegmentToPushInParentStack = in_context._lastSegment + in_arrayIteratorOffset - in_arrayLocalIndex;
        in_context._fullPostPath = currentPostPath + '[' + (in_segment +
                                                            in_arrayIteratorOffset - in_arrayLocalIndex) + ']';
      } else {
        nextSegmentToPushInParentStack = in_context._lastSegment + in_arrayIteratorOffset;
        in_context._fullPostPath = currentPostPath + '[' + (in_segment + in_arrayIteratorOffset) + ']';
      }
    } else {
      nextSegmentToPushInParentStack = in_context._lastSegment;
      in_context._fullPostPath = currentPostPath + in_context._lastSegmentString;
    }

    // Continue traversal
    in_context._stackDepth++;
    in_context._typeStack.push(in_context._typeid);
    in_context._parentStack.push(nextSegmentToPushInParentStack);
    in_context._containerStack.push(in_context._propertyContainerType);
    in_context._userStack.push({});
    _traverseChangeSetRecursively(in_preCallback, in_postCallback, in_context);
    in_context._stackDepth--;
    in_context._typeStack.pop();
    in_context._parentStack.pop();
    in_context._containerStack.pop();
    in_context._userStack.pop();

    in_context._userData = currentUserData;
    in_context._parentNestedChangeSet = nestedChangeSet;
  };

  // If this property is a collection, we set the correct type, otherwise we assume it is a NodeProperty
  var propertyContainerType = (splitTypeId.context === 'map' ||
                               splitTypeId.context === 'set' ||
                               splitTypeId.context === 'array') ? splitTypeId.context : 'NodeProperty';

  var oldOperationType = in_context._operationType;
  if (splitTypeId.context === 'array') {
    // Use the ArrayChangeSetIterator to process the changes in the ChangeSet in the correct order
    var arrayIterator = new ArrayChangeSetIterator(nestedChangeSet);
    var insertCounter = 0;
    var removeCounter = 0;
    var modifyCounter = 0;
    var i, j, typeid, typeids, paths;
    while (!arrayIterator.atEnd()) {
      switch (arrayIterator.type) {
        case ArrayChangeSetIterator.types.INSERT:
          in_context._operationType = 'insert';
          for (i = 0; i < arrayIterator.operation[1].length; ++i) {
            // The typeid is stored inline for arrays
            typeid = arrayIterator.operation[1][i].typeid;
            ConsoleUtils.assert(typeid, MSG.NON_PRIMITIVE_ARRAY_NO_TYPEID);
            processChange(arrayIterator.operation[0] + i, arrayIterator.operation[1][i], typeid, false,
              propertyContainerType, insertCounter, i, arrayIterator.operation[0], arrayIterator.offset);
          }
          insertCounter++;
          break;
        case ArrayChangeSetIterator.types.REMOVE:
          in_context._operationType = 'remove';
          for (i = 0; i < arrayIterator.operation[1]; ++i) {
            // For removals, we don't have a typeid and we use the ChangeSet of the removal operation as nested
            // ChangeSet -- TODO: doing this is maybe not really nice here
            processChange(arrayIterator.operation[0] + i, nestedChangeSet.remove, undefined, false,
              propertyContainerType, removeCounter, i, arrayIterator.operation[0], arrayIterator.offset);
          }
          removeCounter++;
          break;
        case ArrayChangeSetIterator.types.MODIFY:
          in_context._operationType = 'modify';
          for (i = 0; i < arrayIterator.operation[1].length; ++i) {
            // The typeid is stored inline for arrays
            typeid = arrayIterator.operation[1][i].typeid;
            ConsoleUtils.assert(typeid, MSG.NON_PRIMITIVE_ARRAY_NO_TYPEID);
            processChange(arrayIterator.operation[0] + i, arrayIterator.operation[1][i], typeid, false,
              propertyContainerType, modifyCounter, i, arrayIterator.operation[0], arrayIterator.offset);
          }
          modifyCounter++;
          break;
        default:
          throw new Error(MSG.UNKNOWN_OPERATOR + arrayIterator.type);
      }
      arrayIterator.next();
    }
    in_context._operationType = oldOperationType;
  } else {

    // Bug fix: if we insert & remove/modify the same key in the same ChangeSet,
    // we need to process remove first, followed by insert & modify
    if (nestedChangeSet.remove) {
      oldOperationType = in_context._operationType;
      in_context._operationType = 'remove';
      paths = nestedChangeSet.remove;
      if (_.isArray(paths)) {
        for (i = 0; i < paths.length; i++) {
          // For removals in irreversible CSs, we don't have a typeid and we use the ChangeSet of the
          // removal operation as nested ChangeSet
          processChange(paths[i], nestedChangeSet.remove, undefined, true, propertyContainerType);
        }
      } else {
        // for removals in reversible changesets we have an object containing the types
        typeids = _.keys(nestedChangeSet.remove);
        for (i = 0; i < typeids.length; i++) {
          typeid = typeids[i];
          paths = _.keys(nestedChangeSet.remove[typeid]);
          for (j = 0; j < paths.length; j++) {
            processChange(paths[j], nestedChangeSet.remove[typeid][paths[j]], typeid, true, propertyContainerType);
          }
        }
      }
      in_context._operationType = oldOperationType;
    }

    // Process insertion of dynamic property, maps and sets
    if (nestedChangeSet.insert) {
      // Once we have reached an insert operation all subsequent operations are inserts
      oldOperationType = in_context._operationType;
      in_context._operationType = 'insert';
      // Maps and NodeProperties group the insertions by type
      typeids = _.keys(nestedChangeSet.insert);
      for (i = 0; i < typeids.length; i++) {
        typeid = typeids[i];
        paths = _.keys(nestedChangeSet.insert[typeid]);
        for (j = 0; j < paths.length; j++) {
          processChange(paths[j], nestedChangeSet.insert[typeid][paths[j]], typeid, true, propertyContainerType);
        }
      }
      in_context._operationType = oldOperationType;
    }

    if (nestedChangeSet.modify) {
      // Maps and NodeProperties group modifications by type
      typeids = _.keys(nestedChangeSet.modify);
      for (i = 0; i < typeids.length; i++) {
        typeid = typeids[i];
        paths = _.keys(nestedChangeSet.modify[typeid]);
        for (j = 0; j < paths.length; j++) {
          processChange(paths[j], nestedChangeSet.modify[typeid][paths[j]], typeid, true, propertyContainerType);
        }
      }
    }
  }

  // Process nested properties
  if (splitTypeId.context === 'single') {
    typeids = _.keys(nestedChangeSet);
    for (i = 0; i < typeids.length; i++) {
      typeid = typeids[i];
      if (!isReservedKeyword(typeid)) {
        paths = _.keys(nestedChangeSet[typeid]);
        for (j = 0; j < paths.length; j++) {
          processChange(paths[j], nestedChangeSet[typeid][paths[j]], typeid, false, 'template');
        }
      }
    }
  }
  if (in_postCallback) {
    in_postCallback(postOrderContext);
  }
};

/**
 * Traverses a ChangeSet recursively and invokes the callback for each visited property.
 * @protected
 * @ignore
 *
 * @param {function(property-changeset.Utils.TraversalContext)} in_preCallback  -
 *   The (pre-order) callback function that is invoked for each property
 * @param {function(property-changeset.Utils.TraversalContext)} in_postCallback -
 *   The (post-order) callback function that is invoked for each property
 * @param {property-changeset.Utils.TraversalContext}           in_context -  The
 *   traversal context for the currently processed property
 * @param {function}                                       in_levelCallback -
 *   A callback for when a node is reached
 */
var _traverseChangeSetRecursivelyAsync = function(in_preCallback, in_postCallback, // eslint-disable-line complexity
                                             in_context, in_levelCallback) {
  var pathSeparator;
  var currentPath;
  var currentPostPath;
  var nestedChangeSet;
  var postOrderContext;

  // Call the callback function for this ChangeSet
  in_context._traversalStopped = false;
  var splitTypeId = in_context._typeid !== undefined ?
                    TypeIdHelper.extractContext(in_context._typeid) :
                    undefined;
  in_context._splitTypeId = splitTypeId;

  var currentUserData;

  async.series([

    function(next) {
      if (in_preCallback) {
        in_preCallback(in_context, next);
      } else {
        next();
      }
    },

    function(next) {
      pathSeparator = in_context._fullPath !== '' ? PROPERTY_PATH_DELIMITER : '';
      currentPath = in_context._fullPath;
      currentPostPath = in_context._fullPostPath;
      nestedChangeSet = in_context._nestedChangeSet;

      // Call the callback function for this ChangeSet
      in_context._traversalStopped = false;
      splitTypeId = in_context._typeid !== undefined ?
                        TypeIdHelper.extractContext(in_context._typeid) :
                        undefined;
      in_context._splitTypeId = splitTypeId;

      if (in_postCallback) {
        // TODO: this duplicates the context object putting stress on the GC.
        postOrderContext = in_context.clone();
      }
      currentUserData = in_context.getUserData();

      if (in_context._traversalStopped ||
          in_context._operationType === 'remove' ||
          TypeIdHelper.isPrimitiveType(in_context._splitTypeId.typeid) ||
          in_context._splitTypeId.isEnum) {
        if (in_postCallback) {
          in_postCallback(postOrderContext, function() {
            next('break');
          });
        } else {
          next('break');
        }
      } else {
        next();
      }

    },

    function(next) {
      var currentTypeIdContext = in_context._splitTypeId.context;

      in_context._parentNestedChangeSet = nestedChangeSet;

      // Process an individual change recursively, by preparing the traversal context and invoking
      // _traverseChangeSetRecursively
      var processChange = function(in_segment,
                                  in_subChangeSet,
                                  in_nestedTypeid,
                                  in_escape,
                                  in_parentPropertyType,
                                  in_arrayOperationIndex,
                                  in_arrayLocalIndex,
                                  in_arrayOperationOffset,
                                  in_arrayIteratorOffset,
                                  in_callback) {

        async.series([
          function(n2) {
            try {
              // Update the path
              in_context._lastSegment = in_segment;
              var escapedSegment = in_escape ? PathHelper.quotePathSegmentIfNeeded(in_segment) : in_segment;
              var nextSegmentToPushInParentStack = in_context._lastSegment;
              // Note: we don't quote the path string here, since the paths
              // in a ChangeSet are already quoted, if necessary
              if (currentTypeIdContext === 'map' ||
                  currentTypeIdContext === 'array' ||
                  currentTypeIdContext === 'set') {
                in_context._lastSegmentString = '[' + escapedSegment + ']';
              } else {
                in_context._lastSegmentString = pathSeparator + escapedSegment;
              }
              in_context._fullPath = currentPath + in_context._lastSegmentString;

              // Store the typeid and nested ChangeSet
              in_context._typeid = in_nestedTypeid;
              in_context._nestedChangeSet = in_subChangeSet;
              in_context._propertyContainerType = in_parentPropertyType;
              in_context._arrayOperationIndex = in_arrayOperationIndex;
              in_context._arrayLocalIndex = in_arrayLocalIndex;
              in_context._arrayOperationOffset = in_arrayOperationOffset;
              in_context._arrayIteratorOffset = in_arrayIteratorOffset;
              if (in_arrayIteratorOffset !== undefined) {
                if (in_context._operationType === 'remove') {
                  nextSegmentToPushInParentStack =
                    in_context._lastSegment + in_arrayIteratorOffset - in_arrayLocalIndex;
                  in_context._fullPostPath =
                    currentPostPath + '[' + (in_segment +
                    in_arrayIteratorOffset - in_arrayLocalIndex) + ']';
                } else {
                  nextSegmentToPushInParentStack = in_context._lastSegment + in_arrayIteratorOffset;
                  in_context._fullPostPath = currentPostPath + '[' + (in_segment + in_arrayIteratorOffset) + ']';
                }
              } else {
                nextSegmentToPushInParentStack = in_context._lastSegment;
                in_context._fullPostPath = currentPostPath + in_context._lastSegmentString;
              }

              // Continue traversal
              in_context._stackDepth++;
              in_context._typeStack.push(in_context._typeid);
              in_context._parentStack.push(nextSegmentToPushInParentStack);
              in_context._containerStack.push(in_context._propertyContainerType);
              in_context._userStack.push({});
              _traverseChangeSetRecursivelyAsync(in_preCallback, in_postCallback, in_context, n2);
            } catch (ex) {
              n2(ex);
            }
          },
          function(n2) {
            in_context._stackDepth--;
            in_context._typeStack.pop();
            in_context._parentStack.pop();
            in_context._containerStack.pop();
            in_context._userStack.pop();
            in_context._userData = currentUserData;
            in_context._parentNestedChangeSet = nestedChangeSet;
            n2();
          }
        ], function(err) {
          in_callback(err);
        });
      };

      async.series([
        function(n3) {
          // If this property is a collection, we set the correct type, otherwise we assume it is a NodeProperty
          var propertyContainerType = (splitTypeId.context === 'map' ||
                                      splitTypeId.context === 'set' ||
                                      splitTypeId.context === 'array') ? splitTypeId.context : 'NodeProperty';

          var oldOperationType = in_context._operationType;
          if (splitTypeId.context === 'array') {
            // Use the ArrayChangeSetIterator to process the changes in the ChangeSet in the correct order
            var arrayIterator = new ArrayChangeSetIterator(nestedChangeSet);
            var insertCounter = 0;
            var removeCounter = 0;
            var modifyCounter = 0;

            async.whilst(
              function(callback) {
                callback(null, !arrayIterator.atEnd());
              },
              function(n4) {
                switch (arrayIterator.type) {
                  case ArrayChangeSetIterator.types.INSERT:
                    in_context._operationType = 'insert';
                    async.eachOfSeries(arrayIterator.operation[1], function(item, i, n5) {
                      // The typeid is stored inline for arrays
                      var typeid = item.typeid;
                      ConsoleUtils.assert(typeid, MSG.NON_PRIMITIVE_ARRAY_NO_TYPEID);
                      processChange(
                        arrayIterator.operation[0] + i,
                        item,
                        typeid,
                        false,
                        propertyContainerType,
                        insertCounter,
                        i,
                        arrayIterator.operation[0],
                        arrayIterator.offset,
                        n5
                      );
                    }, function(res) {
                      insertCounter++;
                      arrayIterator.next();
                      n4();
                    });

                    break;
                  case ArrayChangeSetIterator.types.REMOVE:
                    in_context._operationType = 'remove';

                    async.timesSeries(arrayIterator.operation[1], function(i, n5) {
                      // For removals, we don't have a typeid and we use the ChangeSet
                      // of the removal operation as nested
                      // ChangeSet -- TODO: doing this is maybe not really nice here
                      processChange(
                        arrayIterator.operation[0] + i,
                        nestedChangeSet.remove,
                        undefined,
                        false,
                        propertyContainerType,
                        removeCounter,
                        i,
                        arrayIterator.operation[0],
                        arrayIterator.offset,
                        n5
                      );
                    }, function() {
                      removeCounter++;
                      arrayIterator.next();
                      n4();
                    });

                    break;
                  case ArrayChangeSetIterator.types.MODIFY:
                    in_context._operationType = 'modify';

                    async.timesSeries(arrayIterator.operation[1].length, function(i, n5) {
                      // The typeid is stored inline for arrays
                      var typeid = arrayIterator.operation[1][i].typeid;
                      ConsoleUtils.assert(typeid, MSG.NON_PRIMITIVE_ARRAY_NO_TYPEID);
                      processChange(
                        arrayIterator.operation[0] + i,
                        arrayIterator.operation[1][i],
                        typeid,
                        false,
                        propertyContainerType,
                        modifyCounter,
                        i,
                        arrayIterator.operation[0],
                        arrayIterator.offset,
                        n5
                      );
                    }, function() {
                      modifyCounter++;
                      arrayIterator.next();
                      n4();
                    });

                    break;
                  default:
                    arrayIterator.next();
                    n4(new Error(MSG.UNKNOWN_OPERATOR + arrayIterator.type));
                }
              },
              function(err) {
                in_context._operationType = oldOperationType;
                n3(err);
              }
            );
          } else {

            // Process insertion of dynamic property, maps and sets
            async.series([
              function(n4) {
                if (nestedChangeSet.remove) {
                  oldOperationType = in_context._operationType;
                  in_context._operationType = 'remove';
                  var paths = nestedChangeSet.remove;
                  if (_.isArray(paths)) {
                    async.timesSeries(paths.length, function(i, n5) {
                      // For removals in irreversible CSs, we don't have a typeid and we use the ChangeSet of the
                      // removal operation as nested ChangeSet
                      processChange(
                        paths[i],
                        nestedChangeSet.remove,
                        undefined,
                        true,
                        propertyContainerType,
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        n5
                      );
                    }, function(err) {
                      in_context._operationType = oldOperationType;
                      n4(err);
                    });
                  } else {
                    // for removals in reversible changesets we have an object containing the types
                    var typeids = _.keys(nestedChangeSet.remove);
                    async.timesSeries(typeids.length, function(i, n5) {
                      var typeid = typeids[i];
                      paths = _.keys(nestedChangeSet.remove[typeid]);
                      async.timesSeries(paths.length, function(j, n6) {
                        processChange(
                          paths[j],
                          nestedChangeSet.remove[typeid][paths[j]],
                          typeid,
                          true,
                          propertyContainerType,
                          undefined,
                          undefined,
                          undefined,
                          undefined,
                          n6
                        );
                      }, n5);
                    }, function(err) {
                      in_context._operationType = oldOperationType;
                      n4(err);
                    });
                  }
                } else {
                  n4();
                }
              },
              function(n4) {
                if (nestedChangeSet.insert) {
                  // Once we have reached an insert operation all subsequent operations are inserts
                  oldOperationType = in_context._operationType;
                  in_context._operationType = 'insert';
                  // Maps and NodeProperties group the insertions by type
                  var typeids = _.keys(nestedChangeSet.insert);

                  async.timesSeries(typeids.length, function(i, n5) {
                    var typeid = typeids[i];
                    var paths = _.keys(nestedChangeSet.insert[typeid]);

                    async.timesSeries(paths.length, function(j, n6) {
                      processChange(
                        paths[j],
                        nestedChangeSet.insert[typeid][paths[j]],
                        typeid,
                        true,
                        propertyContainerType,
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        n6
                      );
                    }, n5);
                  },
                  function(err) {
                    in_context._operationType = oldOperationType;
                    n4(err);
                  });
                } else {
                  n4();
                }
              },
              function(n4) {
                if (nestedChangeSet.modify) {
                  // Maps and NodeProperties group modifications by type
                  var typeids = _.keys(nestedChangeSet.modify);
                  async.timesSeries(typeids.length, function(i, n5) {
                    var typeid = typeids[i];
                    var paths = _.keys(nestedChangeSet.modify[typeid]);

                    async.timesSeries(paths.length, function(j, n6) {
                      processChange(
                        paths[j],
                        nestedChangeSet.modify[typeid][paths[j]],
                        typeid,
                        true,
                        propertyContainerType,
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        n6
                      );
                    }, n5);
                  }, n4);
                } else {
                  n4();
                }
              },

              function(n4) {
                // Process nested properties
                if (splitTypeId.context === 'single') {
                  var typeids = _.keys(nestedChangeSet);

                  async.timesSeries(typeids.length, function(i, n5) {
                    var typeid = typeids[i];
                    if (!isReservedKeyword(typeid)) {
                      var paths = _.keys(nestedChangeSet[typeid]);

                      async.timesSeries(paths.length, function(j, n6) {
                        processChange(
                          paths[j],
                          nestedChangeSet[typeid][paths[j]],
                          typeid,
                          false,
                          'template',
                          undefined,
                          undefined,
                          undefined,
                          undefined,
                          n6
                        );
                      }, n5);
                    } else {
                      n5();
                    }
                  }, n4);
                } else {
                  n4();
                }
              },

              function(n4) {
                if (in_postCallback) {
                  in_postCallback(postOrderContext, n4);
                } else {
                  n4();
                }
              }
            ], n3);
          }
        }
      ], next);
    }
  ], function(err) {
    if (err === 'break') {
      in_levelCallback();
    } else {
      in_levelCallback(err);
    }
  });
};

/**
 * Traverses a ChangeSet recursively and invokes either a pre- or a post-order callback for each visited property.
 *
 * At least one of the pre- or post-order callbacks must be specified. Both may be specified as well.
 *
 * @param {property-changeset.SerializedChangeSet}     in_changeSet             - The ChangeSet to process
 * @param {object}                                in_params                - An
 *   object containing optional parameters.
 * @param {function(property-changeset.Utils.TraversalContext)} [in_params.preCallback]  - The
 *   (pre-order) callback function that is invoked for each property
 * @param {function(property-changeset.Utils.TraversalContext)} [in_params.postCallback] - The
 *   (post-order) callback function that is invoked for each property
 * @param {*}                                    [in_params.userData]      - An
 *   optional object that is passed to all invocations of the callback via the
 *   context object that can be used to accumulate data.
 * @param {String} [in_params.rootOperation='modify'] -                      The operation that has been applied to
 *                                                                           the root of the ChangeSet (either
 *                                                                           'insert' or 'modify')
 * @param {String} [in_params.rootTypeid]             -                      The full typeid for the Property at the
 *                                                                           root of the ChangeSet
 *
 * @alias property-changeset.Utils.traverseChangeSetRecursively
 */
Utils.traverseChangeSetRecursively = function(in_changeSet, in_params) {
  ConsoleUtils.assert(in_params.preCallback || in_params.postCallback);
  // Initialize the traversal context
  var context = new Utils.TraversalContext();
  if (in_changeSet.typeid) {
    context._typeid = in_changeSet.typeid;
  } else {
    // if we're given an extra rootTypeId, use that
    if (in_params.rootTypeid) {
      context._typeid = in_params.rootTypeid;
    } else {
      // By default, we assume that a ChangeSet without a typeid affects a NodeProperty, since that is the default
      // for a repository root
      context._typeid = 'NodeProperty';
    }
  }
  context._nestedChangeSet = in_changeSet;
  context._parentNestedChangeSet = in_changeSet;
  context._splitTypeId = TypeIdHelper.extractContext(context._typeid);
  context._userData = in_params.userData;

  if (in_params.rootOperation) {
    context._operationType = in_params.rootOperation;
  }

  // Start the traversal
  _traverseChangeSetRecursively(in_params.preCallback, in_params.postCallback, context);
};

/**
 * Traverses a ChangeSet recursively and invokes either a pre- or a post-order callback for each visited property.
 *
 * At least one of the pre- or post-order callbacks must be specified. Both may be specified as well.
 *
 * @param {property-changeset.SerializedChangeSet}     in_changeSet             - The ChangeSet to process
 * @param {object}                                in_params                - An
 *   object containing optional parameters.
 * @param {function(property-changeset.Utils.TraversalContext)} [in_params.preCallback]  - The
 *   (pre-order) callback function that is invoked for each property
 * @param {function(property-changeset.Utils.TraversalContext)} [in_params.postCallback] - The
 *   (post-order) callback function that is invoked for each property
 * @param {*}                                    [in_params.userData]      - An
 *   optional object that is passed to all invocations of the callback via the
 *   context object that can be used to accumulate data.
 * @param {String} [in_params.rootOperation='modify'] -                      The operation that has been applied to
 *                                                                           the root of the ChangeSet (either
 *                                                                           'insert' or 'modify')
 * @param {String} [in_params.rootTypeid]             -                      The full typeid for the Property at the
 *                                                                           root of the ChangeSet
 * @param {function}  [in_finalizer]                  -                      A callback when traversal is completed
 *
 * @alias property-changeset.Utils.traverseChangeSetRecursivelyAsync
 */
Utils.traverseChangeSetRecursivelyAsync = function(in_changeSet, in_params, in_finalizer) {
  ConsoleUtils.assert(in_params.preCallback || in_params.postCallback);
  // Initialize the traversal context
  var context = new Utils.TraversalContext();
  if (in_changeSet.typeid) {
    context._typeid = in_changeSet.typeid;
  } else {
    // if we're given an extra rootTypeId, use that
    if (in_params.rootTypeid) {
      context._typeid = in_params.rootTypeid;
    } else {
      // By default, we assume that a ChangeSet without a typeid affects a NodeProperty, since that is the default
      // for a repository root
      context._typeid = 'NodeProperty';
    }
  }
  context._nestedChangeSet = in_changeSet;
  context._parentNestedChangeSet = in_changeSet;
  context._splitTypeId = TypeIdHelper.extractContext(context._typeid);
  context._userData = in_params.userData;

  if (in_params.rootOperation) {
    context._operationType = in_params.rootOperation;
  }

  // Start the traversal
  _traverseChangeSetRecursivelyAsync(in_params.preCallback, in_params.postCallback, context, in_finalizer);
};

/**
 * Extracts all typeIds from the given ChangeSet
 *
 * @param {property-changeset.SerializedChangeSet} in_changeSet - The ChangeSet to process
 *
 * @return {Array<String>} All typeids that appear in the ChangeSet
 */
Utils.extractTypeids = function(in_changeSet) {
  var result = {};
  Utils.traverseChangeSetRecursively(in_changeSet, {
    preCallback: function(in_context) {
      if (in_context.getOperationType() === 'insert' ||
          in_context.getOperationType() === 'modify') {
        in_context.getUserData()[in_context.getTypeid()] = true;
      }
    },
    userData: result
  });
  return _.keys(result);
};

/**
 * Enumerates all template from a given ChangeSet
 *
 * @param {property-changeset.SerializedChangeSet} in_changeSet - The ChangeSet to process
 *
 * @param {function} in_callback - A callback that is used to emit every template
 *
 * @param {function} in_finalizer - A callback that is called when enumeration is completed
 *
 * @return {Array<Object>} All templates that appear in the ChangeSet
 *   The returned object has members key (string), corresponding to the type and value with the
 *   definition (object)
 */
Utils.enumerateSchemas = function(in_changeSet, in_callback, in_finalizer) {
  var result = [];

  if (in_changeSet.insertTemplates) {
    var keys = Object.keys(in_changeSet.insertTemplates);
    async.eachSeries(keys, function(k, next) {
      in_callback({
        key: k,
        value: in_changeSet.insertTemplates[k]
      }, next);
    }, in_finalizer);
  } else {
    in_finalizer();
  }

  return result;
};

/**
 * Removes all typeids from a ChangeSet
 * This is a private functions, it is only exported for the tests.
 *
 * @private
 * @param {property-changeset.SerializedChangeSet} io_changeSet    - The ChangeSet to process
 */
Utils._stripTypeids = function(io_changeSet) {

  var result = {};
  Utils.traverseChangeSetRecursively(io_changeSet, {
    preCallback: function(in_context) {
      if (in_context.getFullPath() === '') {
        // We do nothing for the root
        return;
      }

      var userData = in_context.getUserData();

      if (in_context.getOperationType() === 'remove') {
        if (!userData[in_context.getOperationType()]) {
          userData[in_context.getOperationType()] = _.clone(in_context.getNestedChangeSet());
        }
        return;
      }

      var operationScope;
      if (in_context.getPropertyContainerType() !== 'template') {
        operationScope = userData[in_context.getOperationType()] = userData[in_context.getOperationType()] ||
                             (in_context.getPropertyContainerType() === 'array' ? [] : {});
      } else {
        operationScope = userData;
      }

      if (TypeIdHelper.isPrimitiveType(in_context.getTypeid())) {
        // This is a primitive type, we store it under its name in the result
        operationScope[in_context.getLastSegment()] = in_context.getNestedChangeSet();
      } else {
        var nestedUserData = {};
        if (in_context.getPropertyContainerType() === 'array') {
          if (!operationScope[in_context.getArrayOperationIndex()]) {
            operationScope[in_context.getArrayOperationIndex()] = [in_context.getArrayOperationOffset(), []];
          }
          var arrayOperation = operationScope[in_context.getArrayOperationIndex()];

          arrayOperation[1][in_context.getArrayLocalIndex()] = nestedUserData;
        } else {
          // If it is a collection, we have to continue recursively
          operationScope[in_context.getLastSegment()] = nestedUserData;
        }

        in_context.setUserData(nestedUserData);
      }
    },
    userData: result
  });

  // Remove all existing keys from the ChangeSet
  _.forEach(_.keys(io_changeSet), function(key) { delete io_changeSet[key]; });

  // Assign from the result user data
  _.extend(io_changeSet, result);
};

/**
 * Searches through a ChangeSet and returns all Changes to a properties with a given typeid
 *
 * @param {String}                            in_typeid    - The typeid of the property to look for
 * @param {property-changeset.SerializedChangeSet} in_changeSet - The ChangeSet to process
 * @param {Boolean} in_excludetypeids - Exclude all typeids from the returned ChangeSet
 * @return { {insert: Object, modify: Object} } Returns the applied operations to entries of the given typeid.
 *                                              The returned maps for insert and modify map paths to ChangeSets
 */
Utils.getChangesByType = function(in_typeid, in_changeSet, in_excludetypeids) {
  var result = {};

  // We search for the typeid by traversing the whole ChangeSet recursively
  Utils.traverseChangeSetRecursively(in_changeSet, {
    preCallback: function(in_context) {
      // If we found and instance of the requested typeid, we store it under its path
      if (in_context.getTypeid() === in_typeid) {
        var userData = in_context.getUserData();
        userData[in_context.getOperationType()] = userData[in_context.getOperationType()] || {};
        userData[in_context.getOperationType()][in_context.getFullPath()] = in_context.getNestedChangeSet();
      }
    },
    userData: result
  });

  // Exclude typeids if requested by the caller
  if (in_excludetypeids) {
    var insertKeys = _.keys(result.insert);
    for (var i = 0; i < insertKeys.length; i++) {
      result.insert[insertKeys[i]] = deepCopy(result.insert[insertKeys[i]]);
      Utils._stripTypeids(result.insert[insertKeys[i]]);
    }

    var modifyKeys = _.keys(result.modify);
    for (var i = 0; i < modifyKeys.length; i++) {
      result.modify[modifyKeys[i]] = deepCopy(result.modify[modifyKeys[i]]);
      Utils._stripTypeids(result.modify[modifyKeys[i]]);
    }
  }

  return result;
};

/**
 * Filter the serialized ChangeSet returning a subset of serialized ChangeSet which has been performed
 * on the given path. Returns an empty serialized ChangeSet if the path has not been affected.
 *
 * @param {string} in_path - The path to process
 * @param {property-changeset.BaseProperty} in_root - The root node to which the ChangeSet has been applied
 * @param {property-changeset.SerializedChangeSet} in_changeSet - The ChangeSet to process
 * @param {Boolean} in_excludetypeids - Exclude all typeids from the returned ChangeSet
 * @throws if path is invalid.
 * @return {object} - The changes that are applied to the given path
 * <pre>
 * {insert: Object|undefined, modify: Object|undefined, remove: boolean|undefined}
 * </pre>
 */
Utils.getChangesByPath = function(in_path, in_root, in_changeSet, in_excludetypeids) {
  // if we're asked for the root, just return the root (in a modify)
  if (in_path === '') {
    return {modify: in_changeSet};
  }

  // tokenize the path we are searching for
  var pathSegments = PathHelper.tokenizePathString(in_path);

  // Recursively traverse the ChangeSet and search for the path
  var result = {};
  Utils.traverseChangeSetRecursively(in_changeSet, {
    preCallback: function(in_context) {
      // We ignore the root
      if (in_context.getFullPath() === '') {
        return;
      }

      var userData = in_context.getUserData();

      var currentSegment = pathSegments[userData.currentLevel];
      var changesetSegment = in_context.getLastSegmentEscaped().toString();
      var level = userData.currentLevel;

      // We have to handle the case that a path contains nested properties. In that case we concatenate the
      // properties in the path, as long as they are a prefix of the segment we are currently looking at
      var mergedSegment = PathHelper.quotePathSegmentIfNeeded(currentSegment);
      while (changesetSegment.length > mergedSegment.length &&
             changesetSegment.substr(0, mergedSegment.length) === mergedSegment &&
             level < pathSegments.length - 1) {
        level++;
        mergedSegment = mergedSegment + PROPERTY_PATH_DELIMITER +
                        PathHelper.quotePathSegmentIfNeeded(pathSegments[level]);
      }


      // Have we found the right entry in the ChangeSet?
      // TODO: This could be done more efficiently
      if (changesetSegment === mergedSegment) {
        if (in_context.getOperationType() === 'remove') {
          // If this is a removal operation, we mark the path as removed, even if we haven't reached the end of the
          // path
          result.removed = true;
          in_context.stopTraversal();
        } else {
          // Did we find the last segment in the path?
          if (level === pathSegments.length - 1) {
            // In that case, we return the result
            result[in_context.getOperationType()] = {};

            var currentChangeSet = in_context.getNestedChangeSet();
            if (in_excludetypeids) {
              currentChangeSet = deepCopy(currentChangeSet);
              Utils._stripTypeids(currentChangeSet);
            }
            result[in_context.getOperationType()][in_context.getFullPath()] = currentChangeSet;
            in_context.stopTraversal();
          } else {
            // Otherwise, we continue recursively with the next level
            in_context.setUserData({ currentLevel: level + 1 });
          }
        }
      } else {
        // Stop the traversal, if this is the wrong segment
        in_context.stopTraversal();
      }
    },
    userData: { currentLevel: 0 }
  });

  return result;
};

/**
 * Invoke a callback for all nested ChangeSets that correspond to a set of user supplied tokenized paths.
 *
 * @param {Map|object} in_paths -
 *     A map or object which contains the tokenized paths as nested elements. Common path segment are thus shared.
 *     NOTE: It is recommended to use Map as it provides better performance.
 *     For example, for these three paths:
 *     'entry1'
 *     'nested.entry2'
 *     'nested.entry3'
 *
 *     Using a map for paths would look like this:
 *     new Map([
 *       ['entry', new Map()],
 *       ['nested', new Map([
 *         ['entry2', new Map()],
 *         ['entry3', new Map()]
 *       ])]
 *     ])
 *
 *     While using objects for paths would look like this:
 *     {
 *       entry: {},
 *       nested: {
 *         entry2: {}
 *         entry3: {}
 *       }
 *     }
 *
 *     The element under the path, will be provided to the callback. If you have to pass additional data
 *     to the callback, you can add private data by prefixing it with __ and setting
 *     in_options.escapeLeadingDoubleUnderscore to true.
 *     In case you do that, bear in mind that paths that refer to changeSet properties that have at least
 *     two underscores as prefix in its id, should contain an extra underscore character as prefix:
 *     | Path in changeSet | Path in paths |
 *     |       path0       |      path0    | (unescaped)
 *     |      _path1       |     _path1    | (unescaoed)
 *     |     __path2       |   ___path2    | (escaped with one extra leading underscore)
 *     |    ___path3       |  ____path3    | (also escaped, the same applies to N underscores where N >= 2)
 * @param {property-changeset.SerializedChangeSet} in_changeSet -
 *     The ChangeSet to process
 * @param {function(property-changeset.Utils.TraversalContext, (Map|object), Array.<string>, boolean)} in_callback -
 *     The function to invoke at the registered paths (it is called both for the interior and the leaf nodes). The
 *     callback will be called for each node with the following parameters:
 *     * {property-changeset.Utils.TraversalContext} context - The current TraversalContext as returned by
 *                                                        Utils.traverseChangeSetRecursively. Can be used for
 *                                                        querying the current Property type, operation, etc.
 *     * {Map|object} currentSubPaths                   - a subset of the tokenized paths passed in as input to this
 *                                                        function that still need to be processed from the current
 *                                                        node
 *     * {Array.<string>} currentTokenizedPath          - the tokenized path leading to the current node
 *     * {boolean} contractedPathSegment                - True if the current node is inside a contracted path segment
 *                                                        (e.g. currentTokenizedPath is ['foo'], coming from the
 *                                                        changeset segment 'foo.bar'), false otherwise. If true, the
 *                                                        typeid from the context parameter may not be valid at the
 *                                                        current node. Callbacks may ignore this if they are not
 *                                                        concerned with the type.
 * @param {Object} [in_options] -
 * @param {String} [in_options.rootOperation='modify'] -
 *     The operation that has been applied to the root of the ChangeSet (either 'insert' or 'modify')
 * @param {String} [in_options.rootTypeid] -
 *     The full type of the root Property of the ChangeSet
 * @param {Boolean} [in_options.escapeLeadingDoubleUnderscore=false] -
 *     If this is set to true, keys which start with '__' will be escaped (by adding an additional '_') before the
 *     lookup into the paths map. This frees the keyspace with duplicated underscores for the use by the calling
 *     application.
 */
Utils.getChangesToTokenizedPaths = function(in_paths,
                                            in_changeSet,
                                            in_callback,
                                            in_options) {
  var currentTokenizedPath = [];
  in_options = in_options || {};

  var paths;
  var legacyPaths;

  var _isUserData = (k) => {
    // We only support storing user data "as is" if the in_options.escapeLeadingUnderscore is enabled.
    // We assume user data is anything that begins with exactly two underscores.
    // If the third character is also an underscore it is either an escaped changeSet segment or something that the
    // calling application escaped so we don't consider this user data.
    // Note that if the calling application sets the in_options.escapeLeadingDoubleUnderscore option, it is responsible
    // for escaping input path segments that begin with a double underscore,
    // otherwise such segments will be considered as user data!
    return in_options.escapeLeadingDoubleUnderscore && k && k.length > 2 && k[0] === '_' && k[1] === '_' &&
      k[2] !== '_';
  };

  var _convertLevelToMap = function(obj) {
    let thisLevel = new Map();
    Object.entries(obj).forEach(([k, v]) => {
      if (_isUserData(k)) {
        // We do not want to convert user provided data into maps so we store this subtree as is
        thisLevel.set(k, v);
      } else {
        thisLevel.set(k, _convertLevelToMap(v));
      }
    });
    return thisLevel;
  };

  var _convertMapToLevel = function(map) {
    let thisLevel = {};
    for (const [k, v] of map) {
      if (_isUserData(k)) {
        thisLevel[k] = v;
      } else {
        if (v instanceof Map) {
          thisLevel[k] = _convertMapToLevel(v);
        } else {
          thisLevel[k] = v;
        }
      }
    }
    return thisLevel;
  };

  var _toCallbackParam = (pathLevels) => {
    if (legacyPaths) {
      // If a user provided objects as paths, they would expect objects in their callbacks as well.
      // So, we transform the parameter to an object, which is not very performant but is backwards compatible.
      return _convertMapToLevel(pathLevels);
    } else {
      return pathLevels;
    }
  };

  if (!(in_paths instanceof Map)) {
    legacyPaths = true;
    paths = _convertLevelToMap(in_paths);
  } else {
    legacyPaths = false;
    paths = in_paths;
  }

  // Recursively traverse the ChangeSet and search for the path
  Utils.traverseChangeSetRecursively(in_changeSet, {
    preCallback: function(in_context) {
      var userData = in_context.getUserData();
      var currentSubPaths = userData.currentSubPaths;

      // We ignore the root
      if (in_context.getFullPath() === '') {
        in_callback(in_context, _toCallbackParam(currentSubPaths), currentTokenizedPath, false);
        return;
      }

      var changesetSegment = in_context.getLastSegmentEscaped().toString();
      var numberOfSegments = 1;
      var nestedSubPath;
      if (changesetSegment.indexOf('.') !== -1 ||
          (changesetSegment.length > 0 && changesetSegment[0] === '"')) {
        nestedSubPath = currentSubPaths;
        var tokenized = PathHelper.tokenizePathString(changesetSegment);
        numberOfSegments = tokenized.length;
        for (var i = 0; i < tokenized.length; i++) {
          var segment = tokenized[i];
          currentTokenizedPath.push(segment);
          if (in_options.escapeLeadingDoubleUnderscore &&
              segment[0] === '_' &&
              segment[1] === '_') {
            segment = '_' + segment;
          }
          nestedSubPath = nestedSubPath.get(segment);
          if (nestedSubPath === undefined) {
            numberOfSegments = i + 1;
            break;
          }
          if (i !== tokenized.length - 1) {
            // Bug fix: signal the callback that we're inside a contracted path segment
            in_callback(in_context, _toCallbackParam(nestedSubPath), currentTokenizedPath, true);
          }
        }
      } else {
        currentTokenizedPath.push(changesetSegment);
        if (in_options.escapeLeadingDoubleUnderscore &&
            changesetSegment[0] === '_' &&
            changesetSegment[1] === '_') {
          changesetSegment = '_' + changesetSegment;
        }
        nestedSubPath = currentSubPaths.get(changesetSegment);
      }

      // Have we found the right entry in the ChangeSet?
      // TODO: This could be done more efficiently
      if (nestedSubPath) {
        // Otherwise, we continue recursively with the next level
        in_context.setUserData({currentSubPaths: nestedSubPath, numberOfSegments: numberOfSegments});
        if (in_context.getOperationType() === 'remove') {
          // If this is a removal operation, we mark the path as removed, even if we haven't reached the end of the
          // path
          in_callback(in_context, _toCallbackParam(nestedSubPath), currentTokenizedPath, false);

          in_context.stopTraversal();
        } else {
          in_callback(in_context, _toCallbackParam(nestedSubPath), currentTokenizedPath, false);
        }
      } else {
        // Stop the traversal, if this is the wrong segment
        in_context.setUserData({currentSubPaths: undefined, numberOfSegments: numberOfSegments});
        in_context.stopTraversal();
      }
    },
    postCallback: function(in_context) {
      for (var i = 0; i < in_context.getUserData().numberOfSegments; i++) {
        currentTokenizedPath.pop();
      }
    },
    userData: {
      currentSubPaths: paths,
      numberOfSegments: 0
    },
    rootOperation: in_options.rootOperation,
    rootTypeid: in_options.rootTypeid
  });
};

/**
 * Insert the necessary path for a change to a specific property into a ChangeSet.
 *
 * This function takes a property, its root property and a ChangeSet relative to that root. It returns the
 * nested ChangeSet for the supplied property. If there is already a nested changeSet for the supplied
 * property in the changeSet, it will be returned. Otherwise, the necessary modify/insert commands are
 * created.
 *
 * @param {property-changeset.BaseProperty}        in_property - The property for which the nested ChangeSet is requested
 * @param {property-changeset.NodeProperty}        in_root - The root of the property
 * @param {property-changeset.SerializedChangeSet} in_changeSet - The changeSet into which the entry is added
 * @param {Boolean}                           in_insert - Do we want to crate an insert instead of a modify?
 * @return {{
 *           remove: (Boolean|undefined),
 *           insert: (Boolean|undefined),
 *           propertyChangeSet: (property-changeset.SerializedChangeSet|undefined)
 *         }}
 *     The return value contains the nested ChangeSet and a flag whether the property has been inserted. If
 *     the property has been removed, only remove: true will be present
 *     @private
 */
/*Utils.insertPropertyChangeIntoChangeset = function(in_property, // eslint-disable-line complexity
                                                   in_root,
                                                   in_changeSet,
                                                   in_insert) {
  // If the supplied property has a different root, it must have been removed from the
  // root property already
  if (in_property.getRoot() !== in_root) {
    return {
      remove: true
    };
  }

  // Recursively insert/modify the ChangeSet for the parent property
  var currentChangeSet = in_changeSet;
  var inserting = in_insert;
  if (in_property.getParent()) {
    var result = Utils.insertPropertyChangeIntoChangeset(in_property.getParent(), in_root, in_changeSet, in_insert);
    if (result.remove) {
      return result;
    }
    inserting = result.insert;
    currentChangeSet = result.propertyChangeSet;
  } else {
    return {
      propertyChangeSet: in_changeSet,
      insert: in_insert
    };
  }

  var typeid = in_property.getFullTypeid();
  var parentProperty = in_property.getParent();
  var propertyId =  in_property.getId();
  var propertyChangeSet;

  // Handle indexed collections
  if (parentProperty instanceof Property.IndexedCollectionBaseProperty) {
    // Check for removals of the key
    if (currentChangeSet.remove) {
      if (_.isArray(currentChangeSet.remove)) {
        // Non reversible ChangeSet syntax
        if (_.includes(currentChangeSet.remove, propertyId)) {
          return {
            remove: true
          };
        }
      } else {
        // Reversible ChangeSet syntax
        if (currentChangeSet.remove[typeid][propertyId] !== undefined) {
          return {
            remove: true
          };
        }
      }
    }

    // Check, whether the entry is contained in the collection
    // (we use the internal member here, since the common base class does not export
    // a public interface)
    if (parentProperty._entries[propertyId]) {
      if (currentChangeSet.insert &&
          currentChangeSet.insert[typeid] &&
          currentChangeSet.insert[typeid][propertyId]) {
        // If we found an insert, we will always switch to the inserting mode
        propertyChangeSet = currentChangeSet.insert[typeid][propertyId];
        inserting = true;
      }

      if (currentChangeSet.modify &&
          currentChangeSet.modify[typeid] &&
          currentChangeSet.modify[typeid][propertyId]) {
        propertyChangeSet = currentChangeSet.modify[typeid][propertyId];
      }

      if (!propertyChangeSet) {
        if (inserting) {
          // Create a new insert entry
          currentChangeSet.insert = currentChangeSet.insert || {};
          currentChangeSet.insert[typeid] = currentChangeSet.insert[typeid] || {};
          currentChangeSet.insert[typeid][propertyId] = {};
          propertyChangeSet = currentChangeSet.insert[typeid][propertyId];
        } else {
          // Create a new modify entry
          currentChangeSet.modify = currentChangeSet.modify || {};
          currentChangeSet.modify[typeid] = currentChangeSet.modify[typeid] || {};
          currentChangeSet.modify[typeid][propertyId] = {};
          propertyChangeSet = currentChangeSet.modify[typeid][propertyId];
        }
      }
    }
  } else if (parentProperty instanceof Property.ArrayProperty) {
    // We have the index of the entry after the operations have been applied and we have to convert it to an
    // index before the operations have been performed. So we need to iterate over the operations and compute the
    // offset
    var index = parentProperty.getEntriesReadOnly().indexOf(in_property);
    var iterator = new ArrayChangeSetIterator(currentChangeSet);
    while (!iterator.atEnd()) {
      if (iterator.type === ArrayChangeSetIterator.types.INSERT ||
          iterator.type === ArrayChangeSetIterator.types.MODIFY) {
        var offsetedIndex = index - iterator.offset;
        if (iterator.operation[0] <= offsetedIndex &&
            iterator.operation[0] + iterator.operation[1].length > offsetedIndex) {
          propertyChangeSet = iterator.operation[1][offsetedIndex - iterator.operation[0]];
          inserting = iterator.type === ArrayChangeSetIterator.types.INSERT;
          break;
        }

        if (iterator.operation[0] > offsetedIndex) {
          // We reached an operation after the given index and
          // did not yet find a corresponding insert/modify
          // we can stop  here
          break;
        }
      }
      iterator.next();
    }

    // We did not find any matching operations, so we create
    // a new one
    if (!propertyChangeSet) {
      // This is just a unique token we insert into the ChangeSet to find in the search below
      var token =  'fa8d09e9-9bf4-181b-d184-0da7b7a860d5';

      // Insert a modify entry into the currentChangeSet
      ChangeSet.prototype._performApplyAfterOnPropertyArray(currentChangeSet, {
        modify: [[index, [{
          typeid: in_property.getFullTypeid(false),
          // This can never appear in a valid changeset since uniqueToken is not a valid typeid
          uniqueToken: token
        }]]]
      }, parentProperty.getFullTypeid(true));

      // The _performApplyAfterOnPropertyArray function creates a deep copy, so we have to search for the changeset
      for (var i = 0; i < currentChangeSet.modify.length && !propertyChangeSet; i++) {
        var operation = currentChangeSet.modify[i];
        for (var j = 0; j < operation[1].length; j++) {
          if (operation[1][j].uniqueToken === token) {
            // We found the entry
            propertyChangeSet = operation[1][j];
            delete property-changeset.uniqueToken;
            break;
          }
        }
      }
    }
  }

  // We haven't found the ChangeSet yet, so we have to assume that it is a static entry
  // in a templated property
  if (!propertyChangeSet) {
    currentChangeSet[typeid] = currentChangeSet[typeid] || {};
    currentChangeSet[typeid][propertyId] = currentChangeSet[typeid][propertyId] || {};
    propertyChangeSet = currentChangeSet[typeid][propertyId];
  }

  return {
    propertyChangeSet: propertyChangeSet,
    insert: inserting
  };
};*/

/**
 * Copies a change set into an object that is meant to be a placeholder for the next
 * property in the tree.
 * @param {object} in_objectToPopulate - Object to copy the change set into
 * @param {property-changeset.Utils.TraversalContext} in_context - change set traversal context
 * @param {property-changeset.SerializedChangeSet} in_changeSet - Original change set to copy
 * @param {boolean} [in_isLeaf=false] - Flag indicating that the entire sub tree should be copied over.
 * @return {object} ChangeSet that will be populated by the next iteration.
 * @throws if the container type is array, set or unknown (should never happen)
 * @private
 */
var _filterChangeSetBySegment = function(in_objectToPopulate, in_context, in_changeSet, in_isLeaf) {
  var nestedChangeSet = {};
  if (in_context.getPropertyContainerType() === 'NodeProperty' ||
      in_context.getPropertyContainerType() === 'map' ||
      in_context.getPropertyContainerType() === 'set') {
    if (in_context.getOperationType() === 'remove') {
      if (_.isArray(in_context.getNestedChangeSet())) {
        in_objectToPopulate['remove'] = in_objectToPopulate['remove'] || [];
        in_objectToPopulate['remove'].push(in_context.getLastSegment());
      } else {
        // We are in a reversible changeset case
        in_objectToPopulate['remove'] = in_objectToPopulate['remove'] || {};
        in_objectToPopulate['remove'][in_context.getTypeid()] =
          in_objectToPopulate['remove'][in_context.getTypeid()] || {};
        in_objectToPopulate['remove'][in_context.getTypeid()][in_context.getLastSegment()] =
          deepCopy(in_context.getNestedChangeSet());
      }
    } else {
      in_objectToPopulate[in_context.getOperationType()] = in_objectToPopulate[in_context.getOperationType()] || {};
      in_objectToPopulate[in_context.getOperationType()][in_context.getTypeid()] =
        in_objectToPopulate[in_context.getOperationType()][in_context.getTypeid()] || {};

      if (TypeIdHelper.isPrimitiveType(in_context.getTypeid()) || in_isLeaf) {
        in_objectToPopulate[in_context.getOperationType()][in_context.getTypeid()][in_context.getLastSegment()] =
          deepCopy(in_context.getNestedChangeSet());
      } else {
        in_objectToPopulate[in_context.getOperationType()][in_context.getTypeid()][in_context.getLastSegment()] =
          nestedChangeSet;
      }
    }
  } else if (in_context.getPropertyContainerType() === 'template') {
    in_objectToPopulate[in_context.getTypeid()] = in_objectToPopulate[in_context.getTypeid()] || {};
    if (TypeIdHelper.isPrimitiveType(in_context.getTypeid()) || in_isLeaf) {
      in_objectToPopulate[in_context.getTypeid()][in_context.getLastSegment()] =
      deepCopy(in_context.getNestedChangeSet());
    } else {
      in_objectToPopulate[in_context.getTypeid()][in_context.getLastSegment()] =
        nestedChangeSet;
    }
  } else {
    switch (in_context.getPropertyContainerType()) {
      case 'array':
        throw new Error(MSG.FILTER_PATH_WITHIN_ARRAY);
      default:
        throw new Error('Encountered an unknown parent container type ' +
          in_context.getPropertyContainerType()
        );
    }
  }

  return nestedChangeSet;
};

/**
 * Filter change sets by paths.
 * Given a change set, this function will filter it based on a series of paths.
 * The final ChangeSet will only include the paths in question starting from the root of
 * the ChangeSet.
 * For Example,
 *   Given the following change set
 *      'insert': {
 *        'String': {
 *          'string1': 'hello',
 *          'string2': 'world
 *        }
 *      }
 *   And the path
 *     ['string1']
 *   the resulting ChangeSet will be
 *     'insert': {
 *       'String': {
 *         'string1': 'hello'
 *       }
 *     }
 *
 * NOTE: Paths that traverse through sets and arrays are not supported.
 *
 * @param {property-changeset.SerializedChangeSet} in_changeSet - The changeset to parse
 * @param {Array<string>|Map} in_paths - List of paths to filter by. This can either be passed
 *     as a flat array of paths or as a Map with the tokenized, tree structured paths, see the
 *     documentation of getChangesToTokenizedPaths for an example.
 *     Note: duplicate paths will be ignored including ones that encompasse other paths
 *
 * @throws if a path given resolves into an array or set
 * @return {property-changeset.SerializedChangeSet} - Filtered ChangeSet
 */
Utils.getFilteredChangeSetByPaths = function(in_changeSet, in_paths) {
  var pathsToObj;

  if (_.isArray(in_paths)) {
    pathsToObj = Utils.convertPathArrayToTree(in_paths);
  } else if (in_paths instanceof Map) {
    pathsToObj = in_paths;
  } else {
    throw new Error('in_paths must be a list of paths or a map of the tokenized paths');
  }

  var rootChangeSet = {};

  var pathToChangeSet = {};

  var toPurge = {};

  let redundantPaths = new Map();
  Utils.getChangesToTokenizedPaths(pathsToObj, in_changeSet, function(
    context, nestedObj, tokenizedPath, contractedPathSegment
  ) {
    if (context.getFullPath() === '') {
      // skip the root
      return;
    }

    var parentNestedChangeSet = context.getParentNestedChangeSet();
    var changeSetToPopulate;

    var pathHasBeenFound = false;
    let fullPath;
    if (tokenizedPath.length === 1) {
      // first depth
      changeSetToPopulate = rootChangeSet;
      fullPath = PathHelper.quotePathSegmentIfNeeded(tokenizedPath[0]);
      var pathEntry = pathsToObj.get(tokenizedPath[0]);
      if (pathEntry) {
        pathHasBeenFound = true;
      }
    } else {
      var parentPath = '';
      fullPath = '';
      var currentEntryInPathsToObj = pathsToObj;

      var pathsToDelete = [];
      _.each(tokenizedPath, function(segment, index) {
        if (index === 0 ) {
          parentPath += PathHelper.quotePathSegmentIfNeeded(segment);
          changeSetToPopulate = pathToChangeSet[parentPath] || changeSetToPopulate;
        } else if (index < tokenizedPath.length - 1) {
          if (context.getContainerStack()[index] !== 'set' && context.getContainerStack()[index] !== 'map') {
            parentPath += '.' + PathHelper.quotePathSegmentIfNeeded(segment);
          } else {
            parentPath += `[${PathHelper.quotePathSegmentIfNeeded(segment)}]`;
          }
          changeSetToPopulate = pathToChangeSet[parentPath] || changeSetToPopulate;
        } else {
          if (context.getContainerStack()[index] !== 'set' && context.getContainerStack()[index] !== 'map') {
            parentPath += '.' + PathHelper.quotePathSegmentIfNeeded(segment);
          } else {
            parentPath += `[${PathHelper.quotePathSegmentIfNeeded(segment)}]`;
          }
          fullPath = parentPath;
        }
        pathsToDelete.push(parentPath);


        if (currentEntryInPathsToObj) {
          currentEntryInPathsToObj = currentEntryInPathsToObj.get(segment);

          if (currentEntryInPathsToObj) {
            if (currentEntryInPathsToObj.size === 0) {
              // Handle the case where we do not want to remove paths that should be included
              // when filtering by a parent path. The case in particular that is of interest are
              // paths that are folded into a single path for custom templates I.e.
              // E.g.
              // Given the following nested change set
              // {String: {'a.b.c.d.f' : '...'}}
              // we want to include it as part of the result when filtering by 'a.b.c'
              delete toPurge[context.getFullPath()];
            }

            // We matched a path from the list of paths the user has passed in_context
            // In that case, we can remove all prefix paths from the list of redundant paths,
            // since we now know for sure, that they are needed in the final changeset
            pathHasBeenFound = true;
            for (var i = 0; i < pathsToDelete.length; i++) {
              redundantPaths.delete(pathsToDelete[i]);
            }
          }
        }
      });

      if (fullPath !== context.getFullPath() && pathToChangeSet[context.getFullPath()]) {
        // Here we are in the case where we have a changeset that
        // contains a property with path a.b.c.d as the key.
        // In that case, getChangesToTokenizedPaths will be called
        // at each level but will be ignored on every path leading up
        // to the leaf node
        // i.e. for a path "a.b.c.d", "a" "b" and "c" will be ignored.
        return;
      }
    }

    if (!pathHasBeenFound) {
      redundantPaths.set(fullPath, {
        changeSetToPopulate,
        operation: context.getOperationType(),
        typeid: context.getTypeid(),
        lastSegment: context.getLastSegment(),
        containerType: context.getPropertyContainerType()
      });
    }

    // Here we override the fullPath to be the full path of the context
    // For anything that is not a set or a map. This is due to the fact that
    // on the next iteration of the child of a set, we lose the context of
    // property container which means that our fullPath will actually contain
    // dots for sets. This is OK because we build the fullpath ourselves in such a
    // case and it will be consistent with the way we search for a valid changeSetToPopulate
    if (context.getPropertyContainerType() !== 'set' && context.getPropertyContainerType() !== 'map') {
      fullPath = context.getFullPath();
    }

    // keep a reference to the underlying change set of the current path.
    // This will speed up the process to know which object representing
    // the nested change set needs to be populated on the subsequent iterations
    pathToChangeSet[fullPath] = _filterChangeSetBySegment(
      changeSetToPopulate,
      context,
      parentNestedChangeSet,
      nestedObj.size === 0
    );

    // Since some hierarchies are folded into a single path, there is a case where
    // we end up with entries in the change set that we did not want. For instance,
    // if the change set contains two sibling paths "a.b.c" and "a.b.d", getChangesToTokenizedPaths
    // will invoke the callback for both paths at each level and we'll end up including both
    // paths in the filtered change set even if we didn't ask for both.
    // In that case, we keep track of change sets that we will later purge if we did not ask for them.
    //
    // NOTE: A common pitfal is to check against the presence of a "dot" in the segment to detect such a case
    // we instead check against the tokenized paths.
    // Otherwise, the function will behave incorrectly if a segment contains a dot
    // i.e.
    var lastSegment = context.getLastSegmentEscaped();
    if (contractedPathSegment &&
       ( (lastSegment.indexOf('.') !== -1 ||
          (lastSegment.length > 0 && lastSegment[0] === '"')) &&
         PathHelper.tokenizePathString(lastSegment).length > 1 )
        ) {
      toPurge[context.getFullPath()] = {
        changeSet: changeSetToPopulate,
        typeid: context.getTypeid(),
        pathToPurge: lastSegment
      };
    } else {
      delete toPurge[context.getFullPath()];
    }
  });

  // Delete entries from the change set that we do not want.
  // We can enter this case when dealing with folded paths.
  _.each(toPurge, function(item, fullPath) {
    delete item.changeSet[item.typeid][item.pathToPurge];
    if (_.isEmpty(item.changeSet[item.typeid])) {
      delete item.changeSet[item.typeid];
    }
  });

  // Remove paths from the changeset that have been inserted during the traversal, but later
  // did not match any of the passed paths.
  for (let key of redundantPaths.keys()) {
    var removalInformation = redundantPaths.get(key);
    var CS = removalInformation.changeSetToPopulate;
    if (removalInformation.containerType !== 'template') {
      var operation = removalInformation.operation;
      if (operation === 'remove') {
        // Removes will recursively continue and don't need to be filtered
        continue;
      } else {
        var operationCS = CS[operation];
        var typeidCS = CS[operation][removalInformation.typeid];
        delete typeidCS[removalInformation.lastSegment];
        if (_.isEmpty(typeidCS)) {
          delete operationCS[removalInformation.typeid];
        }
        if (_.isEmpty(CS[operation])) {
          delete CS[operation];
        }
      }
    } else {
      var typeidCS = CS[removalInformation.typeid];
      delete typeidCS[removalInformation.lastSegment];
      if (_.isEmpty(typeidCS)) {
        delete CS[removalInformation.typeid];
      }
    }
  }
  return rootChangeSet;
};

/**
 * Converts an array of paths to the tree structured representation that is needed
 * as input for the function getChangesToTokenizedPaths.
 *
 * @param {String} in_paths - An array with paths
 * @return {Map} A tree structured representation of the tokenized paths that can be
 *     passed to getChangesToTokenizedPaths and getFilteredChangeSetByPaths.
 */
Utils.convertPathArrayToTree = function(in_paths) {
  in_paths = _.isArray(in_paths) ? in_paths : [in_paths];
  var pathsToProcess = new Set(in_paths);

  // create an array of arrays splitting by .
  var tokenizedPaths = in_paths.map(function(path) {
    return PathHelper.tokenizePathString(path);
  });

  // Create a tree representation of the paths that are passed as an input so that
  // we can leverage getChangesToTokenizedPaths and only be notified on paths
  // that we care about.
  var pathsToObj = _.reduce(tokenizedPaths, function(memo, tokenizedPath) {
    var obj = memo;
    var path = '';
    var segment;

    for (var index = 0; index < tokenizedPath.length; index++) {
      segment = tokenizedPath[index];

      if (index === 0) {
        path = PathHelper.quotePathSegmentIfNeeded(segment);
      } else {
        path += '.' + PathHelper.quotePathSegmentIfNeeded(segment);
      }

      if (pathsToProcess.has(path) && index < tokenizedPath.length - 1) {
        return memo;
      }

      if (!obj.has(segment)) {
        obj.set(segment, new Map());
      }

      obj = obj.get(segment);
    }

    return memo;
  }, new Map());

  return pathsToObj;
};


  /**
   * Exclude path from change set.
   * Given a change set, this function will filter it based on a series of paths.
   * The final ChangeSet will exclude the paths in question starting from the root of
   * the ChangeSet.
   * For Example,
   *   Given the following change set
   *      'insert': {
   *        'String': {
   *          'string1': 'hello',
   *          'string2': 'world
   *        }
   *      }
   *   And the path
   *     ['string1']
   *   the resulting ChangeSet will be
   *     'insert': {
   *       'String': {
   *         'string2': 'world'
   *       }
   *     }
   *
   * NOTE: Paths that traverse through sets and arrays are not supported.
   *
   * @param {property-changeset.SerializedChangeSet} in_changeSet - The changeset to parse
   * @param {Array<string>} in_paths - List of paths to exclude. Note: duplicate paths will be ignored
   * including ones that encompasse other paths
   * @throws if a path given resolves into an array or set
   * @return {property-changeset.SerializedChangeSet} - Filtered ChangeSet
   */
Utils.excludePathsFromChangeSet = function(in_changeSet, in_paths) {
  if (!in_changeSet || !in_paths || _.isEmpty(in_paths)) {
    return in_changeSet;
  }

  in_paths = _.isArray(in_paths) ? in_paths : [in_paths];
  // create an array of arrays splitting by .
  const tokenizedPaths = _.map(in_paths, function(path) {
    return PathHelper.tokenizePathString(path);
  });

  let rootChangeSet = deepCopy(in_changeSet);

  Utils.traverseChangeSetRecursively(rootChangeSet, {
    preCallback: (in_context) => {
      const shouldExclude = _.find(tokenizedPaths, (val) => { return _.isEqual(val, in_context.getParentStack()); });
      if (shouldExclude) {
        const operationType = in_context.getOperationType();
        const typeId = in_context.getTypeid();
        const lastSegment = in_context.getLastSegment();
        delete in_context.getParentNestedChangeSet()[operationType][typeId][lastSegment];
        in_context.stopTraversal();
      }
    }
  });

  return rootChangeSet;
};


/**
 * Extract all paths from the ChangeSet in a flattened list and include the operations and typeid information.
 * NOTE: The paths returned also include the parent. i.e. the path 'nodeProp.subproperty' will result in
 * {
 *   nodeProp: {
 *    operation: 'modify',
 *    typeid: { typeid: 'NodeProperty', context: 'single', isEnum: false }
 *   },
 *   nodeProp.subProperty: {
 *    operation: 'insert',
 *    typeid: { typeid: 'Float32', context: 'single', isEnum: false }
 *   }
 * }
 * @param {property-changeset.SerializedChangeSet} in_changeSet - The changeset to extract paths from
 * @param {object|undefined} [in_options] - Set of options
 * @param {boolean|undefined} [in_options.includeOperation] - Flag to include the operation
 * @param {boolean|undefined} [in_options.includeTypeidInfo] - Flag to include the typeid info
 * @return {object} - Flat list of paths
 */
Utils.extractPathsFromChangeSet = function(in_changeSet, in_options) {
  var paths = {};
  in_options = in_options || {};
  Utils.traverseChangeSetRecursively(in_changeSet, {preCallback: function(context) {
    var fullPath = context.getFullPath();
    paths[fullPath] = paths[fullPath] || {};
    if (in_options.includeOperation) {
      paths[fullPath].operation = context.getOperationType();
    }

    if (in_options.includeTypeidInfo) {
      paths[fullPath].typeidInfo = context.getSplitTypeID();
    }
  }});

  return paths;
};



module.exports = Utils;

/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Some internal utils functions
 */
import _ from 'underscore';
import { PropertyFactory } from '@fluid-experimental/property-properties';
import { PathHelper, TypeIdHelper, ArrayChangeSetIterator} from '@fluid-experimental/property-changeset';
import { ModificationContext } from './modification_context';
import { getOrInsertDefaultInNestedObjects } from '../external/utils/nested_object_helpers';
import { DataBinderHandle } from '../internal/data_binder_handle';
import { RESOLVE_NEVER, RESOLVE_ALWAYS } from '../internal/constants';

/**
 * Escapes a string so that it can safely be stored in a nested map, freeing the
 * __ namespace for use by the caller
 *
 * @param {string} in_string - The input string
 * @return {string} the escaped string
 *
 * @package
 * @hidden
 */
const escapeTokenizedStringForMap = function(in_string) {
  if (in_string[0] === '_' && in_string[1] === '_') {
    in_string = '_' + in_string;
  }
  return in_string;
};

/**
 * Escapes a path so that it can safely be stored in a nested map, freeing the
 * __ namespace for use by the caller
 *
 * @param {string|Array} in_path - A path (or path segment) to escape for storage in a nested map
 * @return {string|Array} the tokenized result
 *
 * @alias LYNX.AppFramework._Internal.Utils.escapeTokenizedPathForMap
 * @package
 * @hidden
 */
const escapeTokenizedPathForMap = function(in_path) {
  if (_.isArray(in_path)) {
    return _.map(in_path, escapeTokenizedStringForMap);
  } else {
    return escapeTokenizedStringForMap(in_path);
  }
};

/**
 * Unescapes a string that has been escaped by escapeTokenizedPathForMap
 *
 * @param {string} in_string - The input string
 * @return {string} the unescaped string
 *
 * @package
 * @hidden
 */
const unescapeTokenizedStringForMap = function(in_string) {
  if (in_string[0] === '_' &&
      in_string[1] === '_' &&
      in_string[2] === '_') {
    in_string = in_string.substr(1);
  }
  return in_string;

};

/**
 * Concatenates two paths.
 *
 * This function will join two paths and handles the cases where either in_path1 or in_path2 is empty or undefined.
 * It also handles the case when one of the two paths starts/ends with an array dereference. It currently
 * does not handle the case where in_path2 starts with '../' correctly.
 * TODO: This should be converted into a general utility function that also
 * handles these cases and be included in path_helper.js.
 *
 * @param {string|undefined} in_path1 - The first path
 * @param {string|undefined} in_path2 - The second path
 * @private
 * @hidden
 *
 * @return {string} The concatenated path
 */
const joinPaths = function(in_path1, in_path2) {
  if (!in_path1 && !in_path2) {
    return ''; // if both paths are empty/undefined, just return the empty string
  }
  if (!in_path1) {
    return in_path2;
  }
  if (!in_path2) {
    return in_path1;
  }

  var path2Array = in_path2[0] === '[';
  var path1Root = in_path1.length === 1 && in_path1[0] === '/';
  if (!path2Array && !path1Root) {
    return in_path1 + '.' + in_path2;
  } else {
    return in_path1 + in_path2;
  }
};

/**
 * Calculates whether the given callback handler should be called based on whether it points to a reference,
 * it is bound to reference changes and other factors.
 *
 * @param {Object}  in_invokeContext - The parameters block of the invoke
 * @param {Boolean} in_bindToReference - Indicates if the handlers is bound to a reference
 * @private
 * @hidden
 *
 * @return {Bool} True if the handler should be called, false otherwise
 */
const shouldHandlerBeCalled = function(in_invokeContext, in_bindToReference) {

  // If bindToReference is true, we only want to call the handler for the reference itself
  // otherwise only for the referenced object
  if (in_bindToReference) {
    // We want to bind to the reference property and not the referenced property
    // So if this is invoked for a reference and we are at the root of the
    // sub-tree, then this is not the reference property, but the referenced property
    return !in_invokeContext.calledForReference ||
      (in_invokeContext.tokenizedPath.length !== 0 && in_invokeContext.isReference);
  } else {
    return !in_invokeContext.isReference;
  }
};

/**
 * Initializes the contents of a ReferencePropertyTableNode object to default (empty) values.
 *
 * @param {Object} io_referencePropertyTableNode - the ReferencePropertyTableNode object to initialize
 * @private
 * @hidden
 */
const initializeReferencePropertyTableNode = function(io_referencePropertyTableNode) {
  io_referencePropertyTableNode.__registeredData = _.defaults(io_referencePropertyTableNode.__registeredData || {}, {
    handlers: [],
    sourceReferencePropertyInfo: []
  });
};

/**
 * @hidden
 */
const validOperations = [
  'insert', 'modify', 'remove',
  'referenceInsert', 'referenceModify', 'referenceRemove', 'referenceChanged',
  'collectionInsert', 'collectionModify', 'collectionRemove'
];

/**
 * @param {string} operation - Operation name to validate
 * @private
 * @hidden
 */
const assertOperation = function(operation) {
  console.assert(_.includes(validOperations, operation),
    '\'' + operation + '\' is an invalid operation');
};

/**
 * The core function that will call a list of handlers for the given operation.
 * Used deep-down by invokeCallbacks.
 *
 * @param {Object} in_invokeContext - the bag of important data of the initial invokeCallbacks code
 * @param {String} in_operationType - the current operation ; remove, insert, modify
 * @param {Array.<Object>} in_handlers - the handlers to call
 * @param {Array.<Number|String>} in_changeSetKeys - the keys of the items that have been modified
 * @param {Object} [in_changeSetObject] - for containers, an array/map of ChangeSets where the indices/keys
 *   are in in_changesetKeys
 * @param {Boolean} [in_bindToReference] - are we bound to the reference, or the referenced object?
 * @private
 * @hidden
 */
const _callCorrespondingHandlers = function(
  in_invokeContext,
  in_operationType,
  in_handlers,
  in_changeSetKeys,
  in_changeSetObject = undefined,
  in_bindToReference = false
) {
  const containerType = in_invokeContext.containerType;

  // if called for collection* callbacks, enable bindToReference implicitly
  in_bindToReference = in_bindToReference || in_invokeContext.isCollectionReference;

  for (let j = 0; j < in_handlers.length; j++) {
    if (shouldHandlerBeCalled(in_invokeContext, in_bindToReference)) {
      _.each(in_changeSetKeys, function(key, k) {
        const removeKey = (containerType === 'array') ? key + k : key;
        const nestedCollectionChangeSet = (in_operationType === 'remove') ?
          undefined : (containerType === 'array') ? in_changeSetObject[k] : in_changeSetObject[key];

        const escapedKey = _.isString(key) ? PathHelper.quotePathSegmentIfNeeded(key) : key;
        const path = in_invokeContext.tokenizedPath.concat([escapedKey]);
        const absPath = in_invokeContext.absolutePath !== '/' ?
          in_invokeContext.absolutePath + '[' + escapedKey + ']' :
          '/' + escapedKey;
        const modificationContext = new ModificationContext(
          nestedCollectionChangeSet,
          in_operationType,
          absPath,
          containerType,
          in_invokeContext.dataBinding,
          path,
          in_invokeContext.traversalContext.getUserData().retroactive
        );
        if (in_operationType === 'remove') {
          modificationContext._setRemovedDataBindingPath(in_invokeContext.dataBindingPath + '[' + removeKey + ']');
        }
        in_handlers[j].pathCallback.call(in_invokeContext.dataBinding, key, modificationContext);
      });
    }
  }
};

/**
 * Helper for converting an HFDM array changeset iterator to an array of explicit indices
 *
 * @param {Object} in_arrayIterator - the HFDM iterator
 * @return {Array.<Number>} the generated indices
 *
 * @private
 * @hidden
 */
const _generateIndices = function(in_arrayIterator) {
  return in_arrayIterator.operation[1].map(function(value, index) {
    return in_arrayIterator.operation[0] + index + in_arrayIterator.offset;
  });
};

/**
 * Used by invokeCallbacks for handling the array case
 *
 * @param {Object} in_invokeContext - the bag of important data of the initial invokeCallbacks code
 * @param {*} in_handlers - the handlers to consider for the array elements
 *
 * @private
 * @hidden
 */
const _invokeArrayCallbacks = function(in_invokeContext, in_handlers) {
  var arrayIterator = new ArrayChangeSetIterator(in_invokeContext.traversalContext.getNestedChangeSet());
  while (!arrayIterator.atEnd()) {
    if (ArrayChangeSetIterator.types.INSERT === arrayIterator.type && in_handlers.collectionInsert) {
      const indices = _generateIndices(arrayIterator);
      _callCorrespondingHandlers(
        in_invokeContext, 'insert', in_handlers.collectionInsert, indices, arrayIterator.operation[1]
      );
    }
    if (ArrayChangeSetIterator.types.MODIFY === arrayIterator.type && in_handlers.collectionModify) {
      const indices = _generateIndices(arrayIterator);
      _callCorrespondingHandlers(
        in_invokeContext, 'modify', in_handlers.collectionModify, indices, arrayIterator.operation[1]
      );
    }
    if (ArrayChangeSetIterator.types.REMOVE === arrayIterator.type && in_handlers.collectionRemove) {
      // TODO: This is only invoked when the entries are directly removed from the collection, not
      // TODO: if the collection itself is removed
      const indices = new Array(arrayIterator.operation[1]);
      indices.fill(arrayIterator.operation[0] + arrayIterator.offset);
      _callCorrespondingHandlers(in_invokeContext, 'remove', in_handlers.collectionRemove, indices);
    }
    arrayIterator.next();
  }
};

/**
 * Helper function for iterating over the changeset typeids, and recursively calling the callbacks for the
 * current operation.
 *
 * @param {Object} in_invokeContext - the bag of important data of the initial invokeCallbacks code
 * @param {String} in_currentOperationType - the current operation we are invoking for, insert etc.
 * @param {Array.<Object>} in_opHandlers - the handlers to consider for the changeset. These handlers are
 *   for a specific operation
 *
 * @private
 * @hidden
 */
const _iterateChangesetTypeids = function(in_invokeContext, in_currentOperationType, in_opHandlers) {
  const traversalContext = in_invokeContext.traversalContext;
  const nestedChangeSet = traversalContext.getNestedChangeSet();
  const isPrimitive = TypeIdHelper.isPrimitiveType(traversalContext.getSplitTypeID().typeid);
  const typeids = isPrimitive ?
    [traversalContext.getSplitTypeID().typeid] : _.keys(nestedChangeSet[in_currentOperationType]);

  for (let i = 0; i < typeids.length; i++) {
    const opChangeSet = nestedChangeSet[in_currentOperationType];
    var currentChangeSet = isPrimitive ? opChangeSet : opChangeSet[typeids[i]];

    _callCorrespondingHandlers(
      in_invokeContext, in_currentOperationType, in_opHandlers, _.keys(currentChangeSet), currentChangeSet
    );
  }
};

/**
 * Helper for handling the NodeProperty case for invokeCallbacks
 *
 * @param {Object} in_invokeContext - the bag of important data of the initial invokeCallbacks code
 * @param {*} in_handlers - the handlers to consider for the array elements
 *
 * @private
 * @hidden
 */
const _invokeNodePropertyCallbacks = function(in_invokeContext, in_handlers) {
  const nestedChangeSet = in_invokeContext.traversalContext.getNestedChangeSet();

  // When the container type is set to single, we must have a NodeProperty
  const oldContainerType = in_invokeContext.containerType;
  if (in_invokeContext.containerType === 'single') {
    in_invokeContext.containerType = 'NodeProperty';
  }

  // Maps and NodeProperties group the insertions by type
  if (nestedChangeSet.insert && in_handlers.collectionInsert) {
    _iterateChangesetTypeids(in_invokeContext, 'insert', in_handlers.collectionInsert);
  }
  if (nestedChangeSet.modify && in_handlers.collectionModify) {
    _iterateChangesetTypeids(in_invokeContext, 'modify', in_handlers.collectionModify);
  }
  if (nestedChangeSet.remove && in_handlers.collectionRemove) {
    const currentChangeSet = nestedChangeSet.remove.reduce(function(result, key) {
      result[key] = key;
      return result;
    }, {});
    _callCorrespondingHandlers(
      in_invokeContext, 'remove', in_handlers.collectionRemove, currentChangeSet
    );
  }

  in_invokeContext.containerType = oldContainerType;
};

/**
 * Helper for invokeCallbacks for handling the current property.
 *
 * @param {Object} in_invokeContext - the bag of important data of the initial invokeCallbacks code
 * @param {*} in_operationHandlers - the handlers for a specific operation
 * @param {Boolean} in_bindToReference - are we bound to the reference, or to the referenced object?
 *
 * @private
 * @hidden
 */
const _invokePropertyCallbacks = function(in_invokeContext, in_operationHandlers, in_bindToReference) {
  var operationType = in_invokeContext.traversalContext.getOperationType();

  // if called for collection* callbacks, enable bindToReference implicitly
  in_bindToReference = in_bindToReference || in_invokeContext.isCollectionReference;

  for (let j = 0; j < in_operationHandlers.length; j++) {
    if (shouldHandlerBeCalled(in_invokeContext, in_bindToReference)) {
      // TODO: this will produce a ModificationContext for remove operations too, but e.g. getDataBindings()
      // TODO: will not work on this context because those DataBindings are possibly already removed
      var nestedModificationContext = ModificationContext._fromContext(
        in_invokeContext.traversalContext,
        in_invokeContext.dataBinding,
        in_invokeContext.tokenizedFullPath.concat(in_invokeContext.tokenizedPath),
        in_bindToReference
      );
      // TODO: using a private variable here
      nestedModificationContext._path = in_invokeContext.absolutePath;
      if (operationType === 'remove') {
        // need to pass the "previous" path because that's used as key to the map of removed DataBindings
        nestedModificationContext._setRemovedDataBindingPath(in_invokeContext.dataBindingPath);
      }
      in_operationHandlers[j].pathCallback.call(in_invokeContext.dataBinding, nestedModificationContext);
    }
  }
};

/**
 * Invoke the callbacks.
 *
 * @param {DataBinding|undefined} in_dataBinding - the databinding for which we are invoking, if present
 * @param {ModificationContext} in_baseModificationContext - a context
 * @param {Boolean} in_calledForReference - is this called for a reference
 * @param {Array.<String>} in_tokenizedFullPath - tokenized path ... to where?
 * @param {Number} in_visitIndex - single-context callbacks will not be called if they've already been
 *  called in this visit.
 * @param {TraversalContext} in_traversalContext - the traversal context of the current changeset
 * @param {*} in_registeredHandlers - the handlers that are registered.
 * @param {Array.<String>} in_tokenizedPath - another tokenized path
 * @param {Boolean} in_isReference - is something a reference
 *
 * @package
 * @hidden
 */
const invokeCallbacks = function(
  in_dataBinding,
  in_baseModificationContext,
  in_calledForReference,
  in_tokenizedFullPath,
  in_visitIndex,
  in_traversalContext,
  in_registeredHandlers,
  in_tokenizedPath,
  in_isReference
) {
  const operationType = in_traversalContext.getOperationType();

  var baseAbsolutePath = in_baseModificationContext.getAbsolutePath();
  var baseDataBindingPath = in_baseModificationContext._getRemovedDataBindingPath();
  if (baseAbsolutePath[0] !== '/') {
    baseAbsolutePath = '/' + baseAbsolutePath;
  }

  // absolutePath is always at least '/'. dataBindingPath may be empty (we don't store the '/' there)
  // but that's a valid key into the removed DataBindings map and should be consistent with how the map is built.
  var absolutePath = joinPaths(baseAbsolutePath, in_traversalContext.getFullPostPath());
  var dataBindingPath = joinPaths(baseDataBindingPath, in_traversalContext.getFullPath());

  const splitTypeID = in_traversalContext.getSplitTypeID();
  const isCollectionReference = in_isReference && operationType !== 'remove' &&
    splitTypeID.context !== 'single';

  const invokeContext = {
    traversalContext: in_traversalContext,
    containerType: splitTypeID ? splitTypeID.context : undefined,
    dataBinding: in_dataBinding,
    tokenizedPath: in_tokenizedPath,
    calledForReference: in_calledForReference,
    tokenizedFullPath: in_tokenizedFullPath,
    absolutePath: absolutePath,
    dataBindingPath: dataBindingPath,
    isReference: in_isReference,
    isCollectionReference: isCollectionReference
  };

  // Check _calledForVisit: For a given traversal, we only want to call a given event-handler once
  if (in_registeredHandlers && in_registeredHandlers._calledForVisit !== in_visitIndex) {
    in_registeredHandlers._calledForVisit = in_visitIndex;

    if (in_isReference) {
      const referenceOperationType = 'reference' + operationType[0].toUpperCase() + operationType.substr(1);

      if (in_registeredHandlers[referenceOperationType]) {
        _invokePropertyCallbacks(invokeContext, in_registeredHandlers[referenceOperationType], true);
      }
    }

    if (in_registeredHandlers[operationType]) {
      _invokePropertyCallbacks(invokeContext, in_registeredHandlers[operationType], false);
    }

    // Invoke any collection callbacks, if present
    if (in_registeredHandlers.collectionInsert ||
      in_registeredHandlers.collectionModify ||
      in_registeredHandlers.collectionRemove) {
      if (invokeContext.containerType === 'array') {
        _invokeArrayCallbacks(invokeContext, in_registeredHandlers);
      } else {
        _invokeNodePropertyCallbacks(invokeContext, in_registeredHandlers);
      }
    }
  }
};

const isSubPath = function(a, b) {
  return b.indexOf(a) === 0 && ((b[a.length] === '.' || b[a.length] === '[') || a.length === b.length);
};

/**
 * Determine the minimal paths to the roots described by the given paths, removing redundant paths.
 * For example, given the paths /a.b.c, /a.b.c.d and /a.x, the minimal roots are /a.b.c and /a.x, because
 * /a.b.c.d is under the hierarchy of /a.b.c
 *
 * @param {Array.<String>} in_paths - the array of paths to minimize
 *
 * @return {Array.<String>} the minimal set of roots
 * @hidden
 */
const minimalRootPaths = function(in_paths) {
  const pathRoots = [];
  for (let j = 0; j < in_paths.length; j++) {
    const in_currPath = in_paths[j];
    let redundant = false;
    let i = 0;
    if (in_currPath === '/') {
      return [in_currPath];
    }
    while (i < pathRoots.length && !redundant) {
      if (isSubPath(pathRoots[i], in_currPath)) {
        // the current path is a subpath of an existing root; redundant
        redundant = true;
      } else if (isSubPath(in_currPath, pathRoots[i])) {
        // the old path is a subpath of this new path, the old path is redundant
        pathRoots.splice(i, 1);
      } else {
        // Independent
        ++i;
      }
    }
    if (!redundant) {
      pathRoots.push(in_currPath);
    }
  }
  return pathRoots;
};

/**
 * Recursively visit all HFDM properties and values, starting from in_rootProperty, calling in_callback on each item.
 * TODO: Add as a service to HFDM
 *
 * @param {PropertyElement} in_rootPropertyElement - the property from which to recurse from
 * @param {string} in_elementAbsolutePath - the path from the root workspace for this element
 * @param {DataBindingTree} in_dataBindingTreeRoot - the root node of the DataBindingTree
 * @param {function()}
 *        in_callback - function to call for each path. Recursion continues if the function returns true.
 *    function inputs in_property: BaseProperty, in_path: string, in_tokenizedPath: Array.<string>,
 *        in_treeNode: DataBindingTree
 *    function should return a boolean saying whether to continue recursing
 * @hidden
 */
const recursivelyVisitHierarchy = function(
  in_rootPropertyElement,
  in_elementAbsolutePath,
  in_dataBindingTreeRoot,
  in_callback) {
  const tokenizedPath = PathHelper.tokenizePathString(
    in_elementAbsolutePath[0] === '/' ? in_elementAbsolutePath.substr(1) : in_elementAbsolutePath
  );

  const _recursiveStep = function(in_propertyElement, in_path, in_tokenizedPath, in_dataBindingTreeNode) {
    const recurse = in_callback(in_propertyElement, in_path, in_tokenizedPath, in_dataBindingTreeNode);
    const typeId = in_propertyElement.getTypeId();

    if (recurse) {
      // We currently prevent recursing on the individual characters of a string.
      if (TypeIdHelper.isReferenceTypeId(typeId)) {
        // We have been asked to recurse, and we are at a reference. Try to resolve the reference.
        const targetElement = in_propertyElement.getDereference(RESOLVE_ALWAYS);
        if (targetElement.isValid()) {
          // We have to use the canonical path to the *referenced* property to get the correct data binding tree node.
          const referencedTokenizedPath = targetElement.getTokenizedPath();
          const targetTreeNode = in_dataBindingTreeRoot.getNodeForTokenizedPath(referencedTokenizedPath);
          // Note, the path does not change!
          _recursiveStep(targetElement, in_path, in_tokenizedPath, targetTreeNode);
        }
      } else if (typeId !== 'String') {
        const ids = in_propertyElement.getChildIds();
        if (ids) {
          _.each(ids, function(id) {
            const child = in_propertyElement.getChild(id, RESOLVE_NEVER);
            in_tokenizedPath.push(id);
            const oldDataBindingTreeNode = in_dataBindingTreeNode;
            if (in_dataBindingTreeNode) {
              in_dataBindingTreeNode = in_dataBindingTreeNode.getNodeForTokenizedPath([id]);
            }
            const subpath = (in_path === '/') ? '/' + id : in_path + '.' + id;
            _recursiveStep(child, subpath, in_tokenizedPath, in_dataBindingTreeNode);
            in_tokenizedPath.pop();
            in_dataBindingTreeNode = oldDataBindingTreeNode;
          });
        }
      }
    }
  };
  const dataBindingTreeNode = in_dataBindingTreeRoot.getNodeForTokenizedPath(tokenizedPath);
  _recursiveStep(in_rootPropertyElement, in_elementAbsolutePath, tokenizedPath, dataBindingTreeNode);
};

/**
 * Return whether the provided property is a primitive collection property
 * @param {BaseProperty} in_property - property to query
 *
 * @return {Boolean} true if it is a collection of primitive types.
 * @hidden
 */
const isPrimitiveCollection = function(in_property) {
  const context = in_property.getContext();
  // TODO: we need to check whether in_property is instanceof EnumArrayProperty (because the HFDM API is inconsistent)
  // but as EnumArrayProperty isn't exported from the HFDM SDK we check whether it inherits from the 'array' of 'Enum')
  return (context === 'array' || context === 'map' || context === 'set') &&
    (TypeIdHelper.isPrimitiveType(in_property.getTypeid()) || PropertyFactory.instanceOf(in_property, 'Enum', 'array'));
};

/**
 * Recursively visit all HFDM properties and values, starting from in_rootProperty, calling in_callback on each item.
 * TODO: Add as a service to HFDM
 *
 * @param {BaseProperty} in_rootProperty - the property from which to recurse from
 * @param {function()}
 *        in_callback - function to call for each path. Recursion continues if the function returns true.
 *    function inputs in_property: BaseProperty
 *    function should return a boolean saying whether to continue recursing
 *
 */
const forEachProperty = function(in_rootProperty, in_callback) {
  const _recursiveStep_forEachProperty = function(in_property) {
    const recurse = in_callback(in_property);

    if (recurse) {
      if (in_property.getIds && in_property.getTypeid() !== 'String' && !isPrimitiveCollection(in_property)) {
        const ids = in_property.getIds();
        for (let i = 0; i < ids.length; ++i) {
          const childProp = in_property.get(ids[i], RESOLVE_NEVER);
          _recursiveStep_forEachProperty(childProp);
        }
      }
    }
  };
  _recursiveStep_forEachProperty(in_rootProperty);
};

/**
 * Unregister all the path listeners. Should not be used; we have it for testing purposes.
 *
 * @param {Constructor} in_dataBindingConstructor - the constructor to unregister on
 *
 * @private
 * @hidden
 */
const unregisterAllOnPathListeners = function(in_dataBindingConstructor) {
  // Note, superclasses or derived classes may still have bindings!
  while (in_dataBindingConstructor.prototype._allPathHandles) {
    in_dataBindingConstructor.prototype._allPathHandles[0].destroy();
  }
};

/**
 * Get the template (either locally or remotely registered) of the given typeid
 * @param {string} in_typeid the typeid from which we want to get the template
 * @param {Workspace} [in_workspace] Workspace object that's passed to the getTemplate() function
 * @return {Object|undefined} the template (if exists)
 */
const getLocalOrRemoteSchema = (in_typeid, in_workspace) => {
  return TypeIdHelper.isReferenceTypeId(in_typeid) ? undefined :
    // if in_typeid is a remotely registered template
    (in_workspace ? in_workspace.getTemplate(in_typeid) : undefined) ||
    // or it's locally registered template/property
    PropertyFactory.getTemplate(in_typeid);
};

/**
 * Traverses the inheritance structure of a type, starting with the given type, towards the base
 * classes. If the callback returns false, the traversal stops.
 *
 * @param {string} in_typeID - the type to begin the recursion from
 * @param {function() :boolean} in_callback - called for every type found. Returning false will abort the traversal.
 * @param {Workspace} [workspace] - Workspace object that's passed to the getLocalOrRemoteSchema() function
 *
 * @return {Boolean} traversal succeeded without being aborted
 *
 * @private
 * @hidden
 */
const visitTypeHierarchy = function(in_typeID, in_callback, workspace) {
  let continueTraversal = in_callback(in_typeID);
  if (continueTraversal) {
    const schema = getLocalOrRemoteSchema(in_typeID, workspace);
    if (!schema) {
      var splitTypeID = TypeIdHelper.extractContext(in_typeID);
      // Arrays, maps etc., we stop ... for type purposes, this is considered the root
      if (splitTypeID.context === 'single') {
        console.warn('Could not visit type hierarchy for subtype', in_typeID);
      } else {
        continueTraversal = in_callback('BaseProperty');
      }
    } else {
      if (!schema.inherits) {
        continueTraversal = in_callback('BaseProperty');
      } else {
        if (Array.isArray(schema.inherits)) {
          for (let i = 0; i < schema.inherits.length && continueTraversal; ++i) {
            continueTraversal = visitTypeHierarchy(schema.inherits[i], in_callback, workspace);
          }
        } else if (typeof schema.inherits === 'string') {
          visitTypeHierarchy(schema.inherits, in_callback, workspace);
        } else {
          console.warn('Invalid inherits object');
        }
      }
    }
  }
  return continueTraversal;
};

/**
 * Take the given callback, and generate a new callback that will only allow itself to be called once
 * per changeset.
 *
 * @param {function()} in_callback - a databinder callback, i.e., a callback that expects 'this' to
 * inherit from DataBinding
 *
 * @return {function()} the wrapped callback
 *
 * @private
 * @hidden
 */
const makeCallbackOncePerChangeSet = function(in_callback) {
  // When the callback is called, the 'this' pointer will be the DataBinding
  // This will give us access to the DataBinder.

  // boundChangeSetId is captured and will be used to determine which ChangeSet we last fired an
  // event for.
  // We keep one entry per databinder --- there is the possibility that the changesetID for one databinder
  // collides with another fresh databinder.
  const boundChangeSetId = [];

  return function() {
    const changeSetId = this.getDataBinder().getCurrentChangeSetId();
    const dataBinderId = this.getDataBinder().getDataBinderId();

    if (boundChangeSetId[dataBinderId] !== changeSetId) {
      // We haven't been called for this ChangeSet yet; fire.
      boundChangeSetId[dataBinderId] = changeSetId;
      in_callback.apply(this, arguments);
    }
  };
};

/**
 * Defer the provided callback until the next changeset post processing
 *
 * @param {function} in_callback - the function to defer
 * @return {function} the deferred function
 *
 * @private
 * @hidden
 */
const deferCallback = function(in_callback) {
  return function() {
    if (arguments.length > 1) {
      var clonedContext = arguments[1] ? arguments[1]._clone() : undefined;
      var index = arguments[0];
      this.getDataBinder().requestChangesetPostProcessing(function() {
        in_callback.apply(this, [index, clonedContext]);
      }, this);
    } else {
      var clonedContext = arguments[0] ? arguments[0]._clone() : undefined;
      this.getDataBinder().requestChangesetPostProcessing(function() {
        in_callback.apply(this, [clonedContext]);
      }, this);
    }
  };
};

/**
 * Check to see if the given constructor is already registered with one DataBinder. It is used
 * to ensure that relative callbacks are not installed after it has been added to the DataBinder.
 * Note; if in_bindingConstructor inherits from another class, which is registered, this function
 * still returns false.
 *
 * @param {function()} in_bindingConstructor - the constructor to validate.
 * @return {Boolean} true if it is already registered.
 *
 * TODO: Move the _mark and _unmark functions from data_binder.js . Currently cannot easily do this
 * since the data_binder.js is using DataBinding and this file is a base class (and the function
 * needs to work with the constructor prototype, not an instance)
 *
 * @hidden
 */
const isDataBindingRegistered = function(in_bindingConstructor) {
  return in_bindingConstructor.prototype.hasOwnProperty('__numDataBinders') &&
    in_bindingConstructor.prototype.__numDataBinders > 0;
};

/**
 * Install the '_forEachPrototypeMember' callback function on the given constructor if it does not already exist.
 * Calling this function on an object of this type will call in_callback on the property in_propertyName for each
 * class along the prototype chain of in_dataBindingConstructor, skipping classes where it is not defined.
 *
 * @private
 * @hidden
 *
 * @param {Object} in_dataBindingConstructor - the constructor to extend
 */
const installForEachPrototypeMember = function(in_dataBindingConstructor) {
  if (!in_dataBindingConstructor.prototype.hasOwnProperty('_forEachPrototypeMember')) {
    in_dataBindingConstructor.prototype._forEachPrototypeMember = function(in_propertyName, in_callback) {
      if (in_dataBindingConstructor.prototype.hasOwnProperty(in_propertyName)) {
        in_callback(in_dataBindingConstructor.prototype[in_propertyName]);
      }
      const superprototype = Object.getPrototypeOf(in_dataBindingConstructor.prototype);
      // Note, if the direct ancestor of a derived class doesn't have a foreach, this will go
      // up to the next one in the hierarchy that does have it defined.
      if (superprototype && superprototype._forEachPrototypeMember) {
        superprototype._forEachPrototypeMember.call(this, in_propertyName, in_callback);
      }
    };
  }
};

/**
 * Checks the prototype of the given constructor if it already has a member of this name, and creates it
 * with in_default if it does not.
 *
 * @private
 * @hidden
 *
 * @param {DataBinding} in_dataBindingConstructor - constructor object for the data binding class
 * @param {string} in_propertyName - inherit/create this property in the prototype
 * @param {Object} in_default - what to instantiate if the member does not already exist
 * @return {Object} the value, which may be in_default on the first creation
 */
const getOrCreateMemberOnPrototype = function(in_dataBindingConstructor, in_propertyName, in_default) {
  // If there is already a registeredPaths map, we just return it
  if (in_dataBindingConstructor.prototype.hasOwnProperty(in_propertyName)) {
    return in_dataBindingConstructor.prototype[in_propertyName];
  } else {
    in_dataBindingConstructor.prototype[in_propertyName] = in_default;
    return in_default;
  }
};

/**
 * Get the handler list (or create one) for the given operation, on the given path.
 *
 * @private
 * @hidden
 *
 * @param {Object} in_dataBindingConstructor - the constructor from which to get the handler list
 * @param {string} in_escapedPath - the path to look on
 * @param {string} in_memberName - which table to look in, e.g., registeredPaths ....
 * @param {string} in_operation - which operation to search for : insert, remove, modify
 *
 * @return {Array.<Object>} the handler list
 */
const _getHandlerList = function(in_dataBindingConstructor, in_escapedPath, in_memberName, in_operation) {
  const registeredPaths = getOrCreateMemberOnPrototype(in_dataBindingConstructor, in_memberName, {});
  const pathNode = getOrInsertDefaultInNestedObjects.apply(this, [registeredPaths].concat(in_escapedPath).concat([{}]));

  pathNode.__registeredDataBindingHandlers = pathNode.__registeredDataBindingHandlers || {};

  // Get the handlers for this operation.
  const handlerList = pathNode.__registeredDataBindingHandlers[in_operation] || [];
  pathNode.__registeredDataBindingHandlers[in_operation] = handlerList;

  return handlerList;
};

/**
 * Removes all path listeners from the data binding
 *
 * @param {DataBinding} in_dataBindingConstructor -
 *     constructor object for the data binding class
 * @package
 * @hidden
 */
const _cleanupPathListeners = function(in_dataBindingConstructor) {
  delete in_dataBindingConstructor.prototype._allPathHandles;
  delete in_dataBindingConstructor.prototype._registeredPaths;
  delete in_dataBindingConstructor.prototype._forEachPrototypeMember;
};

/**
 *
 * @param {*} in_handle -
 * @param {*} in_details -
 * @param {*} in_operation -
 *
 * @private
 * @hidden
 */
const _unregisterOperation = function(in_handle, in_details, in_operation) {
  for (let i = 0; i < in_details.paths.length; ++i) {
    const handlerList = _getHandlerList(
      in_details.bindingConstructor, in_details.paths[i], '_registeredPaths', in_operation
    );
    const myIndex = _.findIndex(handlerList, handler => handler.registrationId === in_details.registrationId);
    if (myIndex === -1) {
      throw new Error('Unregistering an operation twice/operation not registered');
    }
    handlerList.splice(myIndex, 1);
  }
};

/**
 * @private
 * @hidden
 *
 * @param {*} in_handle -
 * @param {*} in_details -
 */
const _unregisterPathHandle = function(in_handle, in_details) {
  _.each(in_details.operations.slice(), operation => _unregisterOperation(in_handle, in_details, operation));

  const allPathHandles = getOrCreateMemberOnPrototype(in_details.bindingConstructor, '_allPathHandles', []);
  allPathHandles.splice(allPathHandles.indexOf(in_handle), 1);
  if (allPathHandles.length === 0) {
    _cleanupPathListeners(in_details.bindingConstructor);
  }
};

/**
 * Static function Generate an index unique to this databinder.
 *
 * @return {Number} the unique id
 *
 * @private
 * @hidden
 */
const _generateRegistrationId = (function() {
  // Global counter for uniquely marking registrations.
  let _registrationId = 0;
  return function() {
    return ++_registrationId;
  };
})();

/**
 * Create a handle representing a registered path
 *
 * @private
 * @hidden
 *
 * @param {Object} in_constructor - the constructor for which we want to have a handle
 * @param {Array.<string>} in_escapedPaths - the paths we are registering for
 * @param {Array.<string>} in_operations - the operations for which we are registering
 * @param {function} in_function - the callback to call
 *
 * @return {DataBinderHandle} the created handle
 */
const createHandle = function(in_constructor, in_escapedPaths, in_operations, in_function) {
  const details = {
    paths: in_escapedPaths,
    bindingConstructor: in_constructor,
    operations: in_operations.slice(),
    pathCallback: in_function,
    registrationId: _generateRegistrationId()
  };

  const resultHandle = new DataBinderHandle(_unregisterPathHandle, details);

  // Insert the handle into the appropriate list. NOTE, this means the same handle will be in multiple lists
  for (var i = 0; i < in_operations.length; ++i) {
    const operation = in_operations[i];
    assertOperation(operation);

    // If we have a single escaped path, we simply call the function for each event. If we have multiple escaped
    // paths, we want to ensure that a given operation will only fire once no matter how many of the escaped paths
    // are affected.
    const callback = in_escapedPaths.length === 1 ? in_function : makeCallbackOncePerChangeSet(in_function);
    for (var j = 0; j < in_escapedPaths.length; ++j) {
      const handlerList = _getHandlerList(in_constructor, in_escapedPaths[j], '_registeredPaths', operation);
      handlerList.push({
        registrationId: details.registrationId,
        pathCallback: callback
      });
    }
  }

  return resultHandle;
};

/**
 * Returns whether the context would have a valid Property associated with it.
 *
 * @param {BaseContext} in_context - the context
 * @return {boolean} - true iff the context has a valid Property associated with it.
 * @private
 * @hidden
 */
const _hasValidPropertyFromContext = function(in_context) {
  return (in_context instanceof ModificationContext && in_context.getOperationType() !== 'remove');
};

/**
 * Callback handler that is used by registerOnProperty to call the user supplied callback with the property as
 * parameter.
 *
 * @param {Function} in_callback       - The callback to invoke with the property
 * @param {Boolean} in_requireProperty - If true, the callback will only be called with an existing property
 * @param {ModificationContext} in_modificationContext - The modification context
 * @private
 * @hidden
 */
const invokeWithProperty = function(in_callback, in_requireProperty, in_modificationContext) {
  if (_hasValidPropertyFromContext(in_modificationContext)) {
    var property = in_modificationContext.getProperty();
    in_callback.call(this, property);
  } else if (!in_requireProperty) {
    in_callback.call(this, undefined);
  }
};

/**
 * Callback handler that is used by registerOnProperty to call the user supplied callback with the property as
 * parameter.
 *
 * @param {Function} in_callback       - The callback to invoke with the property
 * @param {Boolean} in_requireProperty - If true, the callback will only be called with an existing property
 * @param {string|Number} in_key       - Key of the property in the collection being modified
 * @param {ModificationContext} in_modificationContext - The modification context
 * @private
 * @hidden
 */
const invokeWithCollectionProperty = function(in_callback, in_requireProperty, in_key, in_modificationContext) {
  if (_hasValidPropertyFromContext(in_modificationContext)) {
    var property = in_modificationContext.getProperty();
    in_callback.call(this, in_key, property);
  } else if (!in_requireProperty) {
    in_callback.call(this, in_key, undefined);
  }
};

/**
 * @param {string} in_registrationType Registration method's name from the DataBinding prototype.
 * @param {Array} in_callbackArgs The registered callback arguments.
 * @return {function} A function that calls the callback registration on a given DataBinding prototype.
 * @private
 * @hidden
 */
const createRegistrationFunction = function(in_registrationType, in_callbackArgs) {
  const path = in_callbackArgs[0];
  const events = in_callbackArgs[1];
  const options = in_callbackArgs[2];

  return function(target, property, descriptor) {
    const callback = descriptor.value;
    const args = [path, events, callback, options];
    target.constructor[in_registrationType](...args);
  };
};

export {
  escapeTokenizedPathForMap,
  unescapeTokenizedStringForMap,
  joinPaths,
  initializeReferencePropertyTableNode,
  validOperations,
  assertOperation,
  invokeCallbacks,
  minimalRootPaths,
  recursivelyVisitHierarchy,
  forEachProperty,
  unregisterAllOnPathListeners,
  isPrimitiveCollection,
  visitTypeHierarchy,
  makeCallbackOncePerChangeSet,
  deferCallback,
  isDataBindingRegistered,
  installForEachPrototypeMember,
  getOrCreateMemberOnPrototype,
  createHandle,
  invokeWithProperty,
  invokeWithCollectionProperty,
  createRegistrationFunction,
  getLocalOrRemoteSchema
};

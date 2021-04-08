/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview
 *
 * A few helper functions to make sure that an entry exists/gets deleted in a nested hierarchy of JS objects
 */
import _ from 'underscore';

/**
 * Inserts an object into a nested Object hierarchy. If an entry already exists, it will be overwritten.
 *
 * @param  {Object}     in_object   - The object in which we search for the entry
 * @param  {...number}  in_path     - The path within the hierarchy
 * @param  {*}          in_newEntry - The new entry to insert
 *
 * @return {boolean} Has there already been an entry?
 * @alias insertInNestedObjects
 * @package
 * @hidden
 */
var insertInNestedObjects = function (in_object) {
  var currentObject = in_object;

  // Insert all intermediate steps as needed
  for (var j = 1; j < arguments.length - 2; j++) {
    // Make sure the entry exits
    currentObject[arguments[j]] = currentObject[arguments[j]] || {};

    currentObject = currentObject[arguments[j]];
  }

  // Insert the new entry
  var result = currentObject[arguments[arguments.length - 2]] !== undefined;

  currentObject[arguments[arguments.length - 2]] = arguments[arguments.length - 1];

  return result;
};

/**
 * Checks, whether an entry exists under the given path in a nested Object hierarchy
 *
 * @param  {Object}     in_object  - The object in which we search for the entry
 * @param  {...number}  in_path    - The path within the hierarchy
 *
 * @return {boolean} Did an entry exist under the given path in a hierarchy
 * @alias existsInNestedObjects
 * @package
 * @hidden
 */
var existsInNestedObjects = function (in_object) {
  var currentObject = in_object;

  // traverse all intermediate steps as needed
  for (var j = 1; j < arguments.length; j++) {
    currentObject = currentObject[arguments[j]];

    if (currentObject === undefined) {
      return false;
    }
  }

  return true;
};

/**
 * Returns an entry from a nested hierarchy of objects
 *
 * @param  {Object}     in_object  - The object in which we search for the entry
 * @param  {...number}  path       - The path within the hierarchy
 *
 * @return {Object|undefined} The entry at the given path in a hierarchy, or undefined if none
 * @alias getInNestedObjects
 * @package
 * @hidden
 */
var getInNestedObjects = function (in_object) {
  var currentObject = in_object;

  // traverse all intermediate steps as needed
  for (var j = 1; j < arguments.length; j++) {
    currentObject = currentObject[arguments[j]];

    if (currentObject === undefined) {
      return undefined;
    }
  }

  return currentObject;
};

/**
 * Returns an entry from a nested hierarchy of objects. If it does not yet exist, the given default value is inserted.
 *
 * @param {Object}     in_object  - The object in which we search for the entry
 * @param {...number}  in_path     - The path within the hierarchy
 * @param {*}          in_default - The default value to insert into the object, if no entry is found
 *
 * @return {boolean} Did an entry exist under the given path in a hierarchy
 * @alias getInNestedObjects
 * @package
 * @hidden
 */
var getOrInsertDefaultInNestedObjects = function (in_object) {
  var currentObject = in_object;

  // traverse all intermediate steps as needed
  for (var j = 1; j < arguments.length - 1; j++) {
    var nextObject = currentObject[arguments[j]];

    if (nextObject === undefined) {
      insertInNestedObjects.apply(this, [currentObject].concat(Array.from(arguments).slice(j)));
      return arguments[arguments.length - 1];
    } else {
      currentObject = nextObject;
    }
  }

  return currentObject;
};

/**
 * Deletes an entry from a nested hierarchy of objects.
 * It will also delete all no longer needed levels of the hierarchy above the deleted entry
 *
 * @param {Object}     in_object  - The object in which we search for the entry
 * @param {...number}  in_path    - The path within the hierarchy
 * @alias deleteInNestedObjects
 * @package
 * @hidden
 */
var deleteInNestedObjects = function (in_object) {
  var currentObject = in_object;

  // traverse all intermediate steps as needed
  var objectList = [];
  for (var j = 1; j < arguments.length - 1; j++) {
    objectList.push(currentObject);
    currentObject = currentObject[arguments[j]];

    if (currentObject === undefined) {
      break;
    }
  }

  // Delete the entry
  if (currentObject) {
    delete currentObject[arguments[arguments.length - 1]];
    objectList.push(currentObject);
  }
  // Go backwards and remove no longer needed entries
  for (var j = objectList.length - 1; j > 0; j--) {
    if (_.isEmpty(objectList[j])) {
      delete objectList[j - 1][arguments[j]];
    }
  }
};

/**
 * Traverses a hierarchy of nested objects and invokes the callback function for each entry
 *
 *
 * @param {Object}   in_object                - The nested object hierarchy to traverse
 * @param {Number}   in_levels                - The number of levels to descend in the hierarchy
 * @param {Boolean}  in_invokeForHigherLevels - If this is set to true, the callback will also be invoked in
 *                                              cases where there were not in_levels many levels present in the
 *                                              hierarchy.
 * @param {function} in_callback              - Callback that will be invoked with the keys of all nested levels as
 *                                              parameters, followed by the value at that level. If not all levels
 *                                              were existent in the hierarchy, it will be passed undefined parameters
 *                                              to fill up to in_levels keys.
 * @alias traverseNestedObjects
 * @package
 * @hidden
 */
var traverseNestedObjects = function (in_object, in_levels, in_invokeForHigherLevels, in_callback) {
  // We use a stack based traversal to avoid too many recursions
  var argumentStack = [];
  var objectStack = [in_object];
  var keyStack = [_.keys(in_object)];
  var currentObject = in_object;
  var currentKeys = keyStack[0];
  var level = 1;

  while (currentObject !== undefined) {
    // Do we still have keys in the currently processed object?
    if (!_.isEmpty(currentKeys)) {
      // Get the next key from the stack
      var nextKey = currentKeys.pop();
      var nextObject = currentObject[nextKey];
      argumentStack.push(nextKey);

      // If the object stored under that key is either not an object, or we have reached the maximum recursion
      // depth, we will invoke the callback
      if (!_.isObject(nextObject) ||
        level === in_levels) {
        // Store the stack length, to restore the stack later
        var stackLength = argumentStack.length;

        // Only invoke the callback, if we either reached the requested recursion depth, or calling was allowed
        // for higher levels
        if (in_invokeForHigherLevels ||
          level === in_levels) {
          // Put additional undefined entries on the arguments list if necessary
          for (var i = argumentStack.length; i < in_levels; i++) {
            argumentStack[i] = undefined;
          }

          // Push the actual content as last entry on the list of arguments
          argumentStack.push(nextObject);

          // Invoke the callback
          in_callback.apply(this, argumentStack);
        }

        // Restore the arguments stack to its length before invoking the callback
        argumentStack.length = stackLength - 1;
      } else {
        // We have an object and are not at the requested recursion depth. In that case
        // we continue the traversal at the next level, by pushing the corresponding object
        // onto the processing stack
        objectStack.push(nextObject);
        currentKeys = _.keys(nextObject);
        keyStack.push(currentKeys);
        currentObject = nextObject;
        level++;
      }
    } else {
      // We have finished processing the object at the current tip of the stack, so we remove it
      argumentStack.pop();
      objectStack.pop();
      keyStack.pop();

      if (!_.isEmpty(objectStack)) {
        // If there are still objects on the stack, we continue with those
        currentObject = objectStack[objectStack.length - 1];
        currentKeys = keyStack[keyStack.length - 1];
        level--;
      } else {
        // Otherwise, we have to stop the traversal
        break;
      }
    }
  }
};

export {
  insertInNestedObjects,
  existsInNestedObjects,
  getInNestedObjects,
  getOrInsertDefaultInNestedObjects,
  deleteInNestedObjects,
  traverseNestedObjects
};

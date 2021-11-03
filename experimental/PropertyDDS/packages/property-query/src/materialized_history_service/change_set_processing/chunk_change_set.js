/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Helper function the divides a changeSet into chunks
 */
(function() {
  const _ = require('lodash'),
      ChangeSet = require('@fluid-experimental/property-changeset').ChangeSet,
      TypeIdHelper = require('@fluid-experimental/property-changeset').TypeIdHelper,
      PathHelper = require('@fluid-experimental/property-changeset').PathHelper;

  // Constants that indicates the type of a key in a property
  const STATIC_PROPERTY = { entry: undefined };         // Static member of a template
  const INSERT_PROPERTY = { entry: 'insert' };          // Insert operation
  const MODIFY_PROPERTY = { entry: 'modify' };          // Modify operation
  const REMOVE_PROPERTY = { entry: 'remove' };          // Delete in a non-reversible ChangeSet
  const REMOVE_REVERSIBLE_PROPERTY = {entry: 'remove'}; // Delete in a reversible ChangeSet

  // This constant indicates that the chunk size limit has been reached and a new chunk has to be
  // started
  const CHUNK_SIZE_EXCEEDED = {};

  /**
   * Information about a single key that has been extracted from a changeset
   * @typedef {Object} HFDM.MaterializedHistoryService.ChangeSetProcessing.chunkChangeSet~KeyInfo
   * @property {String} key       - The name of the key
   * @property {String} typeid    - typeid,
   * @property {Object} operation - The type/context of the operation. Should be one of the constants defined above.
   * @property {*} data           - The data stored under the key
   */

  /**
   * Contains the current state of the changeset traversal
   * @typedef {Object} HFDM.MaterializedHistoryService.ChangeSetProcessing.chunkChangeSet~TraversalState
   * @property {Array}  stack              - The traversal stack
   * @property {Array}  chunks             - The alread extracted chunks
   * @property {String} startPath     - Path at which the current chunks has started
   * @property {Number} currentChunkLength - The length the current chunk would have if serialized to JSON
   * @property {HFDM.Property.SerializedChangeset} currentChunk -
   *                                         The partial changeset of the current chunk
   */

  /**
    * Contains a chunk of a changeset
    *
    * @typedef {HFDM.MaterializedHistoryService.ChangeSetProcessing.ChangeSetChunk}
    * @property {Number}                            size        - The size of this chunk in bytes (this value is
    *                                                             only correct if a maximum chunk size has been
    *                                                             given during the chunking, otherwise it is not
    *                                                             computed)
    * @property {HFDM.Property.SerializedChangeset} changeSet   - The changeset for this chunk
    * @property {String|undefined}                  startPath   - The path of the first leaf property in the chunk.
    *                                                             This can be undefined, if this is the first chunk
    *                                                             to indicate that all properties coming before this
    *                                                             property should also be included in this chunk.
    */

  /**
   * We use an escaping rule where \1 is escaped
   * with \1\1 and \0 is converted to \1. This
   * way we can use \0 as record separator
   *
   * @param {String} in_key The key to escape
   * @return {String} The escaped key
   */
  const _escapeKeyForSorting = function(in_key) {
    if (in_key.match(/\x00|\x01/)) {
      in_key = in_key.replace(/\x01/g, '\x01\x01');
      in_key = in_key.replace(/\x00/g, '\x01\x00');
    }

    return in_key;
  };

  /**
   * Extract all keys that are modified by this changeSet
   * @param {HFDM.Property.SerializedChangeset} in_changeSet - Changeset for which to extract keys
   * @param {Function} in_sortKeyEncoder - Function that encodes a key for sorting
   * @param {Number} in_stackDepth - Depth of the stack
   * @return {Array.<HFDM.MaterializedHistoryService.ChangeSetProcessing.chunkChangeSet~KeyInfo>} -
   *     An array with the extracted keys
   */
  const _extractKeys = function(in_changeSet, in_sortKeyEncoder, in_stackDepth) {
    let result = [];

    // Iterates over the typeids and extracts all keys in the
    // changeset
    const processTypeIds = function(in_type, in_changeSet2) {
      let typeIds = _.keys(in_changeSet2);
      for (let i = 0; i < typeIds.length; i++) {
        let typeid = typeIds[i];

        // The reserved keywords are ignored
        if (ChangeSet.isReservedKeyword(typeid)) {
          continue;
        }

        // Extract all keys for this typeid
        let keys = _.keys(in_changeSet2[typeid]);
        for (let j = 0; j < keys.length; j++) {
          // and add them to the results object
          result.push({
            key: keys[j],
            sortKey: in_sortKeyEncoder(keys[j], in_stackDepth),
            typeid: typeid,
            operation: in_type,
            data: in_changeSet2[typeid][keys[j]]
          });
        }
      }
    };

    processTypeIds(STATIC_PROPERTY, in_changeSet);
    if (in_changeSet.insert) {
      processTypeIds(INSERT_PROPERTY, in_changeSet.insert);
    }
    if (in_changeSet.modify) {
      processTypeIds(MODIFY_PROPERTY, in_changeSet.modify);
    }
    if (in_changeSet.remove) {
      if (_.isArray(in_changeSet.remove)) {
        for (let k = 0; k < in_changeSet.remove.length; k++) {
          result.push({
            key: in_changeSet.remove[k],
            sortKey: in_sortKeyEncoder(in_changeSet.remove[k], in_stackDepth),
            typeid: undefined, // We don't have typeids for deletes
            operation: REMOVE_PROPERTY
          });
        }
      } else {
        processTypeIds(REMOVE_REVERSIBLE_PROPERTY, in_changeSet.remove);
      }
    }

    // Now sort the keys alphabetically
    result.sort((a, b) => a.sortKey === b.sortKey ? 0 : a.sortKey > b.sortKey ? 1 : -1);

    return result;
  };

  /**
   * Revert the escaping done by _escapeKeyForSorting
   *
   * @param {String} in_key - The key to escape
   * @return {String} The unescaped key
   */
  const _unescapeKeyForSorting = function(in_key) {
    if (in_key.match(/\x00|\x01/)) {
      in_key = in_key.replace(/\x01\x00/g, '\x00');
      in_key = in_key.replace(/\x01\x01/g, '\x01');
    }

    return PathHelper.quotePathSegmentIfNeeded(in_key);
  };

  /**
   * Converts a path to the internal format that is used to encode the boundary strings
   * @param {String} in_path The input path
   *
   * @return {String} The converted path
   */
  let convertPathToChunkBoundaryFormat = function(in_path) {
    let tokenizedPath = PathHelper.tokenizePathString(in_path);
    return tokenizedPath.map(_escapeKeyForSorting).join('\x00') + '\x00';
  };

  /**
   * Converts a path from the internal format to a dot separated path (no square brackets are used)
   * @param {String} in_chunkBoundaryPath The input path in the internal format
   *
   * @return {String} The converted path
   */
  let getPathFromChunkBoundaryFormat = function(in_chunkBoundaryPath) {
    let splittedPath = [];
    let lastSplit = 0;

    let precedingEscapeChars = 0;
    for (let i = 0; i < in_chunkBoundaryPath.length; i++) {
      if (in_chunkBoundaryPath[i] === '\x01') {
        precedingEscapeChars++;
      }
      if (in_chunkBoundaryPath[i] === '\x00') {
        if (precedingEscapeChars % 2 === 0) {
          splittedPath.push(in_chunkBoundaryPath.slice(lastSplit, i));
          i++;
          lastSplit = i;
        }
      }
      if (in_chunkBoundaryPath[i] !== '\x01') {
        precedingEscapeChars = 0;
      }
    }

    return splittedPath.map(_unescapeKeyForSorting).join('.');
  };

  /**
   * Determines whether the properties belonging to this typeid are leafs and
   * cannot be further chunked.
   *
   * TODO: We currently don't chunk arrays and primitive type collections.
   *
   * @param {String} in_typeid - The typeid of the property
   * @param {*} in_data - Data for a context
   * @return {Boolean} - Whether the properties are leaves
   */
  let _isLeaf = function(in_typeid, in_data) {
    let context = TypeIdHelper.extractContext(in_typeid);

    // We currently treat array always as leafs
    if (context.context === 'array') {
      return true;
    }

    // We are also treating primitive maps as leafs for now
    if (context.context === 'map' && TypeIdHelper.isPrimitiveType(context.typeid)) {
      return true;
    }

    // We can split all template types and node properties
    // This includes cases where those are stored in a set
    // or map. We don't split primitive type collections
    // at the moment
    if (TypeIdHelper.isTemplateTypeid(context.typeid)) {
      return _.isObject(in_data) && _.isEmpty(in_data) ||
        context.isEnum || // Enum
        TypeIdHelper.isPrimitiveType(context.typeid); // Reference
    } else {
      return context.typeid !== 'NamedNodeProperty' &&
        context.typeid !== 'NodeProperty' &&
        context.context !== 'map' &&
        context.context !== 'set';
    }
  };

  /**
   * Determines the serialized length for the supplied value
   * @param {*} in_value - The value to serialize
   * @return {Number} The length of the serialization
   */
  let _len = function(in_value) {
    return JSON.stringify(in_value).length;
  };

  /**
   * Determines the size by which an object will grow if the supplied combination of key and value
   * are added to the object.
   *
   * @param {Object} in_object       - The object to which the key should be added
   * @param {String} in_key          - The key to add
   * @param {*} in_value             - The value to add
   * @param {Boolean} in_isEmpty     - Has the object been empty prior to the insertion of the key?
   *                                   We need to manually track this, because isEmpty checks are
   *                                   very expensive in JS *sigh*
   * @param {Number} [in_knownSize]  - The size of in_value (if it is alreaedy known, otherwise, it will
   *                                   be determined)
   * @return {Number}                - Calculated size
   */
  let estimateSizeForInsertionInObject = function(in_object, in_key, in_value, in_isEmpty, in_knownSize) {
    if (in_object[in_key] !== undefined) {
      return 0;
    }

    let size = 0;
    if (!in_isEmpty) {
      size += 1;
    }

    let valueSize = in_knownSize !== undefined ? in_knownSize : _len(in_value);
    size += _len(in_key) + 1 + valueSize;
    return size;
  };

  /**
   * Returns the path for the entry with the name in_key in the currently processed collection of the state
   *
   * @param {String} in_path - The current path of the traversal
   * @param {Object} in_key  - The key for the subpath
   * @return {String} The path to the sub entry
   */
  let _joinKeyWithPath = function(in_path, in_key) {
    return in_path + in_key.sortKey + '\x00';
  };

  /**
   * Adds one property under the given key to the changeset in the current chunk
   *
   * @param {HFDM.MaterializedHistoryService.ChangeSetProcessing.chunkChangeSet~TraversalState} in_traversalState -
   *     The current state of the traversal
   * @param {HFDM.MaterializedHistoryService.ChangeSetProcessing.chunkChangeSet~KeyInfo} in_key -
   *     Information about one key in the original changeset
   * @param {Boolean} in_initialize -
   *     If enabled, this function will create an empty property, instead of taking the
   *     contents of the property in the original changeset
   * @param {Boolean} in_forceInsertion -
   *     Enforce the insertion, even if the resulting chunk is larger than the limit
   * @param {Number} [in_stackIndex] -
   *     Current position in the stack. If not supplied the last entry of the stack will be used.
   *
   * @return {*} The inserted sub-changset
   */
  let _addPropertyToChunk = function(in_traversalState, in_key, in_initialize, in_forceInsertion, in_stackIndex) {
    let stackIndex = in_stackIndex === undefined ? in_traversalState.stack.length - 1 : in_stackIndex;
    let state = in_traversalState.stack[stackIndex];
    let chunkCS = state.chunkCS;
    let chunkCSIsEmpty = state.chunkCSIsEmpty;

    if (in_key.operation === REMOVE_PROPERTY) {
      // Compute the size this insertion into the chunk would add to the serialization
      let insertSize = 0;
      if (in_traversalState.maxChunkSize !== Infinity) {
        insertSize += estimateSizeForInsertionInObject(chunkCS, 'remove', [], chunkCSIsEmpty, 2);
        insertSize += _len(in_key.key);
        if (chunkCS.remove && chunkCS.remove.length > 0) {
          insertSize += 1; // For the ,
        }

        // Stop processing, if adding this key would make the chunk too big
        if (!in_forceInsertion &&
            in_traversalState.currentChunk.size + insertSize > in_traversalState.maxChunkSize) {
          return CHUNK_SIZE_EXCEEDED;
        }
      }
      state.chunkCSIsEmpty = false;

      in_traversalState.currentChunk.size += insertSize;

      // Add the key to the array of keys to remove
      if (chunkCS.remove === undefined) {
        chunkCS.remove = [];
      }
      chunkCS.remove.push(in_key.key);

      // Reset the firstModifyWithoutContent flag, since we now have content
      in_traversalState.firstModifyWithoutContent = undefined;

      return undefined;
    } else {
      // Compute the size this insertion into the chunk would add to the serialization
      if (in_traversalState.maxChunkSize !== Infinity) {
        let insertSize = 0;
        let subChunk = chunkCS;
        let subChunkIsEmpty = chunkCSIsEmpty;
        if (in_key.operation.entry) {
          insertSize += estimateSizeForInsertionInObject(chunkCS, in_key.operation.entry, {}, chunkCSIsEmpty, 2);
          if (chunkCS[in_key.operation.entry] !== undefined) {
            subChunk = chunkCS[in_key.operation.entry];
          } else {
            subChunk = {};
            subChunkIsEmpty = true;
          }
        }
        insertSize += estimateSizeForInsertionInObject(subChunk, in_key.typeid, {}, subChunkIsEmpty, 2);
        insertSize += estimateSizeForInsertionInObject(subChunk[in_key.typeid] || {}, in_key.key,
          !in_initialize ? in_key.data : {}, subChunk[in_key.typeid] === undefined,
          !in_initialize ? undefined : 2);

        // Stop processing, if adding this key would make the chunk too big
        if (!in_forceInsertion &&
            in_traversalState.currentChunk.size + insertSize > in_traversalState.maxChunkSize) {
          return CHUNK_SIZE_EXCEEDED;
        }

        in_traversalState.currentChunk.size += insertSize;
      }
      state.chunkCSIsEmpty = false;

      // If we have an insert, modify or reversible changeset remove
      // operation, we continue with the corresponding nested changeset
      // creating it if necessary
      if (in_key.operation === INSERT_PROPERTY ||
          in_key.operation === MODIFY_PROPERTY ||
          in_key.operation === REMOVE_REVERSIBLE_PROPERTY) {
        if (chunkCS[in_key.operation.entry] === undefined) {
          chunkCS[in_key.operation.entry] = {};
        }

        chunkCS = chunkCS[in_key.operation.entry];
      }

      // Add the key to the changeset
      if (chunkCS[in_key.typeid] === undefined) {
        chunkCS[in_key.typeid] = {};
      }

      if (!in_initialize) {
        chunkCS[in_key.typeid][in_key.key] = in_key.data;
      } else {
        chunkCS[in_key.typeid][in_key.key] = {};
      }

      // Reset the firstModifyWithoutContent flag, if we now have content
      if ((in_key.operation !== STATIC_PROPERTY && in_key.operation !== MODIFY_PROPERTY)) {
        in_traversalState.firstModifyWithoutContent = undefined;
      }

      if ((in_key.operation !== STATIC_PROPERTY && in_key.operation !== INSERT_PROPERTY)) {
        in_traversalState.insertSequenceWithoutLeaf = false;
      }

      return chunkCS[in_key.typeid][in_key.key];
    }
  };

  /**
   * Descends the traversal into the sub-property for the given key
   *
   * @param {HFDM.MaterializedHistoryService.ChangeSetProcessing.chunkChangeSet~TraversalState} in_traversalState -
   *     The current state of the traversal
   * @param {HFDM.MaterializedHistoryService.ChangeSetProcessing.chunkChangeSet~KeyInfo} in_key -
   *     Information about one key in the original changeset
   * @param {Function} in_pathBuilder - Function that builds a path
   * @param {Function} in_sortKeyEncoder - Function that encodes a key for sorting
   * @return {boolean} - ???
   */
  let _descendIntoSubChangesetForKey = function(in_traversalState, in_key, in_pathBuilder, in_sortKeyEncoder) {
    let state = in_traversalState.stack[in_traversalState.stack.length - 1];
    let newOriginalCS = state.originalCS;
    let chunkFull = false;

    // Descend to the sub-changeset for the input changeset
    if (in_key.operation === INSERT_PROPERTY ||
      in_key.operation === MODIFY_PROPERTY ||
      in_key.operation === REMOVE_REVERSIBLE_PROPERTY) {
      newOriginalCS = newOriginalCS[in_key.operation.entry];
    }
    newOriginalCS = newOriginalCS[in_key.typeid][in_key.key];

    // If necessary add a corresponding entry into the target changeset
    let oldChunkSize = in_traversalState.currentChunk.size;
    let newChunkCS = _addPropertyToChunk(in_traversalState, in_key, true, in_traversalState.firstInsertInChunk);

    if (newChunkCS === CHUNK_SIZE_EXCEEDED) {
      newChunkCS = {};
      chunkFull = true;
      if (!in_traversalState.firstInsertInChunk) {
        // The key was not added, as the insertion was not forced. However, the key
        // cannot be skipped as we would miss it from the boundary of the next chunk.
        // Decreasing the current counter and not pushing to the stack will allow to re-process it.
        in_traversalState.stack[in_traversalState.stack.length - 1].currentIndex--;
        return chunkFull;
      }
    } else {
      // If this is a modify operation, we keep track of the first modify operation
      // on the stack that has not yet any inserts or leafs in it. This way, we can
      // later remove modifies that were not needed.
      // Static properties should also be considered, as they could be empty as well.
      if ((in_key.operation === MODIFY_PROPERTY || in_key.operation === STATIC_PROPERTY) &&
        in_traversalState.firstModifyWithoutContent === undefined) {
        in_traversalState.firstModifyWithoutContent = in_traversalState.stack.length;
        in_traversalState.chunkSizeBeforeFirstModifyWithoutContent = oldChunkSize;
      }

      // If this is an insert or remove operation, we have to reset the
      // firstModifyWithoutContent flag, since we now have an operation
      // that has to be preserved in this chunk
      if (in_key.operation === INSERT_PROPERTY ||
          in_key.operation === REMOVE_PROPERTY) {
        in_traversalState.firstModifyWithoutContent = undefined;
        in_traversalState.firstInsertInChunk = false;
      }
    }

    // Add a new entry onto the traversal stack
    let context = TypeIdHelper.extractContext(in_key.typeid).context;
    in_traversalState.stack.push({
      originalCS: newOriginalCS,
      chunkCS: newChunkCS,
      chunkCSIsEmpty: true,
      path: in_pathBuilder(state.path, in_key, in_traversalState.stack.length - 1),
      keys: _extractKeys(newOriginalCS, in_sortKeyEncoder, in_traversalState.stack.length - 1),
      useSquareBrackets: context === 'map' || context === 'set' || context === 'array',
      currentIndex: 0,
      currentKey: in_key
    });

    return chunkFull;
  };

  /**
   * Updates the boundaries of the current chunk. We search for the correct chunk in the
   * pathBoudaries array that contains the in_propertyPath and set the current boundaries
   * to the left and right boundary of that chunk.
   *
   * @param {HFDM.MaterializedHistoryService.ChangeSetProcessing.chunkChangeSet~TraversalState} in_traversalState -
   *     The current state of the traversal
   * @param {String} in_propertyPath -
   *     Path of the property that should lie inside of the chunk
   */
  let _updatePathBoundaries = function(in_traversalState, in_propertyPath) {
    let chunkIndex;
    if (!_.some(in_traversalState.stack, (x) => x.insertOrRemoveOverlapsWithRightBoundary)) {
      // In that case, we just need to enter the correct starting path
      // index into the chunk and update the right boundary accordingly
      chunkIndex = _.sortedIndex(in_traversalState.pathBoundaries, in_propertyPath);

      // If the string actually exists in the array, sortedIndex will return the position
      // of the string, but we want to get the chunk that starts at that boundary, so
      // we have to increment the counter by one in that case
      if (in_traversalState.pathBoundaries[chunkIndex] === in_propertyPath) {
        chunkIndex++;
      }
    } else {
      // If we have a remove operation that overlaps with the right boundary
      // we have to continue with the next adjacent chunk (otherwise we might
      // skip intermediate chunks)
      chunkIndex = in_traversalState.chunks[in_traversalState.chunks.length - 2].correspondingChunkIndex + 1;
    }

    // Update the corresponding chunk index
    in_traversalState.currentChunk.correspondingChunkIndex = chunkIndex;

    // Set the left path boundary. This will correctly return undefined at the index 0
    // indicating that there is no boundary for the leftmost chunk
    in_traversalState.currentChunk.startPath = in_traversalState.pathBoundaries[chunkIndex - 1];

    // Update the right most boundary. This can be undefined, if we are already
    // behind the last path in the boundaries array
    in_traversalState.currentPathRightBoundary = in_traversalState.pathBoundaries[chunkIndex];
  };

  /**
   * Divides a changeset into chunks which usually have a size of in_chunkSize
   * (it can happen that the chunks are larger, for example if there is a
   * large literal in the chunk). The chunks are sorted lexicographically
   * by their paths
   *
   * TODO: We should correctly sort keys which contain escaped characters 0x00 and 0x01
   * TODO: Find out why there is still a remove 24 in the materialized view
   * TODO: Investigate whether isLeaf works correctly for maps
   *
   * @param {Object}          in_changeSet        - The ChangeSet to divide into chunks
   * @param {Number}          [in_chunkSize]      - The desired size of a chunk. If not
   *                                                provided chunking will only be done
   *                                                on the path boundaries. In that case,
   *                                                the size member in the chunk will not
   *                                                contain valid data.
   * @param {Array.<String>}  [in_pathBoundaries] - Paths at which new chunks should be
   *                                                created. If not provided, we will only
   *                                                chunk based on the chunk size. The path
   *                                                boundaries specify the inclusive left
   *                                                side boundary of a chunk.
   * @param {Object}   [in_options]               - Additional options
   * @param {Function} [in_options.pathBuilder]   - Function that builds a path
   * @param {Function} [in_options.sortKeyEncoder] - Function that encodes a key for sorting
   * @return {Array.<HFDM.MaterializedHistoryService.ChangeSetProcessing.ChangeSetChunk>} -
   *     The created chunks.
   */
  let chunkChangeSet = function(in_changeSet, in_chunkSize, in_pathBoundaries, in_options) {
    let pathBuilder = (in_options && in_options.pathBuilder) || _joinKeyWithPath;
    let sortKeyEncoder = (in_options && in_options.sortKeyEncoder) || _escapeKeyForSorting;
    let startChunk = {};
    let traversalState = {
      stack: [{
        originalCS: in_changeSet,
        chunkCS: startChunk,
        // Tracks whether chunkCS is empty. This is needed to quickly determine the size of an insertion
        chunkCSIsEmpty: true,
        path: '',
        keys: _extractKeys(in_changeSet, sortKeyEncoder, 0),
        currentIndex: 0,
        currentKey: undefined,
        insertOrRemoveOverlapsWithRightBoundary: false
      }],
      chunks: [{
        startPath:  undefined,
        changeSet: startChunk,
        size: 2
      }],
      currentChunk: undefined,
      maxChunkSize: in_chunkSize || Infinity,
      pathBoundaries: in_pathBoundaries,
      currentPathRightBoundary: in_pathBoundaries && in_pathBoundaries.length > 0 ? in_pathBoundaries[0] : undefined,
      firstModifyWithoutContent: undefined,
      insertSequenceWithoutLeaf: true,
      chunkSizeBeforeFirstModifyWithoutContent: undefined,
      firstInsertInChunk: true
    };
    traversalState.currentChunk = traversalState.chunks[0];

    // By default the first chunk should correspond to the first chunk
    // in the previous iteration. This will be overwritten later, if
    // that is not the case
    if (in_pathBoundaries !== undefined) {
      traversalState.currentChunk.correspondingChunkIndex = 0;
    }

    let chunkFull = false;
    traversalState.firstInsertInChunk = true;
    let nextPropertyPath = undefined;
    let firstDescent = true;
    while (traversalState.stack.length !== 0) {
      let propertyPath;
      let state = traversalState.stack[traversalState.stack.length - 1];
      state.insertOrRemoveOverlapsWithRightBoundary = false;

      if (state.keys.length === 0) {
        // Special case in which the following for loop is not entered.
        // May happen when the property is empty or the ChangeSet is malformed.
        // In this case we need to make sure we don't keep adding chunks forever.
        chunkFull = false;
      }

      for (; state.currentIndex < state.keys.length; state.currentIndex++) {
        let key = state.keys[state.currentIndex];
        let leaf = key.operation === REMOVE_PROPERTY || _isLeaf(key.typeid, key.data);

        // Check whether the current path is still inside of the path boundaries
        // for the current chunk
        if (traversalState.currentPathRightBoundary) {
          propertyPath = pathBuilder(state.path, key, traversalState.stack.length - 1);

          // If this is the first chunk we are processing and we have not yet
          // updated its boundary, we need to do that now
          if ((leaf ||
               key.operation === INSERT_PROPERTY ||
               key.operation === REMOVE_REVERSIBLE_PROPERTY ||
               key.operation === REMOVE_PROPERTY) &&
              firstDescent) {
            _updatePathBoundaries(traversalState, propertyPath);
            firstDescent = false;
          }

          let pathOverlapsWithRightBoundary = traversalState.currentPathRightBoundary &&
              traversalState.currentPathRightBoundary.substr(0, propertyPath.length) === propertyPath &&
              traversalState.currentPathRightBoundary !== propertyPath;

          // If we are not chunking the changeset, it is not necessary to descend into
          // subtrees which are completely within the boundaries. In those cases, we
          // set the leaf flag to true, which prevents further processing of the
          // nested changeset
          if (in_chunkSize === undefined &&
              (traversalState.currentPathRightBoundary === undefined ||
               (propertyPath < traversalState.currentPathRightBoundary && !pathOverlapsWithRightBoundary))) {
            leaf = true;
          }

          // Check, whether we are currently removing or inserting a property that overlaps with the
          // current right boundary path
          state.insertOrRemoveOverlapsWithRightBoundary = (key.operation === INSERT_PROPERTY ||
                                                           key.operation === REMOVE_REVERSIBLE_PROPERTY ||
                                                           key.operation === REMOVE_PROPERTY) &&
                                                          pathOverlapsWithRightBoundary;

          if (state.insertOrRemoveOverlapsWithRightBoundary) {
            // If the removal or insert overlaps, we must include the operation in this chunk
            _addPropertyToChunk(traversalState, key, false, true);
            traversalState.firstInsertInChunk = false;
          }

          if ((!firstDescent || !traversalState.firstInsertInChunk) &&
              (traversalState.currentPathRightBoundary <= propertyPath ||
              (state.insertOrRemoveOverlapsWithRightBoundary && key.operation === REMOVE_PROPERTY))) {
            // The path is no longer in the current chunk.
            // We have to mark this chunk as full and continue with the next one
            chunkFull = true;
            nextPropertyPath = propertyPath;
            break;
          }
        } else {
          // If we are not chunking the changeset, it is not necessary to descend into
          // subtrees which are completely within the boundaries. In those cases, we
          // set the leaf flag to true, which prevents further processing of the
          // nested changeset
          if (in_chunkSize === undefined) {
            leaf = true;
          }
        }

        // Set the startPath of the current chunk if this is not the first one.
        // Note that the startPath should point to the first property, leaf or not,
        // that is processed for a chunk. This guarantees that partial checkouts for
        // that path will work as expected.
        if (traversalState.chunks.length > 1 &&
          traversalState.currentChunk.startPath === undefined) {
          traversalState.currentChunk.startPath = pathBuilder(state.path, key, traversalState.stack.length - 1);
        }

        if (leaf) {
          // If this is a leaf, we add it to the resulting chunk
          let result = _addPropertyToChunk(
            traversalState, key, false, traversalState.firstInsertInChunk || traversalState.insertSequenceWithoutLeaf
          );
          traversalState.firstModifyWithoutContent = undefined;
          traversalState.firstInsertInChunk = false;
          chunkFull = result === CHUNK_SIZE_EXCEEDED;
          firstDescent = false;
          if (chunkFull) {
            break;
          } else {
            traversalState.insertSequenceWithoutLeaf = false;
          }
        } else {
          // If this is not a leaf, we descend down into the changeset
          chunkFull = _descendIntoSubChangesetForKey(traversalState, key, pathBuilder, sortKeyEncoder);
          state.currentIndex++;

          break;
        }
      }

      let addNewChunk = (updatePathBoundaries) => {
        let newChunk = {
          startPath: undefined,
          changeSet: {},
          size: 2
        };
        traversalState.chunks.push(newChunk);
        traversalState.currentChunk = newChunk;
        traversalState.firstInsertInChunk = true;
        traversalState.insertSequenceWithoutLeaf = true;

        if (!_.some(traversalState.stack, (x) => x.insertOrRemoveOverlapsWithRightBoundary)) {
          firstDescent = true;
        }

        // Did we leave the last chunk since we reached a path boundary?
        if (updatePathBoundaries) {
          // Update the path boundaries for the next chunk to include the
          // property path
          _updatePathBoundaries(traversalState, propertyPath);
          propertyPath = undefined;
        }

        // Descend along the traversal stack and recreate
        // the changeset
        traversalState.stack[0].chunkCS = newChunk.changeSet;
        traversalState.stack[0].chunkCSIsEmpty = true;
        for (let i = 1; i < traversalState.stack.length; i++) {
          traversalState.stack[i].chunkCS = _addPropertyToChunk(traversalState,
            traversalState.stack[i].currentKey,
            true,
            true,
            i - 1);
          traversalState.stack[i].chunkCSIsEmpty = true;
        }
      };

      if (chunkFull) {
        // Remove superfluous modify statements in the current chunk
        // These can be created while descending down the property hierarchy,
        // if the final leaf operation isn't part of the current chunk. In that
        // case we have to delete all modifies that were created and are not needed.
        if (traversalState.firstModifyWithoutContent !== undefined) {
          let parentCS = traversalState.stack[traversalState.firstModifyWithoutContent - 1].chunkCS;
          let key = traversalState.stack[traversalState.firstModifyWithoutContent].currentKey;
          if (key.operation === STATIC_PROPERTY) {
            delete parentCS[key.typeid][key.key];
            if (_.isEmpty(parentCS[key.typeid])) {
              delete parentCS[key.typeid];
            }
          } else if (key.operation === MODIFY_PROPERTY) {
            delete parentCS.modify[key.typeid][key.key];
            if (_.isEmpty(parentCS.modify[key.typeid])) {
              delete parentCS.modify[key.typeid];
            }
            if (_.isEmpty(parentCS.modify)) {
              delete parentCS.modify;
            }
          }
          traversalState.currentChunk.size = traversalState.chunkSizeBeforeFirstModifyWithoutContent;

          traversalState.firstModifyWithoutContent = undefined;
        }

        addNewChunk(nextPropertyPath);

        // When the chunk size limit was reached, we did not complete the for loop above
        // so we have to return to that loop, instead of popping the state below
        continue;
      }

      // We have finished processing all entries in the state, if the state is still the tip of the stack.
      //  We now remove it from the stack to continue processing its parent.
      if (state === traversalState.stack[traversalState.stack.length - 1]) {
        // If the operation overlaps with the right boundary, we have to insert it into all overlapping chunks
        if (_.some(traversalState.stack, (x) => x.insertOrRemoveOverlapsWithRightBoundary)) {
          let path = state.path;

          for (;;) {
            let pathOverlapsWithRightBoundary = traversalState.currentPathRightBoundary &&
                traversalState.currentPathRightBoundary.substr(0, path.length) === path &&
                traversalState.currentPathRightBoundary !== path;
            if (!pathOverlapsWithRightBoundary) {
              break;
            }

            addNewChunk(true);
          }
        }
        traversalState.stack.pop();
        // Clean up empty modify/static properties that are no longer in scope
        if (traversalState.firstModifyWithoutContent &&
          traversalState.stack.length <= traversalState.firstModifyWithoutContent) {
          traversalState.firstModifyWithoutContent = undefined;
        }
      }
    }

    return traversalState.chunks;
  };

  /**
   * Compares two paths, taking into account the rules for path comparisons used in the
   * chunking algorithm. Undefined will either be treated as start or end of the keyspace,
   * depending on the startPath flag.
   *
   * @param {String|undefined} path1 - The first path to compare
   * @param {String|undefined} path2 - The second path to compare
   * @param {Boolean} startPath1 - Is path1 the start or end path of a range?
   * @param {Boolean} startPath2 - Is path2 the start or end paths of a range?
   *
   * @return {Number} -1 is path1 < path2, 0 if they are equal otherwise 1
   */
  let compareChangeSetBoundaries = function(path1, path2, startPath1, startPath2) {
    if (path1 === path2) {
      if (path1 === undefined &&
          startPath1 !== startPath2) {
        // Both paths are undefined, but one is a start and one an end path
        return startPath1 ? -1 : 1;
      } else {
        return 0;
      }
    }

    if (path1 === undefined) {
      return startPath1 ? -1 : 1;
    }

    if (path2 === undefined) {
      return startPath2 ? 1 : -1;
    }

    return path1 < path2 ? -1 : 1;
  };

  module.exports = {
    chunkChangeSet,
    convertPathToChunkBoundaryFormat,
    getPathFromChunkBoundaryFormat,
    compareChangeSetBoundaries
  };
})();

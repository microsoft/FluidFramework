/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Class that implements the logic for a leaf node of the B-Tree
 */
(function() {
  let _ = require('lodash'),
      { chunkChangeSet } = require('./change_set_processing/chunk_change_set'),
      mergeChunkedChangeSet = require('./change_set_processing/merge_chunked_changeset').mergeChunkedChangeSet,
      BaseNode = require('./base_node'),
      parseNodeReference = require('../utils/node_refs').parseNodeReference,
      getBaseNodeRef = require('../utils/node_refs').getBaseNodeRef,
      StorageManager = require('./storage_backends/storage_manager'),
      NodeDependencyManager = require('./node_dependency_manager'),
      ConsoleUtils = require('@fluid-experimental/property-common').ConsoleUtils,
      OperationError = require('@fluid-experimental/property-common').OperationError,
      HTTPStatus = require('http-status'),
      { ChangeSet } = require('@fluid-experimental/property-changeset');
  const fastestJSONCopy = require('fastest-json-copy');
  const deepCopy = fastestJSONCopy.copy;

  let NodeStatus = NodeDependencyManager.NodeStatus;

  global.modifiedLeafs = 0;
  /**
   * Class which implements processing of updates for a leaf node of the B-Tree
   * @param {Object} in_params -
   *     Parameter which are passed to the BaseNode.
   */
  let LeafNode = function(in_params) {
    BaseNode.call(this, in_params);
  };
  LeafNode.prototype = Object.create(BaseNode.prototype);
  LeafNode.prototype.constructor = LeafNode;

  /** @inheritdoc */
  LeafNode.prototype.nodeTypeName = 'l';

  /**
   * Handler which is called after the node has been fetched from the database.
   * It applies the changeset to the contents of the node and when necessary
   * performs splitting of the resulting changeset.
   *
   * @return {HFDM.MaterializedHistoryService.NodeDependencyManager.NodeStatus} -
   *    The status of the node after processing this handler has finished
   */
  LeafNode.prototype._fetchedHandler = function() {
    // Create a new changeset by applying the changes to the chunk
    let modificationPerformed = this.subtreeModification.changeSet !== undefined;
    let newChangeset = new ChangeSet(this.nodeChangeSet);
    let deltaCS;
    if (modificationPerformed) {
      try {
        deltaCS = new ChangeSet(this.subtreeModification.changeSet);
        deltaCS._toReversibleChangeSet(newChangeset.getSerializedChangeSet());
        newChangeset.applyChangeSet(this.subtreeModification.changeSet);
      } catch (err) {
        throw new OperationError(`Error processing ChangeSet: ${err.message}`, 'CreateCommit', HTTPStatus.BAD_REQUEST,
          OperationError.FLAGS.QUIET);
      }
    }
    global.modifiedLeafs++;

    // If the new changeset is too big, we have to split it into smaller chunks
    let newChunks;
    this.mergeNeeded = false;
    if (modificationPerformed) {
      let changeSetSize = JSON.stringify(newChangeset.getSerializedChangeSet()).length;
      if (changeSetSize >
          this._session.bTreeParameters.chunkSize *
          this._session.bTreeParameters.splitLimitFactor) {
        let newSize;

        // Determine the size of the new chunks
        /* if (changeSetSize < 2 *
               this._session.bTreeParameters.chunkSize *
               this._session.bTreeParameters.splitLimitFactor)  {
          // If splitting would result in two chunks, we split them in half
          newSize = Math.ceil(changeSetSize / 2); // Some leeway to prevent a tiny last chunk
        } else {*/
        // Otherwise we create chunks of the initial size specified in the config
        newSize = this._session.bTreeParameters.chunkSize *
                  this._session.bTreeParameters.initialChunkSizeFactor;
        // }

        newChunks = chunkChangeSet(newChangeset.getSerializedChangeSet(), newSize, undefined, {
          pathBuilder: this._session.pathBuilder,
          sortKeyEncoder: this._session.sortKeyEncoder
        });

        // We have to preserve the startPath since we chunked a ChangeSet that only
        // contained changes starting at this path
        newChunks[0].startPath = this.subtreeModification.startPath;

        // Chunk the deltaCs at the same chunk boundaries
        let chunkedDeltaCS = chunkChangeSet(deltaCS.getSerializedChangeSet(), undefined,
          _.map(newChunks, 'startPath').slice(1), {
            pathBuilder: this._session.pathBuilder,
            sortKeyEncoder: this._session.sortKeyEncoder
          });

        for (let i = 0; i < newChunks.length; i++) {
          let chunkDeltaCS = _.find(chunkedDeltaCS, (x) => x.correspondingChunkIndex === i);
          if (chunkDeltaCS !== undefined) {
            newChunks[i].deltaCS = chunkDeltaCS.changeSet;
          } else {
            newChunks[i].deltaCS = {};
          }
          newChunks[i].splitNode = true;
          newChunks[i].previousNodeRefs = [this._ref];
        }

        // Check, whether the last chunk is smaller than the allowed limit
        if (newChunks.length > 1) {
          let lastChangeSetSize = JSON.stringify(newChunks[newChunks.length - 1].changeSet).length;
          if (lastChangeSetSize <
            this._session.bTreeParameters.chunkSize *
            this._session.bTreeParameters.mergeLimitFactor) {

            // In that case, we merge the last two chunks.
            let lastTwoChunks = newChunks.splice(newChunks.length - 2);
            let mergedCS = mergeChunkedChangeSet(lastTwoChunks.map((x) => x.changeSet));
            newChunks.push({
              changeSet: mergedCS,
              startPath: lastTwoChunks[0].startPath,
              deltaCS: mergeChunkedChangeSet(lastTwoChunks.map((x) => x.deltaCS)),
              splitNode: true,
              previousNodeRefs: [this._ref]
            });

            // TODO: After merging, the chunk could be too large, in that case,
            //       we could split it again to create a valid chunk
          }
          // console.log(newChunks.length, changeSetSize, newSize);
          global.splitNodes = global.splitNodes || 0;
          global.splitNodes += newChunks.length;
          global.modifiedLeafs += newChunks.length - 1;
        }
      } else {
        // We don't need to further subdivide the chunk
        newChunks = [{
          startPath: this.subtreeModification.startPath,
          changeSet: newChangeset.getSerializedChangeSet(),
          deltaCS: deltaCS.getSerializedChangeSet(),
          previousNodeRefs: [this._ref]
        }];
        global.unsplitNodes = global.unsplitNodes || 0;
        global.unsplitNodes++;

        // Check, whether the chunk is small enough that it should be merged with other chunks
        if (changeSetSize <
            this._session.bTreeParameters.chunkSize *
            this._session.bTreeParameters.mergeLimitFactor) {
          this.mergeNeeded = true;
        }
      }

      this._setNewNodes(newChunks);
    }

    return NodeStatus.MERGE_REQUIRED;
  };

  /**
   * Handler which is called when the node is ready to be merged with neighboring nodes.
   * It performs the merges.
   *
   * @return {HFDM.MaterializedHistoryService.NodeDependencyManager.NodeStatus} -
   *    The status of the node after processing this handler has finished
   */
  LeafNode.prototype._mergeRequiredHandler = function() {
    return this._baseMergeRequiredHandler((previousSiblingNode) => {

      let startPath, changeSet, previousDeltaCS, previousNodeRefs;
      if (previousSiblingNode.newNodes === undefined) {
        previousSiblingNode.newNodes = [];
        previousSiblingNode._getParent().modifiedChildIndices.push(previousSiblingNode.indexInParent);
        startPath = previousSiblingNode.subtreeModification.startPath;
        changeSet = previousSiblingNode.nodeChangeSet;
        previousDeltaCS = {};
        previousNodeRefs = [previousSiblingNode._ref];
      } else {
        let lastPreviousChunk = previousSiblingNode.newNodes.splice(previousSiblingNode.newNodes.length - 1, 1)[0];
        startPath = lastPreviousChunk.startPath;
        changeSet = lastPreviousChunk.changeSet;
        previousDeltaCS = lastPreviousChunk.deltaCS;
        previousNodeRefs = lastPreviousChunk.previousNodeRefs;
      }

      if (this.newNodes === undefined) {
        this._setNewNodes([{
          changeSet: this.nodeChangeSet,
          startPath: this.subtreeModification.startPath,
          deltaCS: {},
          previousNodeRefs: [this._ref]
        }]);
      } else {
        if (this.newNodes[0].previousNodeRefs.length === 1) {
          global.unsplitNodes -= 1;
        }
      }

      global.mergedNodes = global.mergedNodes || 0;
      global.mergedNodes++;

      // TODO: We should check whether this chunk is now larger than the max chunk limit. In that case,
      //       we should split it again
      let mergedCS = mergeChunkedChangeSet([this.newNodes[0].changeSet, changeSet]);
      this.newNodes[0].changeSet = mergedCS;
      this.newNodes[0].startPath = startPath;
      this.newNodes[0].previousNodeRefs = previousNodeRefs.concat(this.newNodes[0].previousNodeRefs);
      this.newNodes[0].deltaCS = mergeChunkedChangeSet([this.newNodes[0].deltaCS, previousDeltaCS]);

      let changeSetSize = JSON.stringify(mergedCS).length;
      this.mergeNeeded = changeSetSize < this._session.bTreeParameters.chunkSize *
                                         this._session.bTreeParameters.mergeLimitFactor;
    });
  };

  /**
   * Handler which is called when the node has finished merging with neighbours.
   * It writes the node to the database
   *
   * @return {HFDM.MaterializedHistoryService.NodeDependencyManager.NodeStatus} -
   *    The status of the node after processing this handler has finished
   */
  LeafNode.prototype._mergedHandler = async function() {
    await this._writeNewNodes(async (baseNodeRef, nodeData, nodeDefinition) => {
      // We have created a new node. If available, we will add an additional
      // database entry that encodes the history of this new node
      if (nodeDefinition.deltaCS) {
        let previousHistoryNodeRef = 'hi' + getBaseNodeRef(nodeDefinition.previousNodeRefs[0]).substr(1);
        let previousHistoryNode = await this._btreeManager._storage.get(previousHistoryNodeRef);
        if (!previousHistoryNode) {
          throw new OperationError('Missing previous history node', 'CreateCommit', HTTPStatus.INTERNAL_SERVER_ERROR);
        }

        // TODO: Support multiple previous nodes
        let nextLevelNeedsUpdate = true;
        let newHistoryNodeLevels = deepCopy(previousHistoryNode.levels);
        let currentLevelIndex;

        // Insert subIds of the last node for all entries that are still missing the subId
        // This is necessary, since we know this subID only after a node has been finished
        // and a successor node has been created
        for (currentLevelIndex = 0, nextLevelNeedsUpdate = true;
          currentLevelIndex < newHistoryNodeLevels.length;
          currentLevelIndex++) {
          let currentLevel = newHistoryNodeLevels[currentLevelIndex];
          if (currentLevel.current.length >= 1) {
            let lastEntry = currentLevel.current[currentLevel.current.length - 1];
            if (lastEntry.lastSubId === undefined) {
              ConsoleUtils.assert(lastEntry.ref === getBaseNodeRef(nodeDefinition.previousNodeRefs[0]));
              lastEntry.lastSubId = parseNodeReference(nodeDefinition.previousNodeRefs[0]).subId;
            }
          }
        }

        // Update the different levels of the hierarchical history
        let historyNodesToAdd = [];
        for (currentLevelIndex = 0, nextLevelNeedsUpdate = true;
          currentLevelIndex < newHistoryNodeLevels.length && nextLevelNeedsUpdate;
          currentLevelIndex++) {
          let currentLevel = newHistoryNodeLevels[currentLevelIndex];
          let nodeInfo = {
            ref: baseNodeRef
          };
          currentLevel.current.push(nodeInfo);

          // Add this connection to the list of history nodes we have to add
          if (currentLevel.current.length > 1) {
            historyNodesToAdd.push({
              from: currentLevel.current[currentLevel.current.length - 2],
              to: currentLevel.current[currentLevel.current.length - 1],
              level: currentLevelIndex
            });
          }

          // Did we reach the maximum number of nodes in one level
          if (currentLevel.current.length > this._session.bTreeParameters.nodesPerHierarchicalHistoryLevel) {
            // Restart the level and move the current list of nodes into the previous list
            currentLevel.previous = currentLevel.current;
            currentLevel.current = [nodeInfo];

            // If the next level does not yet exists, we have to create it
            if (newHistoryNodeLevels.length === currentLevelIndex + 1) {
              newHistoryNodeLevels.push({
                current: [currentLevel.previous[0]],
                previous: []
              });
            }
          } else {
            // We are finished and don't need any more updates
            nextLevelNeedsUpdate = false;
          }
        }
        // console.log(newHistoryNodeLevels.length);

        // Store the new history info node
        let historyInfoNode =  {
          branchGuid: this._session.branchGuid,
          previousNodeRefs: nodeDefinition.previousNodeRefs,
          firstSubRef: nodeData.guid,
          levels: newHistoryNodeLevels
        };

        let historyInfoNodeRef = 'hi' + baseNodeRef.substr(1);
        await this._btreeManager._storage.store(
          this.batch,
          historyInfoNodeRef,
          historyInfoNode
        );

        for (let k = 0; k < historyNodesToAdd.length; k++) {
          let connectionInfo = historyNodesToAdd[k];

          if (connectionInfo.level > 0) {
            let previousLevelCommits = newHistoryNodeLevels[connectionInfo.level - 1].previous;
            let changeSets = await Promise.all(_.map(previousLevelCommits.slice(1), async (toCommitInfo, i) => {
              /* if (previousLevelNode.ref === baseNodeRef) {
                return nodeDefinition.deltaCS
              } else {
                return {};
              }*/
              let fromCommitInfo = previousLevelCommits[i];
              if (connectionInfo.level === 1) {
                let historyNodePromise = undefined;
                if (toCommitInfo.ref === baseNodeRef) {
                  historyNodePromise = Promise.resolve({
                    changeSet: nodeDefinition.deltaCS
                  });
                } else {
                  historyNodePromise = this._btreeManager._storage.get(
                    'h:' + parseNodeReference(toCommitInfo.ref).guid +
                    '#' + parseNodeReference(fromCommitInfo.ref).guid);
                }

                // If we are at the first level, we obtain the changes for a node by squashing the
                // the changes from the history node with all changes inside of the actual leaf node
                let [historyNode, leafNodeChangeSet] = await Promise.all([
                  historyNodePromise,
                  this._btreeManager._storage.getNodeChangeset(fromCommitInfo.ref + ':' + fromCommitInfo.lastSubId,
                    false,
                    StorageManager.ChangeSetType.FULL_CHANGESET)
                ]);
                return [leafNodeChangeSet, historyNode.changeSet];
              } else {
                // In the higher levels, we just fetch the already existing combined node from the previous level
                let previousLevelHistoryNode = await this._btreeManager._storage.get(
                  'h:' + parseNodeReference(toCommitInfo.ref).guid + '#' + parseNodeReference(fromCommitInfo.ref).guid);
                return previousLevelHistoryNode.changeSet;
              }
            }));
            changeSets =  _.flatten(changeSets);
            let combinedCS = new ChangeSet({});
            for (let i = 0; i < changeSets.length; i++) {
              combinedCS.applyChangeSet(changeSets[i]);
            }

            let historyNode = {
              branchGuid: this._session.branchGuid,
              changeSet: combinedCS.getSerializedChangeSet()
            };

            let historyNodeRef = 'h:' + parseNodeReference(connectionInfo.to.ref).guid +
                                 '#' + connectionInfo.from.ref.substr(2);
            await this._btreeManager._storage.store(
              this.batch,
              historyNodeRef,
              historyNode
            );
          }

          /* var historyNode = {
            previousNodeRefs: nodeDefinition.previousNodeRefs,
            changeSet: nodeDefinition.deltaCS,
            firstSubRef: nodeData.guid
          };

          var historyNodeRef = 'h' + baseNodeRef.substr(1);
          await this._btreeManager._storage.store(
            this.batch,
            historyNodeRef,
            historyNode
          );*/
        }
      }

      let historyNode = {
        branchGuid: this._session.branchGuid,
        previousNodeRefs: nodeDefinition.previousNodeRefs,
        changeSet: nodeDefinition.deltaCS,
        firstSubRef: nodeData.guid
      };

      let historyNodeRef = 'h' + baseNodeRef.substr(1) + '#' +
                           parseNodeReference(nodeDefinition.previousNodeRefs[0]).guid;
      await this._btreeManager._storage.store(
        this.batch,
        historyNodeRef,
        historyNode
      );
    });

    return NodeStatus.COMPLETED;
  };

  LeafNode.prototype._waitingForDeleteHandler = async function() {
    // TODO: Should also update HH when it's finished
    await this._baseDelete();
    return NodeStatus.COMPLETED;
  };

  /**
   * @inheritdoc
   */
  LeafNode.prototype._stateHandlers = {
    [NodeStatus.STARTED]: BaseNode.prototype._startedHandler,
    [NodeStatus.FETCHED]: LeafNode.prototype._fetchedHandler,
    [NodeStatus.MERGE_REQUIRED]: LeafNode.prototype._mergeRequiredHandler,
    [NodeStatus.WAITING_FOR_MERGE]: LeafNode.prototype._waitingForMergeHandler,
    [NodeStatus.MERGED]: LeafNode.prototype._mergedHandler,
    [NodeStatus.WAITING_FOR_DELETE]: LeafNode.prototype._waitingForDeleteHandler
  };

  module.exports = LeafNode;
})();

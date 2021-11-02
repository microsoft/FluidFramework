/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Class that implements the logic for an internal node of the B-Tree
 */
(function() {
  let _ = require('lodash'),
      chunkChangeSet = require('./change_set_processing/chunk_change_set').chunkChangeSet,
      DeterministicGuidGenerator = require('../utils/deterministic_guid_generator'),
      OperationError = require('@fluid-experimental/property-common').OperationError,
      HTTPStatus = require('http-status'),
      mergeChunkedChangeSet = require('./change_set_processing/merge_chunked_changeset').mergeChunkedChangeSet,
      BaseNode = require('./base_node'),
      ChangeSet = require('@fluid-experimental/property-changeset').ChangeSet,
      { parseNodeReference } = require('../utils/node_refs'),
      NodeDependencyManager = require('./node_dependency_manager');

  let NodeStatus = NodeDependencyManager.NodeStatus;

  /**
   * Class which implements processing of updates for an internal node of the B-Tree
   * @param {Object} in_params -
   *     Parameter which are passed to the BaseNode.
   */
  let InternalNode = function(in_params) {
    BaseNode.call(this, in_params);

    this.outermostNodes = [];
    this.children = undefined;
  };
  InternalNode.prototype = Object.create(BaseNode.prototype);
  InternalNode.prototype.constructor = InternalNode;

  /** @inheritdoc */
  InternalNode.prototype.nodeTypeName = 'i';

  /**
   * Handler which is called after the node has been started. It fetches the node
   * from the database
   *
   * @return {HFDM.MaterializedHistoryService.NodeDependencyManager.NodeStatus} -
   *    The status of the node after processing this handler has finished
   */
  InternalNode.prototype._startedHandler = async function() {
    const nextStatus = await BaseNode.prototype._startedHandler.call(this);

    // Extract the list of the children from the loaded node's changeSet. This children
    // list is modified later on, when processing the tree modifications
    this.children = this.decodeCsChildren(this.nodeChangeSet);

    return nextStatus;
  };

  /**
   * Handler which is called after the node has been fetched from the database.
   * It chunks the changeset and starts processing of the child nodes.
   *
   * @return {HFDM.MaterializedHistoryService.NodeDependencyManager.NodeStatus} -
   *    The status of the node after processing this handler has finished
   */
  InternalNode.prototype._fetchedHandler = async function() {
    let changeSet = this.subtreeModification.changeSet;

    if (this.children.length === 0) {
      // Initial insertion, just chunk based on size
      let chunks = chunkChangeSet(changeSet, this._session.bTreeParameters.chunkSize *
        this._session.bTreeParameters.initialChunkSizeFactor, undefined, {
          pathBuilder: this._session.pathBuilder,
          sortKeyEncoder: this._session.sortKeyEncoder
        });

      if (chunks.length > 1) {
        let lastChangeSetSize = JSON.stringify(chunks[chunks.length - 1].changeSet).length;
        if (lastChangeSetSize <
              this._session.bTreeParameters.chunkSize *
              this._session.bTreeParameters.splitLimitFactor) {
          let lastTwoChunks = chunks.splice(chunks.length - 2);
          let mergedCS = mergeChunkedChangeSet(lastTwoChunks.map((x) => x.changeSet));
          chunks.push({
            changeSet: mergedCS,
            startPath: lastTwoChunks[0].startPath
          });
        }
      }

      // Directly create all the leaf nodes
      let storePromises = [];
      chunks = _.sortBy(chunks, BaseNode.startPathComparison);
      const guidGenerator = new DeterministicGuidGenerator(this._session.branchGuid, this._session.commitGuid);
      const { guid } = parseNodeReference(this._ref);
      for (let i = 0; i < chunks.length; i++) {
        let chunkInfo = {
          guid: guidGenerator.getNextGuid(guid, true),
          changeSet: chunks[i].changeSet,
          branchGuid: this._session.branchGuid
        };
        storePromises.push(
          this._btreeManager._storage.store(
            this.batch, 'l:' + chunkInfo.guid, chunkInfo
          )
        );
        this.children.push({
          nodeRef: 'l:' + chunkInfo.guid,
          startPath: chunks[i].startPath
        });

      }
      this.modifiedChildIndices = [];
      this.childrenListModified = true;

      // Mark the node as completed
      await Promise.all(storePromises);

      return NodeStatus.INTERNAL_CHILDREN_PROCESSED;
    } else {
      let childrenToProcess, modifiedChildIndices;
      if (changeSet !== undefined) {
        // Get the boundary paths for the existing chunks
        let boundaries = _.map(this.children.slice(1), 'startPath');

        // Split the incoming changeset according to these boundaries
        childrenToProcess = chunkChangeSet(changeSet, undefined, boundaries, {
          pathBuilder: this._session.pathBuilder,
          sortKeyEncoder: this._session.sortKeyEncoder
        });
        modifiedChildIndices = [];

        // Update the startPath, if there are changes in the first chunk
        if (childrenToProcess.length > 0 && childrenToProcess[0].correspondingChunkIndex === 0) {
          childrenToProcess[0].startPath = this.children[0].startPath;
        }
      } else {
        if (this.childToWaitFor !== undefined) {
          let childToWaitFor = this.childToWaitFor;
          if (childToWaitFor < 0) {
            childToWaitFor = this.children.length + childToWaitFor;
          }
          childrenToProcess = [{
            correspondingChunkIndex: childToWaitFor,
            changeSet: undefined,
            startPath: this.children[childToWaitFor].startPath
          }];
        } else {
          childrenToProcess = [];
        }
        modifiedChildIndices = [];
      }

      // Start processing for all affected nodes
      childrenToProcess.forEach( (x, i) => {
        let nodeData = this._startChildNodeProcessing(x.correspondingChunkIndex, x);

        if (x.correspondingChunkIndex === 0 ||
            x.correspondingChunkIndex === this.children.length - 1) {
          this.outermostNodes.push(nodeData);
        }
      });

      this.modifiedChildIndices = modifiedChildIndices;

      return NodeStatus.INTERNAL_CHILDREN_STARTED;
    }
  };

  /**
   * Handler which is called after processing of the child nodes has started
   * It waits until the outermost nodes have reached the MERGED state.
   *
   * @return {HFDM.MaterializedHistoryService.NodeDependencyManager.NodeStatus} -
   *    The status of the node after processing this handler has finished
   */
  InternalNode.prototype._childrenStartedHandler = async function() {
    await Promise.all(this.outermostNodes.map((node) => {
      return node._waitForStatus(NodeStatus.MERGED);
    }));

    return NodeStatus.INTERNAL_OUTERTMOST_CHILDREN_PROCESSED;
  };


  /**
   * Handler which is called after processing of the outermose child nodes has completed
   * It waits until all child nodes have reached the completed state.
   *
   * @return {HFDM.MaterializedHistoryService.NodeDependencyManager.NodeStatus} -
   *    The status of the node after processing this handler has finished
   */
  InternalNode.prototype._outermostChildProcessedHandler = async function() {
    await Promise.all([
      this._getSibling(false, false, NodeStatus.INTERNAL_OUTERTMOST_CHILDREN_PROCESSED),
      this._getSibling(false, true, NodeStatus.INTERNAL_OUTERTMOST_CHILDREN_PROCESSED)
    ]);

    await this._waitForAllChildrenCompleted();

    return NodeStatus.INTERNAL_CHILDREN_PROCESSED;
  };

  /**
   * Handler which is called after processing of all child nodes has completed.
   * It updates the children list of the internal node and when necessary performs splits
   * of the children list.
   *
   * @return {HFDM.MaterializedHistoryService.NodeDependencyManager.NodeStatus} -
   *    The status of the node after processing this handler has finished
   */
  InternalNode.prototype._childrenProcessedHandler = async function() {
    let parentNode = this._getParent();

    // Check which of my children have been modified / replaced by new children and update
    // my own child list with those changes
    let childrenModified = this.childrenListModified;

    // We have to iterate over the list in sorted order, since we perform modifications of an array
    this.modifiedChildIndices.sort( (a, b) => a - b);

    let childrenArrayDiffChangeSet = {
      'array<String>': {
        children: {
          insert: [],
          remove: []
        }
      }
    };
    let insertOperations = childrenArrayDiffChangeSet['array<String>'].children.insert;
    let removeOperations = childrenArrayDiffChangeSet['array<String>'].children.remove;

    for (let i = 0; i < this.modifiedChildIndices.length; i++) {
      // Get the information from the processing data structure for the child node
      let childState = this._getChild(this.modifiedChildIndices[i]);
      let newChildNodes = childState.newChildNodes;

      // Update the corresponding entries in my children list
      if (newChildNodes) {
        this.childrenListModified = true;
        insertOperations.push([
          this.modifiedChildIndices[i],
          newChildNodes.map(InternalNode.prototype._encodeCsChildEntry)
        ]);
        removeOperations.push([this.modifiedChildIndices[i], 1]);

        childrenModified = true;
      }
    }

    // Apply the changes to the changeset stored in the node
    // Note: this modifes the internal data in-place
    let nodeChangeSet = new ChangeSet(this.nodeChangeSet);
    childrenArrayDiffChangeSet = new ChangeSet(childrenArrayDiffChangeSet);
    childrenArrayDiffChangeSet._toReversibleChangeSet(nodeChangeSet.getSerializedChangeSet());
    nodeChangeSet.applyChangeSet(childrenArrayDiffChangeSet);

    // Check whether we need to split the node because there are too many children
    let order = this._session.bTreeParameters.bTreeOrder;
    let d = (order - 1) / 2 + 1;
    let childrenInCs = this._getChildrenArrayFromCS(nodeChangeSet.getSerializedChangeSet());
    if (childrenInCs.length > order) {

      // Split the subnodes
      this._setNewNodes(this._splitInternalNodesList(childrenInCs));

      // The parent node requires special handling, since it can require multiple split operations.
      // We therefore check, whether this is the root node and whether we still have multiple child nodes
      if (!parentNode &&
          this.newNodes.length > 1) {

        // If that is the case, we write the current list of child nodes out
        // and recursively repeat the processing for the root node
        await this._writeNewNodes();

        this.children = this.newChildNodes;
        this.nodeChangeSet = this._encodeChildrenCS(this.children);
        this.newChildNodes = [];
        this.modifiedChildIndices = [];
        this.levelChange++;
        this.forceNew = true;

        // If this is the case, we call this handler again to repeat the splitting recursively
        return this._childrenProcessedHandler();
      } else {
        // Otherwise, we can set the status of the node to the next status and continue processing
        return NodeStatus.MERGE_REQUIRED;
      }
    } else {
      if (childrenModified) {
        this._setNewNodes([{
          changeSet: this._encodeChildrenCS(childrenInCs),
          startPath: childrenInCs.length > 0 ? this._decodeCsChildEntry(childrenInCs[0]).startPath : undefined,
          deltaCS: !this.forceNew ? childrenArrayDiffChangeSet.getSerializedChangeSet() : undefined,
          previousNodeRefs: [this._ref]
        }]);
      }

      if (parentNode &&
          childrenInCs.length < d) {
        this.mergeNeeded = true;
      }

      return NodeStatus.MERGE_REQUIRED;
    }
  };

  /**
   * Handler which is called when the node is ready to be merged with neighboring nodes.
   * It performs the merges.
   *
   * @return {HFDM.MaterializedHistoryService.NodeDependencyManager.NodeStatus} -
   *    The status of the node after processing this handler has finished
   */
  InternalNode.prototype._mergeRequiredHandler = function() {
    return this._baseMergeRequiredHandler((previousSiblingNode) => {
      let childrenFromPreviousNode;

      let previousNodeCS;
      if (previousSiblingNode.newNodes === undefined) {

        previousSiblingNode.newNodes = [];
        previousNodeCS = this._encodeChildrenCS(previousSiblingNode.children);
        previousSiblingNode._getParent().modifiedChildIndices.push(previousSiblingNode.indexInParent);
      } else {
        let previousNodeEntry = previousSiblingNode.newNodes.splice(previousSiblingNode.newNodes.length - 1, 1)[0];
        previousNodeCS = previousNodeEntry.changeSet;
      }
      childrenFromPreviousNode = this._getChildrenArrayFromCS(previousNodeCS);

      if (this.newNodes === undefined) {
        this._setNewNodes([{
          changeSet: this._encodeChildrenCS(this.children),
          startPath: this.children.length > 0 ? this.children[0].startPath : undefined
        }]);
      }

      let children = this._getChildrenArrayFromCS(this.newNodes.splice(0, 1)[0].changeSet);

      let splitNodeList = this._splitInternalNodesList(childrenFromPreviousNode.concat(children));
      this.newNodes.splice(0, 0, ...splitNodeList);

      let order = this._session.bTreeParameters.bTreeOrder;
      let d = (order - 1) / 2 + 1;
      if (this.newNodes && this.newNodes.length > 0) {
        this.mergeNeeded = this._getChildrenArrayFromCS(this.newNodes[this.newNodes.length - 1].changeSet).length < d;
      } else {
        this.mergeNeeded = false;
      }
    });
  };

  /**
   * Handler which is called when the node has finished merging with neighbours.
   * It write the node to the database
   *
   * @return {HFDM.MaterializedHistoryService.NodeDependencyManager.NodeStatus} -
   *    The status of the node after processing this handler has finished
   */
  InternalNode.prototype._mergedHandler = async function() {

    // Check, whether this is a root node that has to be removed.
    // If we have merged all children below the root node, we have to remove the root node.
    // During a big delete operation, this can also happen for multiple nodes at the root of
    // tree. This can be detected by checking for internal nodes that only have a single
    // internal node as child (a single leaf node is valid, as this means that we are
    // currently processing the new root of the tree)
    let noLongerNeededRoot = false;
    if (this.newNodes && this.newNodes.length === 1) {
      // We are replacing this node with just one node, now check the children of this node
      let subNodeChildren = this._getChildrenArrayFromCS(this.newNodes[0].changeSet);
      if (subNodeChildren.length === 1 &&
          parseNodeReference(
            this._decodeCsChildEntry(subNodeChildren[0]).nodeRef
          ).type === 'i') {
        // The node has only a single internal node as child. So this node
        // is no longer needed and has to be removed from the tree
        noLongerNeededRoot = true;
      }
    }

    if (!noLongerNeededRoot) {
      // This is not a root node that needs to be removed. We therefore store
      // the newly created nodes in the database
      await  this._writeNewNodes();
    } else {
      // Special case for the root node. We don't create new nodes, but instead
      // point to the node of the child below us
      let childNodeData = this._getChild(this.children.length - 1, true);

      this.newParentNode = childNodeData.newParentNode || childNodeData.newChildNodes[0];
      this.levelChange = (childNodeData.levelChange || 0) - 1;
    }

    return NodeStatus.COMPLETED;
  };

  /**
   * Handler which is called when the node is waiting for deletion.
   * It waits for the completion of its children and deletes itself.
   *
   * @return {HFDM.MaterializedHistoryService.NodeDependencyManager.NodeStatus} -
   *    The status of the node after processing this handler has finished
   */
  InternalNode.prototype._waitingForDeleteHandler = async function() {
    for (let i = 0; i < this.children.length; i++) {
      this._startChildNodeProcessing(i, {});
    }
    await this._waitForAllChildrenCompleted();
    await this._baseDelete();
    return NodeStatus.COMPLETED;
  };

  /**
   * Get a child of this node
   *
   * @param {Number} in_index -
   *     Index of the child
   *
   * @return {HFDM.MaterializedHistoryService.BaseNode|undefiend} -
   *     The child node with the given index. If it does not exist undefined is returned
   */
  BaseNode.prototype._getChild = function(in_index) {
    let childEntry = this.children[in_index];

    return childEntry && this.nodeDependencyManager().getNode(childEntry.nodeRef, this._session);
  };

  /**
   * Splits the list of nodes according to the B-Tree rules
   * @param {Array<String>} in_childList -
   *     The children of this node
   *
   * @return {Array<{changeSet: HFDM.Property.SerializedChangeSet}>} -
   *     Array with the changeSets for the nodes after splitting
   */
  InternalNode.prototype._splitInternalNodesList = function(in_childList) {
    let order = this._session.bTreeParameters.bTreeOrder;
    let d = (order - 1) / 2 + 1;

    if (in_childList.length <= d) {
      return [{
        changeSet: this._encodeChildrenCS(in_childList),
        startPath: in_childList.length > 0 ? this._decodeCsChildEntry(in_childList[0]).startPath : undefined
      }];
    }

    let subNodes = [];
    let numSubNodes = Math.floor(in_childList.length / d);
    let remainder = in_childList.length % d;
    let remainderPerNode = Math.ceil(remainder / numSubNodes);
    let summedRemainder = 0;
    for (let i = 0; i < numSubNodes; i++) {
      let usedRemainder = Math.min(remainderPerNode, remainder - summedRemainder);
      summedRemainder += usedRemainder;
      let size = d  + usedRemainder;
      if (size > order) {
        throw new OperationError('Size was greater than order!', 'CreateCommit', HTTPStatus.INTERNAL_SERVER_ERROR);
      }
      subNodes.push(in_childList.splice(0, size));
    }
    if (in_childList.length > 0) {
      throw new OperationError('Children list was not empty', 'CreateCommit', HTTPStatus.INTERNAL_SERVER_ERROR);
    }

    return subNodes.map((children) => {
      return {
        changeSet: this._encodeChildrenCS(children),
        startPath: children.length > 0 ? this._decodeCsChildEntry(children[0]).startPath : undefined
      };
    });
  };

  InternalNode.prototype._getChildrenArrayFromCS = function(in_changeSet) {
    return in_changeSet['array<String>'].children.insert[0][1];
  };

  InternalNode.prototype.decodeCsChildren = function(in_changeSet) {
    let children = in_changeSet['array<String>'].children.insert[0][1];
    return children.map(InternalNode.prototype._decodeCsChildEntry);
  };

  InternalNode.prototype._encodeCsChildEntry = function(in_childEntry) {
    if (_.isString(in_childEntry)) {
      return in_childEntry;
    }
    if (in_childEntry.startPath !== undefined) {
      return  in_childEntry.nodeRef + '#' + in_childEntry.startPath;
    } else {
      return in_childEntry.nodeRef;
    }
  };

  InternalNode.prototype._encodeChildrenCS = function(in_children) {
    return {
      'array<String>': {
        children: {
          insert: [
            [0, in_children.map(InternalNode.prototype._encodeCsChildEntry) ]
          ]
        }
      }
    };
  };

  InternalNode.prototype._decodeCsChildEntry = function(in_entryString) {
    let index = in_entryString.indexOf('#');
    if (index === -1) {
      return {
        nodeRef: in_entryString,
        startPath: undefined
      };
    } else {
      return {
        nodeRef: in_entryString.substr(0, index),
        startPath: in_entryString.substr(index + 1)
      };
    }
  };


  /**
   * @inheritdoc
   */
  InternalNode.prototype._stateHandlers = {
    [NodeStatus.STARTED]: InternalNode.prototype._startedHandler,
    [NodeStatus.FETCHED]: InternalNode.prototype._fetchedHandler,
    [NodeStatus.INTERNAL_CHILDREN_STARTED]: InternalNode.prototype._childrenStartedHandler,
    [NodeStatus.INTERNAL_OUTERTMOST_CHILDREN_PROCESSED]: InternalNode.prototype._outermostChildProcessedHandler,
    [NodeStatus.INTERNAL_CHILDREN_PROCESSED]: InternalNode.prototype._childrenProcessedHandler,
    [NodeStatus.MERGE_REQUIRED]: InternalNode.prototype._mergeRequiredHandler,
    [NodeStatus.WAITING_FOR_MERGE]: InternalNode.prototype._waitingForMergeHandler,
    [NodeStatus.MERGED]: InternalNode.prototype._mergedHandler,
    [NodeStatus.WAITING_FOR_DELETE]: InternalNode.prototype._waitingForDeleteHandler
  };

  /**
   * @inheritdoc
   */
  BaseNode.prototype._siblingWaitStatus = NodeStatus.INTERNAL_CHILDREN_STARTED;

  module.exports = InternalNode;
})();

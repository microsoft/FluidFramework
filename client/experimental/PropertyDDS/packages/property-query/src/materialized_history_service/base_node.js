/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Base class B-Tree nodes
 */
(function() {
  const _ = require('lodash'),
      DeterministicGuidGenerator = require('../utils/deterministic_guid_generator'),
      OperationError = require('@fluid-experimental/property-common').OperationError,
      HTTPStatus = require('http-status'),
      parseNodeReference = require('../utils/node_refs').parseNodeReference,
      getBaseNodeRef = require('../utils/node_refs').getBaseNodeRef,
      ChangeSet = require('@fluid-experimental/property-changeset').ChangeSet,
      NodeDependencyManager = require('./node_dependency_manager'),
      stripReversibleChangeSet = require('../../src/materialized_history_service/change_set_processing/strip_reversible_changeset'),
      { compareChangeSetBoundaries } = require('./change_set_processing/chunk_change_set'),
      ModuleLogger = require('../utils/module_logger'),
      logger = ModuleLogger.getLogger('HFDM.MaterializedHistoryService.BaseNode');

  let NodeStatus = NodeDependencyManager.NodeStatus;

  /**
   * Base class for nodes
   *
   * @param {Object} in_params - options for the node
   * @param {HFDM.MaterializedHistoryService.ChangeSetProcessing.ChangeSetChunk} in_params.subtreeModification -
   *     Modification to apply to the subtree under the current node
   * @param {*} in_params.batch -
   *     Identifier for the write batch
   * @param {HFDM.MaterializedHistoryService.BaseNode|undefined} in_params.parent -
   *     Parent node
   * @param {Array<{startPath: String, nodeRef: String}>} in_params.siblings -
   *     Siblings of this node
   * @param {Number} in_params.childToWaitFor -
   *     Index of a child that should be processed when the node is loaded
   * @param {Number} in_params.indexInParent -
   *     Index of this node in the parents children array
   * @param {HFDM.MaterializedHistoryService.BTreeManager} in_params.btreeManager -
   *     The B-Tree manager
   * @param {HFDM.MaterializedHistoryService.NodeDependencyManager.Session} in_params.session -
   *     The current session
   * @param {String} in_params.ref -
   *     Reference for this node
   */
  let BaseNode = function(in_params) {
    this.subtreeModification = in_params.subtreeModification;
    this.batch = in_params.batch || in_params.parent.batch;
    this.newChildNodes = undefined;
    this.modifiedChildIndices = [];
    this.siblings = in_params.siblings || in_params.parent.children;

    // Tracks, whether the number of tree levels has changed
    this.levelChange = 0;

    this.childToWaitFor = in_params.childToWaitFor;
    this.indexInParent =  in_params.indexInParent;

    // This tracks the index inside of the leftmost subtree. If this node parent is not one of the leftmost nodes
    // this will be undefined
    if (in_params.parent) {
      this.indexInLefmostSubtree = in_params.parent.indexInLefmostSubtree === 0 ? in_params.indexInParent : undefined;
    } else {
      this.indexInLefmostSubtree = 0;
    }

    this._btreeManager = in_params.btreeManager || in_params.parent._btreeManager;
    this._session = in_params.session;
    this._ref = in_params.ref;

    this.nodeChangeSet = undefined;

    if (this._session.branchGuid && this._session.commitGuid) {
      this._guidGenerator = new DeterministicGuidGenerator(this._session.branchGuid, this._session.commitGuid);
    }
  };

  /**
   * Comparison function that sorts a list  ofchunk according to their startPath
   * @param {Object} chunk1 First chunk to compare
   * @param {Object} chunk2 Second chunk to compare
   * @return {Number} The comparison result of the startPath for the chunks (-1, 0, or 1)
   */
  BaseNode.startPathComparison = function(chunk1, chunk2) {
    return compareChangeSetBoundaries(chunk1.startPath, chunk2.startPath, true, true);
  };

  /**
   * @type {String} Name of nodes of this type. To be overwritten in derived classes
   */
  BaseNode.prototype.nodeTypeName = undefined;

  /**
   * Handler which is called after the node has been started. It fetches the node
   * from the database
   *
   * @return {HFDM.MaterializedHistoryService.NodeDependencyManager.NodeStatus} -
   *    The status of the node after processing this handler has finished
   */
  BaseNode.prototype._startedHandler = async function() {
    const nodeDefinition = await this._btreeManager._storage.get(this._ref);

    if (this._session.deleteWindow) {
      const { from, to } = this._session.deleteWindow;
      const subId = parseNodeReference(this._ref).subId;
      let delta;
      // The node may not exist if the reference was invalid. Assume it is COMPLETED
      if (nodeDefinition) {
        this.nodeChangeSet = await this._btreeManager._storage.getNodeChangeset(this._ref);
        delta = _.find(nodeDefinition.deltas, (x) => x.id === subId);
      }
      if (delta && from < delta.timestamp && delta.timestamp <= to) {
        // This node was created by this commit. Wait for the deletion of its children to delete it.
        return NodeStatus.WAITING_FOR_DELETE;
      } else {
        // Nothing to be done
        return NodeStatus.COMPLETED;
      }
    } else {
      // The result is cached from the previous get call
      // This is done now in order to force a NOT_FOUND error in case the ref is invalid
      this.nodeChangeSet = await this._btreeManager._storage.getNodeChangeset(this._ref);

      if (this.subtreeModification.changeSet !== undefined) {
        if (!nodeDefinition.branchGuid) {
          throw new OperationError('Node owning branch cannot be determined. Commit cannot be safely applied.',
            'CreateCommit', HTTPStatus.BAD_REQUEST, OperationError.FLAGS.QUIET);
        }
        if (this._session.branchGuid !== nodeDefinition.branchGuid) {
          // This means the node will have to be copied and the reference should be changed to a new one
          logger.trace(`Copying node '${this._ref}' as it's modified in branch '${this._session.branchGuid}'`);
          this._setNewNodes([{
            changeSet: this.nodeChangeSet,
            startPath: this.startPath,
            deltaCS: undefined,
            previousNodeRefs: [this._ref]
          }]);
        }
      }
    }

    return NodeStatus.FETCHED;
  };

  /**
   * Common implementation of the merge required handler. The derived classes provide
   * a callback to implement the actual merging of the node
   *
   * @param {Function} in_mergeCallback -
   *    Callback responsible for the actual merging operations
   * @return {HFDM.MaterializedHistoryService.NodeDependencyManager.NodeStatus} -
   *    The status of the node after processing this handler has finished
   */
  BaseNode.prototype._baseMergeRequiredHandler = async function(in_mergeCallback) {
    // Has this node itself been modified, or has it only been loaded to be merged
    // with a sibling?
    let directModification = this.subtreeModification.changeSet !== undefined;

    let previousSiblingNode = await this._getSibling(this.mergeNeeded && directModification, false,
      NodeStatus.WAITING_FOR_MERGE, !directModification);
    if (previousSiblingNode === undefined) {
      if (this.indexInLefmostSubtree === 0) {
        // We are in the leftmost node of the tree. Since we always merge with the
        // node to the left of the current node, we trigger loading of the next sibling
        // node here. The handler of the sibling node will merge it with this node
        await this._getSibling(this.mergeNeeded, true, NodeStatus.MERGE_REQUIRED);
        // TODO: Is true still needed here?
      }
    } else {
      // Determine whether this node needs to be merged
      let mergeNeeded = this.mergeNeeded || previousSiblingNode.mergeNeeded;

      if (!previousSiblingNode.mergeNeeded && !directModification) {
        mergeNeeded = false;
      }
      if (mergeNeeded) {
        if (previousSiblingNode._getStatus() > NodeStatus.WAITING_FOR_MERGE) {
          throw new OperationError('Merge needed but sibling node was past WAITING_FOR_MERGE', 'CreateCommit',
            HTTPStatus.INTERNAL_SERVER_ERROR);
        }

        in_mergeCallback(previousSiblingNode);
      }

      // Check whether this node still requires to be merged with the next node.
      // We usually merge with the node to the left of us, but if the result of
      // this merge is still smaller than the allowed minimum size (e.g. if both
      // nodes have been deleted), we need to continue merging to the right
      if (this.mergeNeeded) {
        await this._getSibling(this.mergeNeeded, true, NodeStatus.FETCHED);
      }
    }

    return NodeStatus.WAITING_FOR_MERGE;
  };

  /**
   * Handler which waits until the siblings have been processed so that merging
   * with them becomes possible
   *
   * @return {HFDM.MaterializedHistoryService.NodeDependencyManager.NodeStatus} -
   *    The status of the node after processing this handler has finished
   */
  BaseNode.prototype._waitingForMergeHandler = async function() {
    await this._getSibling(false, true, NodeStatus.WAITING_FOR_MERGE);

    return NodeStatus.MERGED;
  };

  /**
   * Deletes the node
   */
  BaseNode.prototype._baseDelete = async function() {
    const nodeSubId = parseNodeReference(this._ref).subId;
    const baseNodeRef = getBaseNodeRef(this._ref);
    const nodeDefinition = await this._btreeManager._storage.get(baseNodeRef);
    const deltaIndex = _.findIndex(nodeDefinition.deltas, (x) => x.id === nodeSubId);
    const previousDeltaIndex = _.findIndex(nodeDefinition.deltas, (x) => x.previousDeltaIndex === deltaIndex);

    if (previousDeltaIndex >= 0) {
      // Delete the delta and update the node
      const previousDelta = nodeDefinition.deltas[previousDeltaIndex];
      nodeDefinition.mainSubIndex = previousDelta.id;
      nodeDefinition.changeSet = await this._btreeManager._storage.getNodeChangeset(
        baseNodeRef + ':' + previousDelta.id);
      nodeDefinition.deltas.splice(deltaIndex, 1);
      // Old previous is now the latest delta
      delete previousDelta.previousDeltaIndex;
      // Fix all the remaining indices if needed
      nodeDefinition.deltas.forEach((d) => {
        if (d.previousDeltaIndex >= deltaIndex) {
          d.previousDeltaIndex--;
        }
      });
      nodeDefinition.timestamp = previousDelta.timestamp;
      this._btreeManager._storage.update(this.batch, baseNodeRef, nodeDefinition);
    } else {
      // No more deltas in this node. Deleting it
      // TODO: Implement batch support for deletions
      await this._btreeManager._storage.delete(baseNodeRef);
    }
  };

  /**
   * Returns a sibling of this node
   *
   * @param {Boolean} in_loadNodesIfNotAvailable -
   *     Should the sibling node be loaded, if it is not already procesing?
   * @param {Boolean} in_nextSibling -
   *     Should the sibling to the right be returned (if false the left sibling will be returned)
   * @param {HFDM.MaterializedHistoryService.NodeDependencyManager.NodeStatus} in_nodeStatus -
   *     The status the node has to reach before the returned promise resolves
   * @param {Boolean} in_skipCompleted -
   *     Do not return children of nodes that already have reached the COMPLETED status
   * @param {Number} [in_childToWaitFor] -
   *     Index of a child node which we want the processing to wait for
   *
   * @return {HFDM.MaterializedHistoryService.BaseNode|undefined} - The sibling node,
   *     if one could be found, or undefined otherwise
   */
  BaseNode.prototype._getSibling = async function(
    in_loadNodesIfNotAvailable,
    in_nextSibling,
    in_nodeStatus,
    in_skipCompleted,
    in_childToWaitFor) {

    let parent = this._getParent();

    let offset = in_nextSibling ? 1 : -1;
    let siblingIndex = this.indexInParent + offset;

    if (parent === undefined) {
      return undefined;
    }

    if (parent._getStatus() >= NodeStatus.INTERNAL_CHILDREN_PROCESSED) {
      throw new OperationError('Tried getting sibling but parent was past INTERNAL_CHILDREN_PROCESSED', 'CreateCommit',
        HTTPStatus.INTERNAL_SERVER_ERROR);
    }

    // If the index lies outside of the children of this node, we
    // have to retrieve a sibling of the parent to get to the child node
    if (siblingIndex < 0 ||
        siblingIndex >= parent.children.length) {
      parent = await parent._getSibling(in_loadNodesIfNotAvailable,
        in_nextSibling, parent._siblingWaitStatus, in_skipCompleted,
        in_nextSibling ? 0 : -1);

      // If the sibling of the parent doesn't exist, we also don't have a child node
      if (parent === undefined) {
        return undefined;
      }

      if (in_skipCompleted &&
        parent._getStatus() >= NodeStatus.INTERNAL_CHILDREN_PROCESSED) {
        return undefined;
      }

      // Update the sibling index
      siblingIndex = in_nextSibling ? 0 : parent.children.length - 1;
    }

    // Get the sibling node
    let siblingNode = parent._getChild(siblingIndex);

    // If processing for the sibling node has not yet been started
    // and the in_loadNodesIfNotAvailable flag has been set, we start
    // processing of the node
    if (siblingNode === undefined &&
        in_loadNodesIfNotAvailable) {
      siblingNode = parent._startChildNodeProcessing(siblingIndex, undefined, in_childToWaitFor);
    }

    // Wait for the sibling to reach the requested status
    if (siblingNode !== undefined) {
      await siblingNode._waitForStatus(in_nodeStatus);
    }

    return siblingNode;
  };

  /**
   * Writes all created internal nodes to the database
   * @param {function} in_newNodeCallback - A callback when a new node is created
   */
  BaseNode.prototype._writeNewNodes = async function(in_newNodeCallback) {
    let promises;

    this.newChildNodes = [];
    if (this.newNodes) {
      promises = this.newNodes.map( (newNode) => {
        return this._writeCSNode(newNode, in_newNodeCallback);
      });

      // Once all chunks have been written this node has finished its work
      let nodeReferences = await Promise.all(promises);

      for (let i = 0; i < this.newNodes.length; i++) {
        this.newChildNodes.push({
          startPath: this.newNodes[i].startPath,
          nodeRef: nodeReferences[i]
        });
      }
    }
  };

  BaseNode.prototype._writeCSNode = async function(in_nodeDefinition, in_newNodeCallback) {
    let nodeRef;

    let changeSet = in_nodeDefinition.changeSet;
    let deltaNodeCreated = false;
    if (in_nodeDefinition.deltaCS &&
        in_nodeDefinition.previousNodeRefs.length === 1 &&
        !in_nodeDefinition.splitNode) {
      // console.log('deltaCS was available');
      let originalNodeRef = getBaseNodeRef(in_nodeDefinition.previousNodeRefs[0]);
      let originalNode = await this._btreeManager._storage.get(originalNodeRef);

      if (originalNode === undefined ) {
        throw new OperationError('Original node was undefined!', 'CreateCommit', HTTPStatus.INTERNAL_SERVER_ERROR);
      }

      let originalNodeSize = JSON.stringify(originalNode).length;
      let deltaCS = JSON.stringify(in_nodeDefinition.deltaCS).length;

      let limitOfSubNodesNotExceeded = originalNode.deltas.length < this._session.bTreeParameters.maxNodeSubEntries;
      let nodeSizeDoesNotExceedLimit = originalNodeSize + deltaCS < this._session.bTreeParameters.chunkSize *
                                       this._session.bTreeParameters.maxNodeSizeFactor;
      if (nodeSizeDoesNotExceedLimit && limitOfSubNodesNotExceeded &&
          originalNode.branchGuid === this._session.branchGuid) {
        let newNode = originalNode;
        let previousSubId = parseNodeReference(in_nodeDefinition.previousNodeRefs[0]).subId;

        let reversedDeltaCs = new ChangeSet(in_nodeDefinition.deltaCS);
        reversedDeltaCs.toInverseChangeSet();
        stripReversibleChangeSet.call(reversedDeltaCs);
        // reversedDeltaCs._stripReversibleChangeSet()

        let lastDeltaChangeSetIndex = _.findIndex(newNode.deltas, (x) => x.id === previousSubId);

        if (lastDeltaChangeSetIndex === -1) {
          let { node, deltaIndex } =
            await this._btreeManager._storage.getNodeExpectingDelta(originalNodeRef, previousSubId, false);
          newNode = node;
          lastDeltaChangeSetIndex = deltaIndex;
        }

        const subId = this._guidGenerator.getNextGuid(previousSubId, true);
        const delta = {
          id: subId,
          changeSet: {},
          timestamp: Date.now()
        };
        // Deterministic writes: Check to see if this delta already exists
        let deltaIndex = _.findIndex(newNode.deltas, (x) => x.id === subId);
        if (deltaIndex > -1) {
          // Overwrite the existing delta
          newNode.deltas[deltaIndex] = delta;
        } else {
          // Push the new delta into the collection
          newNode.deltas.push(delta);
          deltaIndex = newNode.deltas.length - 1;
        }
        newNode.deltas[lastDeltaChangeSetIndex].changeSet = reversedDeltaCs.getSerializedChangeSet();
        newNode.deltas[lastDeltaChangeSetIndex].previousDeltaIndex = deltaIndex;

        newNode.changeSet = changeSet;
        newNode.mainSubIndex = subId;
        newNode.branchGuid = this._session.branchGuid;

        this._btreeManager._storage.update(
          this.batch,
          originalNodeRef,
          newNode,
          {
            originalNodeSize
          }
        );

        deltaNodeCreated = true;
        nodeRef = originalNodeRef + ':' + subId;
        global.deltaEncodedNodes = global.deltaEncodedNodes || 0;
        global.deltaEncodedNodes++;
      }
    }

    if (!deltaNodeCreated) {
      let parsedRef, guid;
      if (in_nodeDefinition.previousNodeRefs && in_nodeDefinition.previousNodeRefs.length > 0) {
        parsedRef = parseNodeReference(_.last(in_nodeDefinition.previousNodeRefs));
      } else {
        parsedRef = parseNodeReference(this._ref);
      }
      guid = parsedRef.subId || parsedRef.guid;
      const nodeId = this._guidGenerator.getNextGuid(guid, true);
      const subId = this._guidGenerator.getNextGuid(guid, true);
      // If we could not create a delta node, we create a new node
      let internalNodeData = {
        guid: nodeId,
        branchGuid: this._session.branchGuid,
        changeSet,
        deltas: [
          {
            id: subId,
            changeSet: {},
            timestamp: Date.now()
          }
        ]
      };
      nodeRef = this.nodeTypeName + ':' + internalNodeData.guid + ':' + subId;
      let baseNodeRef = this.nodeTypeName + ':' + internalNodeData.guid;

      if (in_newNodeCallback) {
        await in_newNodeCallback(baseNodeRef, internalNodeData, in_nodeDefinition);
      }

      this._btreeManager._storage.store(
        this.batch,
        baseNodeRef,
        internalNodeData
      );
    }

    return nodeRef;
  };

  /**
   * Returns the nodeDependencyManager that is managing this node
   *
   * @return {HFDM.MaterializedHistoryService.NodeDependencyManager} -
   *     the nodeDependencyManager
   */
  BaseNode.prototype.nodeDependencyManager = function() {
    return this._btreeManager._nodeDependencyManager;
  };

  /**
   * The parent of this node
   *
   * @return {HFDM.MaterializedHistoryService.BaseNode|undefiend} -
   *     The parent or undefined, if the node has no parent
   */
  BaseNode.prototype._getParent = function() {
    let nodeParentRef = this.nodeDependencyManager().getNodeParent(this._ref, this._session);
    if (nodeParentRef) {
      let parentData = this.nodeDependencyManager().getNode(nodeParentRef, this._session);
      return parentData;
    }

    return undefined;
  };

  /**
   * Get the processing state of this node
   *
   * @return {HFDM.MaterializedHistoryService.NodeDependencyManager.NodeStatus} -
   *     the processing state of this node
   */
  BaseNode.prototype._getStatus = function() {
    return this.nodeDependencyManager().getNodeStatus(this._ref, this._session);
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
    return undefined;
  };

  /**
   * Set the newNodes member of the list. This will also update the modifiedChildIndices
   * in the parent to indicate that this node has been modified.
   *
   * @param {Array<{startPath: String, nodeRef: String}>} in_newNodes -
   *     The new nodes that will replace this node after the tree has been updated
   */
  BaseNode.prototype._setNewNodes = function(in_newNodes) {
    if (!this.newNodes) {
      let parent = this._getParent();
      if (parent) {
        parent.modifiedChildIndices.push(this.indexInParent);
      }
    }

    this.newNodes = in_newNodes;
  };

  /**
   * Start processing of a child node. If the node is already being processed the existing
   * node object will be returned.
   *
   * @param {Number} in_nodeIndexInParent -
   *     Index of this node in the parents children array
   * @param {HFDM.MaterializedHistoryService.ChangeSetProcessing.ChangeSetChunk} in_subtreeModification -
   *     Modification to apply to the subtree under the current node
   * @param {Number} in_childToWaitFor -
   *     Index of a child that should be processed when the node is loaded
   *
   * @return {HFDM.MaterializedHistoryService.BaseNode}
   *     The created node for which processing has been started
   */
  BaseNode.prototype._startChildNodeProcessing = function(in_nodeIndexInParent,
    in_subtreeModification,
    in_childToWaitFor) {
    let stm = in_subtreeModification || {
      startPath: this.children[in_nodeIndexInParent].startPath,
      changeSet: undefined
    };

    // Check, whether we already are processing this node
    let childNodeRef = this.children[in_nodeIndexInParent].nodeRef;
    let nodeData = this.nodeDependencyManager().getNode(childNodeRef, this._session);
    if (!nodeData) {
      let newNodeData = {
        subtreeModification: stm,
        childToWaitFor: in_childToWaitFor,
        indexInParent: in_nodeIndexInParent
      };

      return this.nodeDependencyManager()._startNodeProcessing(childNodeRef, this._session, newNodeData, this);
    } else {
      return nodeData;
    }
  };

  /**
   * Wait until the processing of all child nodes has reached the COMPLETED state
   *
   * @return {Promise} This promise will resolve once all children have reached the COMPLETED status
   */
  BaseNode.prototype._waitForAllChildrenCompleted = function() {
    return this.nodeDependencyManager().waitForAllChildrenCompleted(this._ref, this._session);
  };

  /**
   * Wait until this node has reached the requested status
   *
   * @param {HFDM.MaterializedHistoryService.NodeDependencyManager.NodeStatus} in_status -
   *     The status the node has to reach before the returned promise resolves
   *
   * @return {Promise} This promise will resolve once the node has reached the in_status
   */
  BaseNode.prototype._waitForStatus = function(in_status) {
    return this.nodeDependencyManager().waitForNodeStatus(this._ref, this._session, in_status );
  };

  /**
   *  Map with state handlers for this node type. Has to be overwritten in derived node classes
   */
  BaseNode.prototype._stateHandlers = {};

  /**
   * Status that is used when waiting for siblings of this type
   */
  BaseNode.prototype._siblingWaitStatus = NodeStatus.MERGE_REQUIRED;

  module.exports = BaseNode;
})();

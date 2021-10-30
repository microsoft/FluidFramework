/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Manages the execution order of node updates
 */

const _ = require('lodash'),
    ModuleLogger = require('../utils/module_logger'),
    logger = ModuleLogger.getLogger('HFDM.MaterializedHistoryService.NodeDependencyManager'),
    parseNodeReference = require('../utils/node_refs').parseNodeReference,
    generateGUID = require('@fluid-experimental/property-common').GuidUtils.generateGUID,
    OperationError = require('@fluid-experimental/property-common').OperationError,
    HTTPStatus = require('http-status'),
    EventEmitter = require('events');

/**
 * This class manages the execution order of node updates
 */
let NodeDependencyManager = function() {
  this._sessions = {};
  this._nodeStatus = {};
  this._statusHandlers = {};
  this._nodeTypes = {};
  this._eventQueue = [];

  EventEmitter.call(this);
};

NodeDependencyManager.prototype = Object.create(EventEmitter.prototype);
NodeDependencyManager.prototype.constructor = NodeDependencyManager;

/**
 * Session object which provides the context for one update operation
 * @typedef {Object} HFDM.MaterializedHistoryService.NodeDependencyManager.Session
 */
/**
 * Possible processing states a node can be in
 */
NodeDependencyManager.NodeStatus = {
  STARTED: 0,                                // We have started processing of this node
  FETCHED: 1,                                // The node has been fetched from the database backend

  // States for internal nodes in the tree (nodes that have children)
  INTERNAL_CHILDREN_STARTED: 2,              // Processing of children for this node has started
  INTERNAL_OUTERTMOST_CHILDREN_PROCESSED: 3, // The outermose children of this node have finished processing
  INTERNAL_CHILDREN_PROCESSED: 4,            // All child nodes of this node have finished processing

  MERGE_REQUIRED: 5,          // This node violates the B-Tree condition and has to be merged with neighbours
  WAITING_FOR_MERGE: 6,                      // This node is waiting for a merge in the next node to be performed
  MERGED: 7,                                 // This node has been merged with previous nodes (if needed)

  WAITING_FOR_DELETE: 10,                    // This node is waiting to be deleted after its children are deleted

  COMPLETED: 100,                            // Processing of the node has been completed
  ERROR: 101                                 // Something really bad happened
};

/**
 * Register a node type with the node dependency manager
 * @param {String} in_nodeTypeName -
 *     Prefix that is used to identify nodes of this type
 * @param {Function} in_constructor -
 *     Constructor to instanciate a node of the given type
 */
NodeDependencyManager.prototype.registerNodeType = function(in_nodeTypeName, in_constructor) {
  this._nodeTypes[in_nodeTypeName] = in_constructor;
};

/**
 * Starts a new session
 * @param {Object} extra Additional information to be stored in the session
 * @return {HFDM.MaterializedHistoryService.NodeDependencyManager.Session}
 *     The new session object
 */
NodeDependencyManager.prototype.startSession = function(extra = {}) {
  let session;
  let sessionCompletedPromise = new Promise((resolve, reject) => {
    let guid = generateGUID();
    session = _.assign({
      guid: guid,
      resolve: resolve,
      reject: reject,
      pendingNodes: {},
      nodeStatus: {},
      failed: undefined,
      promise: undefined,
      pendingPromises: []
    }, extra);
    this._sessions[guid] = session;
  });

  session.promise = sessionCompletedPromise;
  return session;
};

/**
 * Sets the status for a currently processed node
 *
 * @param {HFDM.MaterializedHistoryService.BaseNode} in_node -
 *     The node for which the status should be updated
 * @param {HFDM.MaterializedHistoryService.NodeDependencyManager.NodeStatus} in_newStatus -
 *     The new status for the node
 * @param {String} [in_parentRef] -
 *     Reference to the parent node
 */
NodeDependencyManager.prototype._setNodeStatus = function(in_node,
  in_newStatus,
  in_parentRef) {
  let session = in_node._session;
  let nodeRef = in_node._ref;
  let nodeStatus = this._nodeStatus[nodeRef];
  const isCreateCommitSession = !session.deleteWindow;
  if (!nodeStatus) {
    this._nodeStatus[nodeRef] = {
      ref: nodeRef,
      session: session,
      status: undefined,
      statusListeners: [],
      data: in_node,
      children: [],
      parent: in_parentRef
    };
    nodeStatus = this._nodeStatus[nodeRef];
    session.nodeStatus[nodeRef] = nodeStatus;

    session.pendingNodes[nodeRef] = nodeStatus;

    if (in_parentRef) {
      let parent = this._nodeStatus[in_parentRef];
      parent.children.push(this._nodeStatus[nodeRef]);

      if (isCreateCommitSession) {
        if (parent.status >= NodeDependencyManager.NodeStatus.INTERNAL_CHILDREN_PROCESSED &&
          parent.status <= NodeDependencyManager.NodeStatus.COMPLETED) {
          throw new OperationError('Parent\'s status must be before INTERNAL_CHILDREN_PROCESSED', 'CreateCommit',
            HTTPStatus.INTERNAL_SERVER_ERROR);
        }
      }
    }
  } else {
    let parent = this._nodeStatus[nodeStatus.parent];

    if (isCreateCommitSession) {
      if (parent && parent.status >= NodeDependencyManager.NodeStatus.INTERNAL_CHILDREN_PROCESSED &&
        parent.status <= NodeDependencyManager.NodeStatus.COMPLETED) {
        throw new OperationError('Parent\'s status must be before INTERNAL_CHILDREN_PROCESSED', 'CreateCommit',
          HTTPStatus.INTERNAL_SERVER_ERROR);
      }
      if (in_newStatus >= NodeDependencyManager.NodeStatus.INTERNAL_CHILDREN_PROCESSED &&
        in_newStatus <= NodeDependencyManager.NodeStatus.COMPLETED) {
        for (let child of nodeStatus.children) {
          if (child.status < NodeDependencyManager.NodeStatus.COMPLETED) {
            throw new OperationError('Child\'s status must be COMPLETED', 'CreateCommit',
              HTTPStatus.INTERNAL_SERVER_ERROR);
          }
        }
      }
    }
  }
  // console.log('Setting ' + this.__getNodeName(in_nodeRef, in_session) + ' to status ' + in_newStatus);

  nodeStatus.status = in_newStatus;
  for (let i = 0; i < nodeStatus.statusListeners.length; i++) {
    let listener = nodeStatus.statusListeners[i];
    if (listener.minStatus <= in_newStatus) {
      listener.resolve();
      nodeStatus.statusListeners.splice(i, 1);
      i--;
    }
  }

  let handler = in_node._stateHandlers[in_newStatus];
  if (handler) {
    let currentPromise = Promise.resolve().then(() => {
      let event = this._eventQueue.pop();
      return event();
    });

    this._eventQueue.push(() => {
      return Promise.resolve().then(() => {
        if (session.failed) {
          logger.trace(`Early cancellation for ${in_node._ref} to ${in_newStatus}`);
          return Promise.resolve(NodeDependencyManager.NodeStatus.ERROR);
        } else {
          return handler.call(nodeStatus.data);
        }
      }).then((nextState) => {
        let promiseIndex = session.pendingPromises.indexOf(currentPromise);
        session.pendingPromises.splice(promiseIndex, 1);

        logger.trace(`Node ${in_node._ref} to ${in_newStatus} was succesful`);
        logger.trace(`Pending promise count: ${session.pendingPromises.length}`);
        // Even if we succeded, the session might have failed already
        if (session.pendingPromises.length === 0 && session.failed) {
          logger.trace('Rejecting session');
          session.reject(session.failed[0]);
        } else if (nextState !== undefined) {
          this._setNodeStatus(in_node, nextState);
        }
      }).catch((error) => {
        session.failed = session.failed || [];
        session.failed.push(error);

        let promiseIndex = session.pendingPromises.indexOf(currentPromise);
        session.pendingPromises.splice(promiseIndex, 1);

        logger.trace(`Node ${in_node._ref} to ${in_newStatus} failed!`);
        logger.trace(error);
        logger.trace(`Pending promise count: ${session.pendingPromises.length}`);
        if (session.pendingPromises.length === 0 && session.failed) {
          logger.trace('Rejecting session');
          session.reject(session.failed[0]);
        } else {
          // Mark as failed to unblock waiting nodes
          logger.trace('Setting error state');
          this._setNodeStatus(in_node, NodeDependencyManager.NodeStatus.ERROR);
        }
      });
    });
    // _.delay(() => { var event = this._eventQueue.pop(); event(); } );

    session.pendingPromises.push(currentPromise);
    this.emit('sessionEventQueued', session);
  }

  if (in_newStatus >= NodeDependencyManager.NodeStatus.COMPLETED) {
    // console.log('Deleted node: ' + this.__getNodeName(in_nodeRef, in_session));
    this._removeNodeFromSession(nodeRef, session);
    delete this._nodeStatus[nodeRef];
  }
};

/**
 * Debuging helper function which returns a human readable name for a node
 * @param {String} in_nodeRef -
 *     Reference to the node
 * @param {HFDM.MaterializedHistoryService.NodeDependencyManager.Session} in_session -
 *     The current session
 * @return {String} Human readable identifier for a node
 */
NodeDependencyManager.prototype.__getNodeName = function(in_nodeRef, in_session) {
  let pathToNode = [];
  let currentNodeRef = in_nodeRef;
  while (currentNodeRef) {
    let nodeData = this.getNode(currentNodeRef, in_session);
    currentNodeRef = this.getNodeParent(currentNodeRef, in_session);
    if (nodeData.indexInParent !== undefined) {
      pathToNode.unshift(nodeData.indexInParent);
    }
  }

  return in_nodeRef.substr(2, 8) +  ' [' + pathToNode.join() + ']';
};

/**
 * Wait until a node has readched at least the requested processing status
 * @param {String} in_nodeRef -
 *     Reference to the node
 * @param {HFDM.MaterializedHistoryService.NodeDependencyManager.Session} in_session -
 *     The current session
 * @param {HFDM.MaterializedHistoryService.NodeDependencyManager.NodeStatus} in_newStatus -
 *     The status the node has to reach before the returned promise resolves
 *
 * @return {Promise} This promise will resolve when the node has reached at least in_newStatus
 */
NodeDependencyManager.prototype.waitForNodeStatus = function(in_nodeRef, in_session, in_newStatus) {
  let nodeStatus = in_session.nodeStatus[in_nodeRef];
  return new Promise( (resolve, reject) => {
    let listener = {
      resolve,
      reject,
      minStatus: in_newStatus
    };

    if (nodeStatus.status >= in_newStatus) {
      if (nodeStatus.status >= NodeDependencyManager.NodeStatus.ERROR) {
        if (nodeStatus.session.failed) {
          reject(nodeStatus.session.failed[0]);
        } else {
          reject(new OperationError(`Awaited node '${in_nodeRef}' has failed`, 'CreateCommit',
            HTTPStatus.INTERNAL_SERVER_ERROR));
        }
      } else {
        resolve();
      }
    } else {
      nodeStatus.statusListeners.push(listener);
    }
  });
};

/**
 * Deletes a node from the current session
 * @param {String} in_nodeRef -
 *     Reference to the node
 * @param {HFDM.MaterializedHistoryService.NodeDependencyManager.Session} in_session -
 *     The current session
 */
NodeDependencyManager.prototype._removeNodeFromSession = function(in_nodeRef, in_session) {
  delete in_session.pendingNodes[in_nodeRef];

  // There are no longer any nodes which have not been fully updated,
  // so the session can be closed
  if (_.isEmpty(in_session.pendingNodes)) {
    if (in_session.failed) {
      in_session.reject(in_session.failed[0]);
    } else {
      in_session.resolve();
    }

    delete this._sessions[in_session.guid];
  }
};

/**
 * Get the node object for the supplied reference
 *
 * @param {String} in_nodeRef -
 *     Reference to the node
 * @param {HFDM.MaterializedHistoryService.NodeDependencyManager.Session} in_session -
 *     The current session
 * @return {HFDM.MaterializedHistoryService.BaseNode|undefined}
 *     The node object with the given reference or undefined if it does not exist
 */
NodeDependencyManager.prototype.getNode = function(in_nodeRef, in_session) {
  return in_session.nodeStatus[in_nodeRef] &&
          in_session.nodeStatus[in_nodeRef].data;
};

/**
 * Get the parent of a node
 * @param {String} in_nodeRef -
 *     Reference to the node
 * @param {HFDM.MaterializedHistoryService.NodeDependencyManager.Session} in_session -
 *     The current session
 * @return {String|undefined}
 *     Reference to the parent of the node or undefined if it does not exist
 */
NodeDependencyManager.prototype.getNodeParent = function(in_nodeRef, in_session) {
  return in_session.nodeStatus[in_nodeRef] &&
          in_session.nodeStatus[in_nodeRef].parent;
};

/**
 * Get the current processing status of the node
 *
 * @param {String} in_nodeRef -
 *     Reference to the node
 * @param {HFDM.MaterializedHistoryService.NodeDependencyManager.Session} in_session -
 *     The current session
 * @return {HFDM.MaterializedHistoryService.NodeDependencyManager.NodeStatus|undefined}
 *     Status of the node or undefined if the node does not exist
 */
NodeDependencyManager.prototype.getNodeStatus = function(in_nodeRef, in_session) {
  return in_session.nodeStatus[in_nodeRef] &&
          in_session.nodeStatus[in_nodeRef].status;
};

/**
 * Wait until all children of the node have reached the completed status
 *
 * @param {String} in_nodeRef -
 *     Reference to the node
 * @param {HFDM.MaterializedHistoryService.NodeDependencyManager.Session}  in_session -
 *     The current session
 *
 * @return {Promise} This promise will resolve once all children have reached the COMPLETED status
 */
NodeDependencyManager.prototype.waitForAllChildrenCompleted = function(in_nodeRef, in_session) {
  const waitFunction = () => {
    let node = in_session.nodeStatus[in_nodeRef];
    let pendingChildren = _.filter(node.children, (child) =>
      child.status < NodeDependencyManager.NodeStatus.COMPLETED
    );

    if (pendingChildren.length === 0) {
      return Promise.resolve();
    } else {
      // Wait until all children have reached the completed status
      return Promise.all(pendingChildren.map(
        (child) => this.waitForNodeStatus(child.ref, in_session, NodeDependencyManager.NodeStatus.COMPLETED))
      ).then(() => {
        // Once all children have reached the completed status, we have to check again,
        // since these children could have started processing of additional children
        return waitFunction();
      });
    }
  };

  return waitFunction();
};

/**
 * Starts processing of a node
 *
 * @param {String} in_nodeRef -
 *     Reference to the node
 * @param {HFDM.MaterializedHistoryService.NodeDependencyManager.Session} in_session -
 *     The current session
 * @param {Object} in_nodeData -
 *     Data to be passed to the node constructor
 * @param {HFDM.MaterializedHistoryService.BaseNode} [in_parentNode] -
 *     Parent node of the started node
 *
 * @return {HFDM.MaterializedHistoryService.BaseNode}
 *     The created node for which processing has been started
 */
NodeDependencyManager.prototype._startNodeProcessing = function(in_nodeRef,
  in_session,
  in_nodeData,
  in_parentNode) {

  let Constructor = this._nodeTypes[parseNodeReference(in_nodeRef).type];
  let node = new Constructor(_.extend({
    ref: in_nodeRef,
    session: in_session,
    parent: in_parentNode
  }, in_nodeData));

  // Start processing for this node
  this._setNodeStatus(node, NodeDependencyManager.NodeStatus.STARTED, in_parentNode && in_parentNode._ref);

  return node;
};

module.exports = NodeDependencyManager;

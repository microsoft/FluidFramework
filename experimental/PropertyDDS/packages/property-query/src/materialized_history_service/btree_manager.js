/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const _ = require('lodash');
const HTTPStatus = require('http-status');
const { ChangeSet } = require('@fluid-experimental/property-changeset');
const { OperationError } = require('@fluid-experimental/property-common');
const { parseNodeReference, getBaseNodeRef } = require('../utils/node_refs');
const LeafNode = require('./leaf_node');
const InternalNode = require('./internal_node');
const StorageManager = require('./storage_backends/storage_manager');

/**
 * Common class used to manage B-Tree specific logic
 */
class BTreeManager {
  /**
   * Constructor for this class
   * @param {Object} params Constructor parameters
   * @param {Object} storageManager StorageManager where to store created nodes
   * @param {Object} nodeDependencyManager Handles B-Tree updates
   */
  constructor(params) {
    this._storage = params.storageManager;
    this._nodeDependencyManager = params.nodeDependencyManager;

    // Register node handlers
    this._nodeDependencyManager.registerNodeType('l', LeafNode);
    this._nodeDependencyManager.registerNodeType('i', InternalNode);
  }

  /**
   * Creates the structure of a new B-Tree in storage
   * @param {*} in_batch - Identifier of the storage batch in which writes will be included
   * @param {Object} in_initialCS  - ChangeSet to be stored at the leaf level in the new B-Tree
   * @param {String} in_branchGuid - GUID of the branch that owns the B-Tree nodes. Used for branching.
   * @param {DeterministicGuidGenerator} in_guidGenerator - Used to generate GUIDs for the tree nodes.
   * @return {String}              - Storage reference for the root node of the tree
   * @private
   */
  createBTree(in_batch, in_initialCS, in_branchGuid, in_guidGenerator) {
    let leafGuid = in_guidGenerator.getNextGuid(in_branchGuid, true);
    let leafSubId = in_guidGenerator.getNextGuid(in_branchGuid, true);
    const now = Date.now();
    this._storage.store(in_batch, 'l:' + leafGuid, {
      guid: leafGuid,
      branchGuid: in_branchGuid,
      changeSet: in_initialCS,
      deltas: [{
        id: leafSubId,
        changeSet: {},
        timestamp: now
      }]
    });

    // Create the history info node for the initial leaf
    this._storage.store(in_batch, 'hi:' + leafGuid, {
      guid: leafGuid,
      branchGuid: in_branchGuid,
      levels: [
        {
          current: [{
            ref: 'l:' + leafGuid
          }],
          previous: []
        }
      ],
      previousNodeRefs: [],
      firstSubRef: leafSubId
    });

    // Create the root node of the tree
    let treeRootGuid = in_guidGenerator.getNextGuid(in_branchGuid, true);
    let treeRootSubId = in_guidGenerator.getNextGuid(in_branchGuid, true);
    this._storage.store(in_batch, 'i:' + treeRootGuid, {
      guid: treeRootGuid,
      branchGuid: in_branchGuid,
      changeSet: {
        'array<String>': {
          children: {
            insert: [
              [0, ['l:' + leafGuid + ':' + leafSubId]]
            ]
          }
        }
      },
      deltas: [{
        id: treeRootSubId,
        changeSet: {},
        timestamp: now
      }]
    });

    return 'i:' + treeRootGuid + ':' + treeRootSubId;
  }

  /**
   * Recursively traverse the B tree down to its leafs
   * @param {Array<Object>} in_startNodes - Nodes from where to start traversing.
   * @param {Object} in_params - Object containing parameters for this operation.
   * @param {Array<String>} [in_params.paths] - Paths to process during traversal. If empty all paths are processed.
   * May change during traversal.
   * @param {Array<Object>} [in_params.previousNodes] - Previous sibling nodes. Used only when getting changes.
   * @param {Number} in_params.treeLevelDifference - When bringing only changes, this is the difference of height
   * between the root and its previous node.
   * @param {Number} in_params.treeLevels - Height of the root node in the tree.
   * @param {Number} [in_params.pagingLimit] - Desired maximum size of the result. Enables chunking.
   * @param {Number} [in_params.pagingStartPath] - Path to start fetching from when chunking.
   * @param {Array<Array<String>>} [in_params.ranges] - Ranges of properties to bring with the request.
   * @param {Boolean} [in_params.directParent] - Whether the traversed tree is compared to its direct parent commit
   * or not. Used along previousNodes.
   * @param {Object} in_params.bTreeParameters - Parameters for the BTree of this branch
   * @param {Function} [in_params.convertPathFunction] - Function used to transform paths to boundaries.
   * If no function is provided, paths are assumed to be in chunk boundary format.
   * @return {Promise} Promise for the operation
   */
  traverseBTree(in_startNodes, in_params = {}) {
    let { paths, ranges, pagingLimit, pagingStartPath, nodeCallback, treeLevels,
      previousNodes, treeLevelDifference = 0, directParent, bTreeParameters,
      convertPathFunction } = in_params;

    convertPathFunction = convertPathFunction || ((path) => path);

    let maxLeafsToFetch;
    let traversalLevel = 0;
    let nextPagePath = undefined;

    // Convert all path parameters to the internal format used inside the materialized history
    if (pagingStartPath !== undefined) {
      pagingStartPath = convertPathFunction(pagingStartPath);
    }
    if (paths !== undefined) {
      let originalPaths = paths;
      paths = [];
      for (let i = 0; i < originalPaths.length; i++) {
        paths[i] = convertPathFunction(originalPaths[i]);
      }
    }
    if (ranges !== undefined) {
      let originalRanges = ranges;
      ranges = [];
      for (let i = 0; i < originalRanges.length; i++) {
        ranges[i] = [
          convertPathFunction(originalRanges[i][0]),
          convertPathFunction(originalRanges[i][1])
        ];
      }
    }

    let pathsAndRanges = (paths || []).concat(ranges || []);

    // TODO: Preprocessing: Remove paths inside of ranges, merge overlapping ranges

    if (pagingLimit) {
      let minChunkSize = bTreeParameters.chunkSize * bTreeParameters.mergeLimitFactor;
      maxLeafsToFetch = Math.ceil(pagingLimit / minChunkSize);
    }

    let filterNodes = (in_nodes) => {
      let childNodes = [];

      if (pathsAndRanges.length === 0) {
        for (let i = 0; i < in_nodes.length; i++) {
          let children = InternalNode.prototype.decodeCsChildren(in_nodes[i].changeSet);
          for (let j = 0; j < children.length; j++) {
            childNodes.push({
              nodeRef: children[j].nodeRef,
              startPath: children[j].startPath,
              endPath: children[j + 1] ? children[j + 1].startPath : in_nodes[i].endPath
            });
          }
        }
      } else {
        let nodeRefsMap = new Map();

        for (let i = 0; i < pathsAndRanges.length; i++) {
          let startPath, endPath;
          if (_.isString(pathsAndRanges[i])) {
            startPath = pathsAndRanges[i];
            endPath = undefined;
          } else {
            startPath = pathsAndRanges[i][0];
            endPath = pathsAndRanges[i][1];
          }
          let j = _.sortedIndex(
            in_nodes.map(
              // if the endpath is undefined, this means that it is supposed to be bigger than any other string,
              // Since we are comparing it with startPath we create a string that is larger than startPath by
              // adding an arbitrary string to it.
              (x) => x.endPath !== undefined ? x.endPath : startPath + 'Z'
            ),
            startPath
          );
          for (; j < in_nodes.length; j++) {
            if (in_nodes[j].endPath !== undefined &&
                startPath > in_nodes[j].endPath) {
              continue;
            }
            let nodeChildren = InternalNode.prototype.decodeCsChildren(in_nodes[j].changeSet);
            let firstChildIndex = _.sortedIndex(nodeChildren.slice(1).map((x) => x.startPath), startPath);

            if (nodeChildren.length > 0) {
              let firstStartPath = nodeChildren[0].startPath;
              if (endPath === undefined) {
                if (firstStartPath > startPath &&
                  firstStartPath.substr(0, startPath.length) !== startPath) {
                  break;
                }
              } else {
                if (firstStartPath > endPath) {
                  break;
                }
              }

              let currentPath;
              if (firstChildIndex < nodeChildren.length) {
                currentPath = (nodeChildren[firstChildIndex].startPath || '');
              }
              while (firstChildIndex < nodeChildren.length &&
                (endPath !== undefined ?
                  currentPath < endPath :
                  currentPath.substr(0, startPath.length) <= startPath
                )) {
                nodeRefsMap.set(nodeChildren[firstChildIndex].nodeRef, {
                  nodeIndex: j,
                  childIndex: firstChildIndex,
                  startPath: nodeChildren[firstChildIndex].startPath,
                  endPath: nodeChildren[firstChildIndex + 1] ?
                    nodeChildren[firstChildIndex + 1].startPath :
                    in_nodes[j].endPath,
                  nodeRef: nodeChildren[firstChildIndex].nodeRef
                });

                firstChildIndex++;

                if (firstChildIndex < nodeChildren.length) {
                  currentPath = nodeChildren[firstChildIndex].startPath || '';
                }
              }
            }
          }
        }
        childNodes = Array.from(nodeRefsMap.values());
        childNodes.sort((a, b) => {
          if (a.nodeIndex === b.nodeIndex ) {
            return a.childIndex - b.childIndex;
          } else {
            return a.nodeIndex - b.nodeIndex;
          }
        });
      }

      return childNodes;
    };

    const traversalFunction = (in_nodes, in_previousNodes, in_treeLevelDifference) => {
      let childNodes = in_nodes,
          previousChildNodes = in_previousNodes,
          thisTreeLevelDifference = in_treeLevelDifference;
      if (nodeCallback) {
        _.forEach(in_nodes, (node) => nodeCallback(node, traversalLevel));
      }
      if (thisTreeLevelDifference >= 0) {
        childNodes = filterNodes(in_nodes);
      } else {
        childNodes = [];
      }

      if (previousNodes && thisTreeLevelDifference <= 0) {
        previousChildNodes = filterNodes(in_previousNodes);

        // Filter out nodes which have not been changed in this changeSet
        for (let i = 0; i < childNodes.length; i++) {
          let previousNodeIdx = _.findIndex(previousChildNodes, (x) => x.nodeRef === childNodes[i].nodeRef);
          if (previousNodeIdx !== -1) {
            childNodes.splice(i, 1);
            previousChildNodes.splice(previousNodeIdx, 1);
            i--;
          }
        }
      } else {
        previousChildNodes = [];
      }

      // If the user requested the result to be paged,
      // we have to filter accordingly
      if (pagingLimit !== undefined) {
        if (previousNodes) {
          // Should be HTTPStatus.NOT_IMPLEMENTED, but server errors could make this server get killed
          throw new OperationError('Chunking is currently not supported when requesting a changeSet', 'GetCommit',
            HTTPStatus.BAD_REQUEST, OperationError.FLAGS.QUIET);
        }

        let order = bTreeParameters.bTreeOrder;
        let d = (order - 1) / 2 + 1;
        let levelsToLeafsRemaining = treeLevels - traversalLevel - 1;
        let minLeafsPerChild = Math.pow(d, levelsToLeafsRemaining);

        let maxNeededNodes = Math.ceil(maxLeafsToFetch / minLeafsPerChild);

        // Find the first chunk to keep
        let chunkStart = 0;
        if (pagingStartPath !== undefined) {
          for (let i = 0; i < childNodes.length - 1; i++) {
            if (childNodes[i + 1] !== undefined &&
                childNodes[i + 1].startPath > pagingStartPath) {
              break;
            }
            chunkStart++;
          }
        }
        let nodesToKeep = Math.min(maxNeededNodes, childNodes.length - chunkStart) + 1;

        if (chunkStart + nodesToKeep < childNodes.length) {
          if (childNodes[chunkStart + nodesToKeep]) {
            nextPagePath =  childNodes[chunkStart + nodesToKeep].startPath;
          } else {
            nextPagePath =  childNodes[chunkStart + nodesToKeep - 1].endPath;
          }
        }
        childNodes = childNodes.slice(chunkStart, chunkStart + nodesToKeep);
      }

      let childNodesToFetch = childNodes;
      if (previousChildNodes.length > 0) {
        let fetchingLeafs = parseNodeReference(previousChildNodes[0].nodeRef).type === 'l';
        if (!fetchingLeafs) {
          childNodesToFetch = childNodesToFetch.concat(previousChildNodes);
        }
      }

      // Get all child nodes
      return Promise.all(childNodesToFetch.map((x) => {
        if (previousNodes && parseNodeReference(x.nodeRef).type === 'l') {
          return this._getNodeDeltaChangeset(x, previousChildNodes, directParent);
        } else {
          return this._storage.getNodeChangeset(x.nodeRef);
        }
      })).then((nodeChangeSets) => {
        if (childNodes.length === 0 && thisTreeLevelDifference >= 0) {
          return {
            nodes: [],
            chunkBoundaries: [],
            nextPagePath: undefined
          };
        }

        let nodes = _.map(nodeChangeSets, (x, i) => {
          let originalNode = i < childNodes.length ? childNodes[i] : previousChildNodes[i - childNodes.length];
          return {
            changeSet: x,
            ref: originalNode.nodeRef,
            endPath: originalNode.endPath
          };
        });
        let nextPreviousNodes = nodes.splice(childNodes.length);

        // If the trees have different depths, we keep the
        // original children from one of the trees, until we
        // have fetched the additional levels of the other tree
        if (thisTreeLevelDifference < 0) {
          nodes = in_nodes;
          thisTreeLevelDifference++;
        }
        if (thisTreeLevelDifference > 0) {
          nextPreviousNodes = in_previousNodes;
          thisTreeLevelDifference--;
        }

        // Check whether we reached the leafs
        if (parseNodeReference(nodes[0].ref).type === 'l') {
          return {
            nodes,
            chunkBoundaries: _.map(childNodes, 'startPath'),
            nextPagePath
          };
        } else {
          // Otherwise continue the traversal
          traversalLevel++;
          return traversalFunction(nodes, nextPreviousNodes, thisTreeLevelDifference);
        }
      });
    };

    return traversalFunction(in_startNodes, previousNodes, treeLevelDifference);
  }

  /**
   * Gets the changeSet of a node calculating its delta with respect
   * @param {Object} in_nodeInfo Node to calculate the delta for
   * @param {Array<Object>} in_previousNodes Previous sibling nodes, used to calculate delta
   * @param {Boolean} [in_directParent] Whether the traversed tree is compared to its direct parent commit
   * or not. Used along previousNodes.
   */
  async _getNodeDeltaChangeset(in_nodeInfo, in_previousNodes, in_directParent) {
    let startIndex = _.sortedIndexBy(in_previousNodes, in_nodeInfo, (x) => x.startPath || '');
    if (startIndex === in_previousNodes.length ||
        in_previousNodes[startIndex].startPath !== in_nodeInfo.startPath) {
      startIndex--;
    }
    let endIndex = startIndex;
    while (in_previousNodes[endIndex].endPath !== undefined &&
            in_previousNodes[endIndex].endPath < in_nodeInfo.endPath) {
      endIndex++;
    }
    endIndex++;
    let overlappingPreviousNodes = in_previousNodes.slice(startIndex, endIndex);
    let nodeBaseRef = getBaseNodeRef(in_nodeInfo.nodeRef);

    // Check whether we have a previousNode, which has the same baseID
    let correspondingPreviousNode = _.find(overlappingPreviousNodes, (x) => getBaseNodeRef(x.nodeRef) === nodeBaseRef);
    if (correspondingPreviousNode) {
      // The changeSet is contained inside of one node, so we can fetch that node
      return await this._storage.getNodeChangeset(in_nodeInfo.nodeRef, false,
        StorageManager.ChangeSetType.INDIVIDUAL_CHANGESET);
    } else {
      if (in_directParent) {
        // The changeSet is inbetween two different nodes, so we have to fetch the corresponding history node
        let historyNodeRef = 'h' + nodeBaseRef.substr(1) + '#' +
                              parseNodeReference(overlappingPreviousNodes[0].nodeRef).guid;
        let historyNode = await this._storage.get(historyNodeRef);
        return historyNode.changeSet;
      } else {
        if (overlappingPreviousNodes.length !== 1) {
          throw new OperationError('There must be exactly one overlapping previous node!', 'GetNodeDeltaCS',
            HTTPStatus.INTERNAL_SERVER_ERROR);
        }
        let startLeafNodeGuid = parseNodeReference(overlappingPreviousNodes[0].nodeRef).guid;
        let endLeafNodeGuid   = parseNodeReference(in_nodeInfo.nodeRef).guid;

        // We want to get the history between two leaf nodes. For this, we first have to find
        // the sequence of shortcut links in the hierarchical history between the two leaf nodes.
        // We do this by comparing the hierarchical history nodes between the two leaf nodes. If an node
        // is in the history of both nodes, we know that the node in the history behind this common node
        // lies in between the two nodes. So we add the history up to this history node to the history sequence and then
        // continue recursively from this history node

        // First we get the history nodes for the start and end commit
        let [startCommitHistoryNode, endCommitHistoryNode] = await Promise.all([
          this._storage.get('hi:' + startLeafNodeGuid),
          this._storage.get('hi:' + endLeafNodeGuid)
        ]);
        if (!startCommitHistoryNode || !endCommitHistoryNode) {
          throw new OperationError('Invalid hierarchical history. Start and end node must exist.', 'GetNodeDeltaCS',
            HTTPStatus.INTERNAL_SERVER_ERROR);
        }

        let historySequence = [_.last(endCommitHistoryNode.levels[0].current)];
        let converged = true;
        do {
          let commonLeafNode = undefined;

          // Find a common leaf node in the histories of both nodes
          // We search the available levels upwards, until we find a leaf node reference
          // that is shared by both nodes
          for (let i = 0; i < endCommitHistoryNode.levels.length && !commonLeafNode; i++) {
            let startLevel = Math.min(i, startCommitHistoryNode.levels.length - 1);

            let currentEndEntries = endCommitHistoryNode.levels[i].current;
            let currentStartEntries = startCommitHistoryNode.levels[startLevel].current;
            for (let j = currentEndEntries.length - 1; j >= 0 && !commonLeafNode; j--) {
              let nodeRef = currentEndEntries[j].ref;
              for (let k = 0; k < currentStartEntries.length; k++) {
                if (currentStartEntries[k].ref === nodeRef) {
                  commonLeafNode = {
                    level: i,
                    startIdx: k,
                    endIdx: j,
                    ref: nodeRef,
                    startLevel
                  };
                  break;
                }
              }
            }
          }

          if (!commonLeafNode) {
            throw new OperationError('Invalid hierarchical history. Could not find common leaf node.', 'CreateCommit',
              HTTPStatus.INTERNAL_SERVER_ERROR);
          }

          // Add all entries between the common leaf node and the end leaf node into the history sequence
          let currentNodes;
          for (let i = 0; i < commonLeafNode.level; i++) {
            currentNodes = endCommitHistoryNode.levels[i].current;
            currentNodes = currentNodes.slice(0, currentNodes.length - 1);

            historySequence.unshift.apply(historySequence, currentNodes);
          }
          let currentNodesStartIndex = (commonLeafNode.ref === ('l:' + startLeafNodeGuid) ?
            commonLeafNode.endIdx :
            commonLeafNode.endIdx + 1);

          currentNodes = endCommitHistoryNode.levels[commonLeafNode.level].current;
          currentNodes = currentNodes.slice(currentNodesStartIndex, currentNodes.length - 1);
          historySequence.unshift.apply(historySequence, currentNodes);

          // Now we need to search through the lists of previous nodes to see,
          // whether we have a common previous node
          let commonPreviousLeafNode = undefined;
          for (let i = 0; i < commonLeafNode.level && !commonPreviousLeafNode; i++) {
            let startLevel = Math.min(i, startCommitHistoryNode.levels.length - 1);

            let previousEndEntries = endCommitHistoryNode.levels[i].previous;
            let currentStartEntries = startCommitHistoryNode.levels[startLevel].current;
            for (let j = previousEndEntries.length - 1; j >= 0 && !commonPreviousLeafNode; j--) {
              let nodeRef = previousEndEntries[j].ref;
              for (let k = 0; k < currentStartEntries.length; k++) {
                if (currentStartEntries[k].ref === nodeRef) {
                  commonPreviousLeafNode = {
                    level: i,
                    startIdx: k,
                    endIdx: j,
                    ref: nodeRef
                  };
                  break;
                }
              }
            }
          }

          if (commonPreviousLeafNode) {
            let previousNodesStartIndex = (commonPreviousLeafNode.ref === ('l:' + startLeafNodeGuid) ?
              commonPreviousLeafNode.endIdx :
              commonPreviousLeafNode.endIdx + 1);

            let previousNodes = endCommitHistoryNode.levels[commonPreviousLeafNode.level].previous;
            previousNodes = previousNodes.slice(previousNodesStartIndex, previousNodes.length - 1);
            historySequence.unshift.apply(historySequence, previousNodes);
          }


          converged = historySequence[0].ref === 'l:' + startLeafNodeGuid;

          if (!converged) {
            endCommitHistoryNode = await this._storage.get('hi:' + parseNodeReference(historySequence[0].ref).guid);
            if (!endCommitHistoryNode) {
              throw new OperationError('Invalid history information. Could not find history info node.', 'CreateCommit',
                HTTPStatus.INTERNAL_SERVER_ERROR);
            }
          }
        } while (!converged);

        // Now we need to fetch all history nodes according to the history sequence
        let nodes = await Promise.all(_.map(historySequence.slice(1), (endNode, idx) => {
          let startNode = historySequence[idx];
          return this._storage.get('h:' + parseNodeReference(endNode.ref).guid + '#' +
                                          parseNodeReference(startNode.ref).guid);
        }));

        // Squash all history nodes
        let resultCS = new ChangeSet();
        _.forEach(nodes, (x) => resultCS.applyChangeSet(x.changeSet));

        return resultCS.getSerializedChangeSet();
      }
    }
  }

  /**
   * Creates a new B-Tree update session and starts processing the root node of the tree.
   * @param {Object} sessionParams Parameters used to initialize the session
   * @param {String} [sessionParams.branchGuid] Branch guid for a commit session
   * @param {String} [sessionParams.commitGuid] Commit guid for a commit session
   * @param {Object} [sessionParams.deleteWindow] Marks a time window for a delete session
   * @param {Function} [sessionParams.pathBuilder] Function used to build chunk boundary paths
   * @param {Function} [sessionParams.sortKeyEncoder] Function used to encode a key for sorting
   * @param {String} [sessionParams.bTreeParameters] Parameters for this B-Tree. If not provided, defaults are assumed
   * @param {String} rootNodeRef Node ref for the root of the tree
   * @param {Object} changeSet Change set containing the data to be applied to the tree
   * @param {String} batch Write batch to be used
   * @return {Promise<Object>} Results in the root node of the tree after processing the update
   */
  async updateBTree(sessionParams, rootNodeRef, changeSet, batch) {
    sessionParams.bTreeParameters = sessionParams.bTreeParameters || BTreeManager.ORIGINAL_BTREE_PARAMETERS;
    const session = this._nodeDependencyManager.startSession(sessionParams);
    this._nodeDependencyManager._startNodeProcessing(rootNodeRef, session, {
      subtreeModification: {
        startPath: undefined,
        changeSet
      },
      batch,
      siblings: [{
        nodeRef: rootNodeRef
      }],
      btreeManager: this
    });
    await session.promise.catch((ex) => {
      this._storage.clearWriteBatch(batch);
      return Promise.reject(ex);
    });
    return this._nodeDependencyManager.getNode(rootNodeRef, session);
  }
}

BTreeManager.ORIGINAL_BTREE_PARAMETERS = {
  chunkSize: 16384,
  initialChunkSizeFactor: 1.0,
  splitLimitFactor: 4.0,
  mergeLimitFactor: 0.6,
  maxNodeSizeFactor: 8,
  maxNodeSubEntries: 30,
  bTreeOrder: 15,
  nodesPerHierarchicalHistoryLevel: 3
};

module.exports = BTreeManager;

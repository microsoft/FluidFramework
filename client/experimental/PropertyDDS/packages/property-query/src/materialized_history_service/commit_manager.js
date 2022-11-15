/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint max-nested-callbacks: ["error", 5]*/
/**
 * @fileoverview Code that is related to commit management
 */

const _ = require('lodash');
const ModuleLogger = require('../utils/module_logger');
const logger = ModuleLogger.getLogger('MaterializedHistoryService.CommitManager');
const { mergeChunkedChangeSet } = require('./change_set_processing/merge_chunked_changeset');
const { chunkChangeSet, convertPathToChunkBoundaryFormat, getPathFromChunkBoundaryFormat } =
      require('./change_set_processing/chunk_change_set');
const { Utils, PathHelper } = require('@fluid-experimental/property-changeset');
const InternalNode = require('./internal_node');
const { getEncodedTemplates, getDecodedTemplates } = require('../utils/template_conversion');
const { OperationError } = require('@fluid-experimental/property-common');
const HTTPStatus = require('http-status');
const BTreeManager = require('./btree_manager');
const ChangeSet = require('@fluid-experimental/property-changeset').ChangeSet;
const MockAsyncContext = require('../utils/mock_async_context');

/**
 * This class contains all code needed to create new commits
 */
class CommitManager {
  /**
   * Constructor for this class
   * @param {Object} params Function parameters
   * @param {Object} params.storageManager Storage manager used to store the materialized history
   * @param {Object} params.settings The this._settings object
   * @param {Object} params.serializer The serializer
   * @param {Object} params.systemMonitor The system monitor to use
   * @param {Object} params.indexManager Index manager to which index-related operations are delegated
   * @param {BTreeManager} params.btreeManager Manager that deals with shared B-tree related functionality
   */
  constructor(params) {
    this._storage = params.storageManager;
    this._settings = params.settings;
    this._serializer = params.serializer;
    this._systemMonitor = params.systemMonitor;
    this._asyncContext = params.asyncContext || new MockAsyncContext;
    this._indexManager = params.indexManager;
    this._btreeManager = params.btreeManager;
  }

  /**
   * Create a new commit
   * @param {Object} in_params                - The parameters
   * @param {String} in_params.guid           - The guid of the commit
   * @param {Object} in_params.meta           - Commit meta data
   * @param {String} in_params.branchGuid     - The GUID of the branch
   * @param {String} in_params.parentGuid     - The GUID of the parent
   * @param {String} in_params.changeSet      - The changeSet of the commit
   * @param {String} in_params.created        - Creation date of the commit
   * @param {Object} in_params.options        - Additional options for the operation
   * @param {Boolean} in_params.options.force - When set to true, consistency checks are disabled
   * @return {Object} - The branch information
   */
  createCommit(in_params) {
    // Make sure the changeset is a non-reversible changeset
    let inputCS = new ChangeSet(in_params.changeSet);
    inputCS._stripReversibleChangeSet();
    in_params.changeSet = inputCS.getSerializedChangeSet();

    return this._systemMonitor.startBackgroundTransaction('CreateCommit', async () => {
      this._systemMonitor.addCustomAttributes({
        commitGuid: in_params.guid,
        branchGuid: in_params.branchGuid,
        byteSize: _.isString(in_params.changeSet) ?
          Buffer.byteLength(in_params.changeSet) :
          Buffer.byteLength(JSON.stringify(in_params.changeSet))
      });

      return this._asyncContext.runInNewContext(async () => {
        logger.trace('Beginning to create commit', in_params.guid);
        let requests = [
          this._storage.get('branch:' + in_params.branchGuid),
          this._storage.get('commit:' + in_params.parentGuid, true),
          this._storage.get('commitTemplates:' + in_params.parentGuid, true)
        ];

        const force = in_params.options && in_params.options.force;
        let parentCommit, parentCommitTemplates, branch;
        let batch, changeSet, templatesCS;

        let originalBranchSize;

        return Promise.all(requests).then( ([in_branch, in_parentCommit, in_parentCommitTemplates]) => {
          logger.trace('Done fetching branch for commit', in_branch, in_params.guid);
          logger.trace('Done fetching parent commit for commit', in_parentCommit, in_params.guid);
          branch = in_branch;
          parentCommit = in_parentCommit;
          parentCommitTemplates = in_parentCommitTemplates;
          originalBranchSize = Buffer.byteLength(this._serializer.serialize(in_branch));

          if (branch === undefined) {
            throw new OperationError('Branch does not exist!', 'CreateCommit', HTTPStatus.NOT_FOUND,
              OperationError.FLAGS.QUIET);
          }
          if (parentCommit === undefined) {
            throw new OperationError('Parent commit does not exist!', 'CreateCommit', HTTPStatus.NOT_FOUND,
              OperationError.FLAGS.QUIET);
          }
          if (branch.headCommitGuid !== in_params.parentGuid && !force) {
            throw new OperationError(`Parent is not the head of the branch. Expected ${branch.headCommitGuid}, got ` +
              in_params.parentGuid, 'CreateCommit', HTTPStatus.BAD_REQUEST, OperationError.FLAGS.QUIET);
          }
          if (!parentCommitTemplates) {
            throw new OperationError('Branch does not define template information', 'CreateCommit',
              HTTPStatus.BAD_REQUEST, OperationError.FLAGS.QUIET);
          }
        }).then(async () => {
          batch = this._storage.startWriteBatch();
          if (_.isString(in_params.changeSet)) {
            changeSet = JSON.parse(in_params.changeSet);
          } else {
            if (branch.indices && Object.keys(branch.indices).length > 0) {
              // In this case we cannot alias the provided object, because it will be modified by the
              // update of the main B-Tree and the index update will receive an altered changeSet.
              changeSet = JSON.parse(JSON.stringify(in_params.changeSet));
            } else {
              // If there are no indices, we can directly alter the provided changeSet
              changeSet = in_params.changeSet;
            }
          }
          templatesCS = getEncodedTemplates(changeSet);
          return await this._systemMonitor.startSegment('B-Tree update', true, async () => {
            return await Promise.all([
              this._btreeManager.updateBTree({
                branchGuid: in_params.branchGuid,
                commitGuid: in_params.guid,
                bTreeParameters: branch.bTreeParameters
              }, parentCommit.rootNodeRef, changeSet, batch),
              this._btreeManager.updateBTree({
                branchGuid: in_params.branchGuid,
                commitGuid: in_params.guid,
                bTreeParameters: branch.bTreeParameters
              }, parentCommitTemplates.rootNodeRef, templatesCS, batch)
            ]);
          });
        }).then(async ([rootNode, templatesRootNode]) => {
          if (!rootNode) {
            throw new OperationError(
              `Error writing commit ${in_params.guid} in branch ${in_params.branchGuid}, rootNode did not exist`,
              'GetCommit', HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET
            );
          }

          let newRootNode = rootNode.newParentNode || rootNode.newChildNodes[0];
          let levelChange = rootNode.levelChange || 0;

          // Wait for the nodes batch processing to be completed
          // This prevents inconsistencies in case writes are interrupted halfway through
          await this._systemMonitor.startSegment('Storage: Finish B-tree update batches', true, async () => {
            await this._storage.finishWriteBatch(batch);
          });

          // Start a new batch for commit creation and branch update
          batch = this._storage.startWriteBatch();

          // Create the root commit object
          let createdDate = in_params.created ? new Date(in_params.created) : new Date();
          let newCommit = {
            guid: in_params.guid,
            branchGuid: in_params.branchGuid,
            meta: in_params.meta,
            created: createdDate.toISOString(),
            timestamp: Date.now(),
            sequence: parentCommit.sequence + 1,
            parentGuid: parentCommit.guid,
            rootNodeRef: newRootNode.nodeRef,
            treeLevels: parentCommit.treeLevels + levelChange
          };

          // Create the commit templates object
          if (!templatesRootNode) {
            throw new OperationError(`Error writing commit ${in_params.guid} in branch ${in_params.branchGuid}, ` +
              'templatesRootNode did not exist', 'GetCommit', HTTPStatus.NOT_FOUND, OperationError.FLAGS.QUIET
            );
          }

          const newTemplatesRootNode = templatesRootNode.newParentNode || templatesRootNode.newChildNodes[0];
          const templatesLevelChange = templatesRootNode.levelChange || 0;
          const newCommitTemplates = {
            branchGuid: in_params.branchGuid,
            parentGuid: parentCommit.guid,
            rootNodeRef: newTemplatesRootNode.nodeRef,
            treeLevels: parentCommitTemplates.treeLevels + templatesLevelChange
          };
          this._storage.store(batch, 'commitTemplates:' + newCommit.guid, newCommitTemplates);
          this._storage.store(batch, 'commit:' + newCommit.guid, newCommit);

          branch.headCommitGuid = newCommit.guid;
          branch.headSequenceNumber = newCommit.sequence;

          let results = await this._indexManager.updateBranchIndices({
            commit: {
              guid: in_params.guid,
              branchGuid: in_params.branchGuid,
              parentGuid: parentCommit.guid,
              changeSet: _.isString(in_params.changeSet) ? JSON.parse(in_params.changeSet) : in_params.changeSet
            },
            inBatch: {
              branch,
              batch
            }
          });

          // Update the branch object
          this._storage.update(batch, 'branch:' + branch.guid, branch, {
            originalNodeSize: originalBranchSize
          });

          await this._systemMonitor.startSegment('Storage: Finish commit and branch update batches', true, async () => {
            await this._storage.finishWriteBatch(batch);
          });
          logger.trace('Done creating commit', in_params.guid);

          this._systemMonitor.addCustomAttributes(this._asyncContext.getDBStats());

          return {status: 'ok'};
        });
      });
    });
  }

  /**
   * Get meta information for a commit
   * @param {String} in_commitGuid - The guid of the commit
   * @return {Object} - The branch information
   */
  async getCommit(in_commitGuid) {
    let commit;
    await this._systemMonitor.startSegment('Storage: Get Commit', true, async () => {
      commit = await this._storage.get('commit:' + in_commitGuid);
    });

    if (commit === undefined) {
      throw new OperationError('Commit does not exist!', 'GetCommit', HTTPStatus.NOT_FOUND,
        OperationError.FLAGS.QUIET);
    }
    return {
      commit
    };
  }

  /**
   * Joins the given paths by tokenizing and concatenating them. Last element of first path
   * and first element of second path are not included in the result.
   * @param {String} in_path1 First path to join
   * @param {String} in_path2 Second path to join
   * @return {String} Joined path
   */
  _joinPaths(in_path1, in_path2) {
    let types1 = [],
        types2 = [];
    let tokens1 = PathHelper.tokenizePathString(in_path1, types1),
        tokens2 = PathHelper.tokenizePathString(in_path2, types2);

    while (tokens2.length > 0 && types2[0] === PathHelper.TOKEN_TYPES.RAISE_LEVEL_TOKEN) {
      tokens1.splice(tokens1.length - 1);
      types1.splice(types1.length - 1);

      tokens2.splice(0, 1);
      types2.splice(0, 1);
    }

    let finalTokens = tokens1.concat(tokens2);
    let finalTypes = types1.concat(types2);

    let result = '';
    for (let i = 0; i < finalTokens.length; i++) {
      switch (finalTypes[i]) {
        case PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN:
          if (result.length === 0) {
            result = PathHelper.quotePathSegmentIfNeeded(finalTokens[i]);
          } else {
            result += '.' + PathHelper.quotePathSegmentIfNeeded(finalTokens[i]);
          }
          break;
        case PathHelper.TOKEN_TYPES.ARRAY_TOKEN:
          result += '[' + PathHelper.quotePathSegmentIfNeeded(finalTokens[i]) + ']';
          break;
        case PathHelper.TOKEN_TYPES.PATH_ROOT_TOKEN:
          result += '/';
          break;
        case PathHelper.TOKEN_TYPES.DEREFERENCE_TOKEN:
          result += '*';
          break;
        default:
          throw new OperationError(`Unsupported token type ${finalTypes[i]}`, 'GetCommit', HTTPStatus.BAD_REQUEST,
            OperationError.FLAGS.QUIET);
      }
    }

    return result;
  }

  /**
   * Get the changeSet of a commit
   * @param {Object} in_params The parameters
   * @param {String} in_params.guid The guid of the commit
   * @param {Array.<String>} in_params.paths Paths to include in the response (an empty array returns the full MV)
   * @param {Array.<Array<String>>} in_params.ranges Ranges to include in the response
   * @param {Object} in_params.bTreeParameters Parameters for the BTree
   * @return {Promise<{changeSet: Object}>} The CS of the commit
   */
  async getCommitCS(in_params) {
    let params = _.defaults({
      onlyChanges: true,
      followReferences: false,
      pagingLimit: undefined,
      pagingStartPath: undefined
    },
    in_params
    );

    params.bTreeParameters = in_params.bTreeParameters || BTreeManager.ORIGINAL_BTREE_PARAMETERS;

    let changeSet;
    await this._systemMonitor.startSegment('Commit Manager: Get Commit CS', true, async () => {
      changeSet = await this._getCommitChangeSetInternal(params);
    });

    return changeSet;
  }

  /**
   * Get the materializedView of a commit
   * @param {Object} in_params The parameters
   * @param {String} in_params.guid The guid of the commit
   * @param {String} in_params.branchGuid The guid of the branch
   * @param {Array.<String>} in_params.paths Paths to include in the response (an empty array returns the full MV)
   * @param {Array.<Array<String>>} in_params.ranges Ranges to include in the response
   * @param {Boolean} in_params.followReferences Follow references while traversing the changeset and include the
   * referenced subtrees
   * @param {Number} in_params.pagingLimit Desired maximum size of the result. Note, this size limit will not be
   * enforced strictly. The result can be bigger by up to the size of one internal chunk.
   * @param {Number} in_params.pagingStartPath Start path for the next page to request
   * @param {Object} in_params.bTreeParameters Parameters for the BTree
   * @return {Promise<{changeSet: Object}>} The MV of the commit
   */
  async getCommitMV(in_params) {
    let params = _.defaults({
      onlyChanges: false
    },
    in_params
    );

    params.bTreeParameters = in_params.bTreeParameters || BTreeManager.ORIGINAL_BTREE_PARAMETERS;

    let materializedView;
    await this._systemMonitor.startSegment('Commit Manager: Get Materialized View', true, async () => {
      materializedView = await this._getCommitChangeSetInternal(params);
    });

    return materializedView;
  }

  /**
   * Get the ChangeSet for the changes between two commits
   * @param {Object} in_params The parameters
   * @param {String} in_params.oldCommitGuid The guid of the old commit
   * @param {String} in_params.newCommitGuid The guid of the new commit
   * @param {Array.<String>} in_params.paths Paths to include in the response (an empty array returns the full MV)
   * @param {Array.<Array<String>>} in_params.ranges Ranges to include in the response
   * @return {Promise<{changeSet: Object}>} The ChangeSet of the changes between the two commits
   */
  async getSquashedCommitRange(in_params) {
    let params = _.defaults(
      {
        onlyChanges: true,
        guid: in_params.newCommitGuid
      },
      in_params
    );

    let squashedChangeSet;
    await this._systemMonitor.startSegment('Commit Manager: Get Squashed CS', true, async () => {
      squashedChangeSet = await this._getCommitChangeSetInternal(params);
    });

    return squashedChangeSet;
  }

  /**
   * Deletes a commit by traversing the B-tree from its root and deleting the nodes it added.
   * @param {String} in_branchGuid GUID of the branch to update
   * @param {String} in_commitGuid GUID of the commit to delete
   */
  async deleteCommit(in_branchGuid, in_commitGuid) {
    const [branch, headCommit, headCommitTemplates] = await Promise.all([
      this._storage.get('branch:' + in_branchGuid),
      this._storage.get('commit:' + in_commitGuid),
      this._storage.get('commitTemplates:' + in_commitGuid)
    ]);

    if (branch.headCommitGuid !== headCommit.guid) {
      throw new OperationError(`Only the head commit of a branch may be deleted. '${in_commitGuid}' is not the head ` +
        `of '${in_branchGuid}'`, 'DeleteCommit', HTTPStatus.BAD_REQUEST, OperationError.FLAGS.QUIET);
    }

    const parentCommit = await this._storage.get('commit:' + headCommit.parentGuid);
    const deleteWindow = { from: parentCommit.timestamp, to: headCommit.timestamp };
    let batch = this._storage.startWriteBatch();

    await this._systemMonitor.startSegment('B-Tree update', true, async () => {
      await Promise.all([
        this._btreeManager.updateBTree({
          deleteWindow,
          bTreeParameters: branch.bTreeParameters
        }, headCommit.rootNodeRef, undefined, batch),
        this._btreeManager.updateBTree({
          deleteWindow,
          bTreeParameters: branch.bTreeParameters
        }, headCommitTemplates.rootNodeRef, undefined, batch)
      ]);
    });

    await this._systemMonitor.startSegment('Storage: Finish B-tree update batch', true, async () => {
      await this._storage.finishWriteBatch(batch);
    });

    batch = this._storage.startWriteBatch();

    branch.headCommitGuid = parentCommit.guid;
    branch.headSequenceNumber = parentCommit.sequence;
    this._storage.update(batch, 'branch:' + branch.guid, branch);

    await Promise.all([
      this._storage.delete('commit:' + in_commitGuid),
      this._storage.delete('commitTemplates:' + in_commitGuid)
    ]);

    await this._systemMonitor.startSegment('Storage: Finish Finish commit and branch update batch', true, async () => {
      await this._storage.finishWriteBatch(batch);
    });
  }

  /**
   * Get a changeSet for a commit.
   * This is an internal function that is used to retrieve multiple different types of changeSets. It can
   * either get a materializedView/normalizedChangeSet or a delta ChangeSet. This functionality is exposed
   * to the user of the CommitManager via that more specialized getCommitMV and getCommitCS functions.
   * @param {Object} in_params The parameters
   * @param {String} in_params.guid The guid of the commit
   * @param {String} in_params.branchGuid The guid of the branch
   * @param {String} [in_params.oldCommitGuid] The guid of the old commit (if none is given, the parent of
   * the commit is used)
   * @param {Array.<String>} in_params.paths Paths to include in the response (an empty array returns the full MV)
   * @param {Array.<Array<String>>} in_params.ranges Ranges to include in the response
   * @param {Boolean} in_params.followReferences Follow references while traversing the changeset
   * and include the referenced subtrees
   * @param {Boolean} in_params.fetchSchemas Include registered schemas as part of the result
   * @param {Number} in_params.pagingLimit Desired maximum size of the result. Note, this size limit will
   * not be enforced strictly. The result can be bigger by up to the size of one internal chunk.
   * @param {Number} in_params.pagingStartPath Start path for the next page to request
   * @param {Boolean} in_params.onlyChanges Do not return the fullMv, but only the changeSet
   * @param {Object} in_params.bTreeParameters Parameters for the BTree of this branch
   * @return {Promise<{changeSet: Object}>} The MV of the commit
   */
  async _getCommitChangeSetInternal(in_params) {
    let paths = (in_params.paths || []).slice();
    paths.sort();

    let nodeFetchPromises = [this._storage.get('commit:' + in_params.guid)];
    if (in_params.fetchSchemas) {
      nodeFetchPromises.push(this._storage.get('commitTemplates:' + in_params.guid));
    }

    const [commitNode, commitTemplatesNode] = await Promise.all(nodeFetchPromises);
    if (commitNode === undefined) {
      throw new OperationError('Commit does not exist!', 'GetCommit', HTTPStatus.NOT_FOUND,
        OperationError.FLAGS.QUIET);
    }

    // Special case for very ancient commits
    if (in_params.fetchSchemas && !commitTemplatesNode) {
      throw new OperationError('Branch does not define template information', 'GetCommit', HTTPStatus.BAD_REQUEST,
        OperationError.FLAGS.QUIET);
    }

    let currentCSPromises = [this._storage.getNodeChangeset(commitNode.rootNodeRef)];
    if (in_params.fetchSchemas) {
      currentCSPromises.push(this._storage.getNodeChangeset(commitTemplatesNode.rootNodeRef));
    }

    let previousCSPromises = [];
    let previousCommitNode, previousCommitTemplatesNode;
    if (in_params.onlyChanges) {
      let previousCommitGuid = in_params.oldCommitGuid || commitNode.parentGuid;
      if (previousCommitGuid === undefined) {
        // Should be HTTPStatus.NOT_IMPLEMENTED, but server errors could make this server get killed
        throw new OperationError('Only changes is not yet supported for the root commit', 'GetCommit',
          HTTPStatus.BAD_REQUEST, OperationError.FLAGS.QUIET);
      }

      let previousNodePromises = [this._storage.get('commit:' + previousCommitGuid)];
      if (in_params.fetchSchemas) {
        previousNodePromises.push(this._storage.get('commitTemplates:' + previousCommitGuid));
      }
      [previousCommitNode, previousCommitTemplatesNode] = await Promise.all(previousNodePromises);

      previousCSPromises.push(this._storage.getNodeChangeset(previousCommitNode.rootNodeRef));
      if (in_params.fetchSchemas) {
        previousCSPromises.push(this._storage.getNodeChangeset(previousCommitTemplatesNode.rootNodeRef));
      }
    }

    const [rootNodeCS, rootNodeTemplatesCS] = await Promise.all(currentCSPromises);
    const [previousNodeCS, previousNodeTemplatesCS] = await Promise.all(previousCSPromises);

    let traversalPromises = [];
    const propertiesTraversal = {
      rootNode: {
        changeSet: rootNodeCS,
        ref: commitNode.rootNodeRef
      },
        commitGuid: in_params.guid,
        branchGuid: in_params.branchGuid,
      paths: paths.slice(), // Copying because this is actually changed
      previousNode: in_params.onlyChanges ? {
        changeSet: previousNodeCS,
        ref: previousCommitNode.rootNodeRef
      } : undefined,
      treeLevelDifference: in_params.onlyChanges ? commitNode.treeLevels - previousCommitNode.treeLevels : undefined,
      treeLevels: commitNode.treeLevels,
      oldCommitGuid: in_params.oldCommitGuid,
      onlyChanges: in_params.onlyChanges,
      followReferences: in_params.followReferences,
      pagingLimit: in_params.pagingLimit,
      pagingStartPath: in_params.pagingStartPath,
      ranges: in_params.ranges,
      additionalPaths: [],
      summedChangeSetSize: 0,
      finalNextPagePath: undefined,
      mergedResultChangeSet: {},
      bTreeParameters: in_params.bTreeParameters
    };
    traversalPromises.push(this._getEntriesFromChangeset(propertiesTraversal));

    let templatesTraversal;
    if (in_params.fetchSchemas) {
      templatesTraversal = {
        rootNode: {
          changeSet: rootNodeTemplatesCS,
          ref: commitTemplatesNode.rootNodeRef
        },
        paths: [],
        previousNode: in_params.onlyChanges ? {
          changeSet: previousNodeTemplatesCS,
          ref: previousCommitTemplatesNode.rootNodeRef
        } : undefined,
        treeLevelDifference: in_params.onlyChanges ?
          commitTemplatesNode.treeLevels - previousCommitTemplatesNode.treeLevels : undefined,
        treeLevels: commitTemplatesNode.treeLevels,
        oldCommitGuid: in_params.oldCommitGuid,
        onlyChanges: in_params.onlyChanges,
        followReferences: in_params.followReferences,
        pagingLimit: undefined,
        pagingStartPath: undefined,
        ranges: undefined,
        additionalPaths: [],
        summedChangeSetSize: 0,
        finalNextPagePath: undefined,
        mergedResultChangeSet: {},
        bTreeParameters: in_params.bTreeParameters
      };
      traversalPromises.push(this._getEntriesFromChangeset(templatesTraversal));
    }

    await Promise.all(traversalPromises);

    const changeSet = propertiesTraversal.mergedResultChangeSet;
    if (in_params.fetchSchemas) {
      _.assign(changeSet, getDecodedTemplates(templatesTraversal.mergedResultChangeSet));
    }

    return {
      changeSet,
      nextPagePath: propertiesTraversal.finalNextPagePath !== undefined ?
        getPathFromChunkBoundaryFormat(propertiesTraversal.finalNextPagePath) :
        propertiesTraversal.finalNextPagePath
    };
  }

  /**
   * Recursively traverses a B-Tree and populates a ChangeSet given the provided criteria.
   * @param {Object} in_params - Object containing parameters for this operation.
   * @param {Object} in_params.rootNode - Root node from which to start the traversal.
   * @param {String} in_params.commitGuid - GUID of the commit (used for logging)
   * @param {String} in_params.branchGuid - GUID of the branch (used for logging)
   * @param {Array<String>} [in_params.paths] - Paths to process during traversal. If empty all paths are processed.
   * May change during traversal.
   * @param {Object} [in_params.previousNode] - Previous sibling node of the root, if only getting changes.
   * @param {Number} in_params.treeLevelDifference - When bringing only changes, this is the difference of height
   * between the root and its previous node.
   * @param {Number} in_params.treeLevels - Height of the root node in the tree.
   * @param {String} [in_params.oldCommitGuid] - The guid of the old commit (if none is given, the parent of
   * the commit is used)
   * @param {Boolean} in_params.onlyChanges - Return only the commit changes instead of the full MV.
   * @param {Boolean} in_params.followReferences - Follow references while traversing the changeset and include the
   * referenced subtrees.
   * @param {Number} [in_params.pagingLimit] - Desired maximum size of the result. Enables chunking.
   * @param {Number} [in_params.pagingStartPath] - Path to start fetching from when chunking.
   * @param {Array<Array<String>>} [in_params.ranges] - Ranges of properties to bring with the request.
   * @param {Array<String>} in_params.additionalPaths - Additional paths to be processed. May be changed by the
   * traversal.
   * @param {Number} in_params.summedChangeSetSize - Used by the traversal to keep track of chunk size.
   * @param {String} in_params.finalNextPagePath - When chunking, this points to the first path in the next chunk.
   * It is filled by the traversal.
   * @param {Object} in_params.mergedResultChangeSet - ChangeSet that is recursively filled by the traversal.
   * @param {Object} in_params.bTreeParameters - Parameters for the BTree of this branch
   * @return {Promise} Promise for the operation.
   * @private
   */
  _addPathsToChangeSet(in_params) {
    let filterPathsTree = Utils.convertPathArrayToTree(in_params.paths);

    return this._btreeManager.traverseBTree([in_params.rootNode],
      {
        paths: in_params.paths,
        pagingLimit: in_params.pagingLimit,
        pagingStartPath: in_params.pagingStartPath,
        ranges: in_params.ranges,
        treeLevels: in_params.treeLevels,
        onlyChanges: in_params.onlyChanges,
        previousNodes: in_params.previousNode ? [in_params.previousNode] : undefined,
        treeLevelDifference: in_params.treeLevelDifference,
        directParent: in_params.oldCommitGuid === undefined,
        bTreeParameters: in_params.bTreeParameters,
        convertPathFunction: convertPathToChunkBoundaryFormat
      }).then( ({ nodes, chunkBoundaries, nextPagePath }) => {
        // Check for adjacent chunks, whether the changesets at the chunk boundary are consistent
        // Note: this check has been added to find a potential corruption within the B-Trees to warn us
        //       about the necessity to regenerate branches in which this condition is violated
        for (let i = 0; i < nodes.length - 1; i++) {

          // Do we have two adjacent chunks?
          if (nodes[i].endPath === chunkBoundaries[i + 1]) {
            // Convert the boundary into a property path
            let path = PathHelper.tokenizePathString(getPathFromChunkBoundaryFormat(chunkBoundaries[i + 1]));

            // We only check the part of the path that is shared between the two nodes (i.e. that last segment of
            // the path is only included in the second chunk)
            if (path.length > 1) {
              path = path.slice(0, path.length - 1);

              let chunk1CS = Utils.getFilteredChangeSetByPaths(nodes[i].changeSet, path);
              let chunk2CS = Utils.getFilteredChangeSetByPaths(nodes[i + 1].changeSet, path);


              // Check whether both nodes agree with respect to the presence of a changeSet at the specified path
              // They should either both have no changeset (if the path has been deleted and the boundary was kept)
              // or should both have a changeset
              let changeSetsMatch = ChangeSet.isEmptyChangeSet(chunk1CS) === ChangeSet.isEmptyChangeSet(chunk2CS);

              if (!changeSetsMatch) {
                logger.error('Non-matching changesets found at chunk boundary (' +
                'branch: ' + in_params.branchGuid + ', ' +
                'commit: ' + in_params.commitGuid + ', ' +
                'path: "' + getPathFromChunkBoundaryFormat(chunkBoundaries[i + 1]) + '").');
              }
            }
          }
        }
        in_params.mergedResultChangeSet = mergeChunkedChangeSet(_.map(nodes, (x, i) => {
          let changeSet = x.changeSet;

          let filteredChangeSet;
          if (in_params.paths.length !== 0) {
            filteredChangeSet = Utils.getFilteredChangeSetByPaths(changeSet, filterPathsTree);
          }

          if (in_params.ranges) {
            let changeSetsToMerge = filteredChangeSet !== undefined ? [filteredChangeSet] : [];

            for (let j = 0; j < in_params.ranges.length; j++) {
              const convertedRange = [
                convertPathToChunkBoundaryFormat(in_params.ranges[j][0]),
                convertPathToChunkBoundaryFormat(in_params.ranges[j][1])
              ];
              let chunks = chunkChangeSet(changeSet, undefined, convertedRange);
              for (let k = 0; k < chunks.length; k++) {
                if (chunks[k].correspondingChunkIndex === 1) {
                  changeSetsToMerge.push(chunks[k].changeSet);
                }
              }
            }

            filteredChangeSet = mergeChunkedChangeSet(changeSetsToMerge);
          }

          if (filteredChangeSet !== undefined) {
            changeSet = filteredChangeSet;
          }

          if (in_params.pagingLimit !== undefined) {
          // TODO: is there any more efficient way to do this?
            let changeSetSize = this._serializer.serialize(changeSet).length;
            if (in_params.summedChangeSetSize < in_params.pagingLimit) {
              in_params.summedChangeSetSize += changeSetSize;
            } else {
              if (in_params.finalNextPagePath === undefined) {
                in_params.finalNextPagePath = chunkBoundaries[i];
              }
              changeSet = {};
            }
          }

          if (in_params.followReferences) {
          // Extract all references that appear in the changeSet
            Utils.traverseChangeSetRecursively(changeSet, {
              preCallback: (in_context) => {
              // If we found and instance of the requested typeid, we store it under its path
                if (in_context.getTypeid().substr(0, 9) === 'Reference') {
                // Add the path to the list of paths we have found
                  let path = in_context.getNestedChangeSet();
                  if (path[0] === '/') {
                    path = path.substr(1);
                  } else {
                    path = this._joinPaths(in_context.getFullPath(), '../' + path);
                  }
                  in_params.additionalPaths.push(path);
                }
              }
            });
          }

          return changeSet;
        }).concat(in_params.mergedResultChangeSet));

        if (in_params.pagingLimit !== undefined &&
            in_params.finalNextPagePath === undefined) {
          in_params.finalNextPagePath = nextPagePath;
        }
      });
  }

  /**
   * Recursively populates a ChangeSet given the provided criteria, also filtering the desired paths.
   * @param {Object} in_params - Object containing parameters for this operation.
   * @param {Object} in_params.rootNode - Root node from which to start the traversal.
   * @param {String} in_params.commitGuid - GUID of the commit (used for logging)
   * @param {String} in_params.branchGuid - GUID of the branch (used for logging)
   * @param {Array<String>} [in_params.paths] - Paths to process during traversal. If empty all paths are processed.
   * May change during traversal.
   * @param {Object} [in_params.previousNode] - Previous sibling node of the root, if only getting changes.
   * @param {Number} in_params.treeLevelDifference - When bringing only changes, this is the difference of height
   * between the root and its previous node.
   * @param {Number} in_params.treeLevels - Height of the root node in the tree.
   * @param {String} [in_params.oldCommitGuid] - The guid of the old commit (if none is given, the parent of
   * the commit is used)
   * @param {Boolean} in_params.onlyChanges - Return only the commit changes instead of the full MV.
   * @param {Boolean} in_params.followReferences - Follow references while traversing the changeset and include the
   * referenced subtrees.
   * @param {Number} [in_params.pagingLimit] - Desired maximum size of the result. Enables chunking.
   * @param {Number} [in_params.pagingStartPath] - Path to start fetching from when chunking.
   * @param {Array<Array<String>>} [in_params.ranges] - Ranges of properties to bring with the request.
   * @param {Array<String>} in_params.additionalPaths - Additional paths to be processed. May be changed by the
   * traversal.
   * @param {Number} in_params.summedChangeSetSize - Used by the traversal to keep track of chunk size.
   * @param {String} in_params.finalNextPagePath - When chunking, this points to the first path in the next chunk.
   * It is filled by the traversal.
   * @param {Object} in_params.mergedResultChangeSet - ChangeSet that is recursively filled by the traversal.
   * @param {Object} in_params.bTreeParameters - Parameters for the BTree of this branch
   * @return {Promise} Promise for the operation.
   * @private
   */
  _getEntriesFromChangeset(in_params) {

    return this._addPathsToChangeSet(in_params).then( () => {
      let filteredPaths = [];
      if (in_params.additionalPaths.length > 0) {
        for (let i = 0; i < in_params.additionalPaths.length; i++) {
          let indexInPaths = _.sortedIndex(in_params.paths, in_params.additionalPaths[i]);
          let propertyPrefixExists = in_params.paths[indexInPaths] === in_params.additionalPaths[i] ||
            (indexInPaths > 0 &&
            in_params.additionalPaths[i].substr(0, in_params.paths[indexInPaths - 1].length) ===
              in_params.paths[indexInPaths - 1]);

          if (!propertyPrefixExists) {
            filteredPaths.push(in_params.additionalPaths[i]);
            in_params.paths.splice(indexInPaths, 0, in_params.additionalPaths[i]);
          }
        }
      }

      if (filteredPaths.length > 0) {
        in_params.additionalPaths = [];
        in_params.paths = filteredPaths;
        return this._getEntriesFromChangeset(in_params);
      } else {
        return undefined;
      }
    });
  }

  /**
   * Get all leaf nodes for a given commit
   *
   * This function is only intended for unit tests, since querying this information
   * might be very expensive
   *
   * @param {Object} in_params                - The branch parameters
   * @param {String} in_params.guid           - The guid of the commit
   * @param {Object} in_params.bTreeParameters - BTree parameters
   *
   * @return {Promise<Array[]>} - A list with all the leaf nodes
   *                              Leaf node format: {startPath:String, changeSet: Object}
   */
  _getAllLeafsForCommit(in_params) {
    let requests = [
      this._storage.get('commit:' + in_params.guid)
    ];
    let commitNode;
    return Promise.all(requests).then( ([commit]) => {
      if (commit === undefined) {
        throw new OperationError('Commit does not exist!', 'GetCommit', HTTPStatus.NOT_FOUND,
          OperationError.FLAGS.QUIET);
      }
      commitNode = commit;

      return this._storage.getNodeChangeset(commit.rootNodeRef);
    }).then((rootNodeCS) => {
      return this._btreeManager.traverseBTree([{
        changeSet: rootNodeCS,
        ref: commitNode.rootNodeRef
      }], {
        bTreeParameters: in_params.bTreeParameters,
        convertPathFunction: convertPathToChunkBoundaryFormat
      });
    }).then( ({ nodes, chunkBoundaries }) => {
      return nodes.map( (chunk, i) => {
        return {
          startPath: chunkBoundaries[i],
          changeSet: chunk.changeSet
        };
      });
    });
  }

  /**
   * Get all leaf nodes for a given commit
   *
   * This function is only intended for unit tests, since querying this information
   * might be very expensive
   *
   * @param {Object} in_params                - The branch parameters
   * @param {String} in_params.guid           - The guid of the commit
   * @param {Object} in_params.bTreeParameters - BTree parameters
   *
   * @return {Promise<Array[]>} - A list with all the leaf nodes
   *                              Leaf node format: {startPath:String, changeSet: Object}
   */
  _getFullTree(in_params) {
    let nodes = {};
    let rootNode = undefined;

    let requests = [
      this._storage.get('commit:' + in_params.guid)
    ];

    let commitNode;
    return Promise.all(requests).then( ([commit]) => {
      if (commit === undefined) {
        throw new OperationError('Commit does not exist!', 'GetCommit', HTTPStatus.NOT_FOUND,
          OperationError.FLAGS.QUIET);
      }

      commitNode = commit;
      return this._storage.getNodeChangeset(commit.rootNodeRef);
    }).then((rootNodeCS) => {
      return this._btreeManager.traverseBTree([{
        changeSet: rootNodeCS,
        ref: commitNode.rootNodeRef
      }], {
        bTreeParameters: in_params.bTreeParameters,
        convertPathFunction: convertPathToChunkBoundaryFormat,
        nodeCallback: (node) => {
          nodes[node.ref] = node;
          nodes[node.ref].children = InternalNode.prototype.decodeCsChildren(node.changeSet);
          if (!rootNode) {
            rootNode = node;
          }
        }
      });
    }).then( (leafInfo) => {
      _.forEach(leafInfo.nodes, (node) => {
        nodes[node.ref] = node;
      });
      _.forEach(nodes, (node) => {
        if (node.children) {
          for (let i = 0; i < node.children.length; i++) {
            node.children[i].node = nodes[node.children[i].nodeRef];
          }
        }
      });

      return rootNode;
    });
  }

  /**
   * Checks, whether all nodes in the B-Tree for the given commit are valid B-Tree nodes.
   *
   * This function is only intended for unit tests.
   *
   * @param {Object} in_params                - The branch parameters
   * @param {String} in_params.guid           - The guid of the commit
   * @param {Object} in_params.bTreeParameters - BTree Parameters
   *
   * @return {Promise} - The promise will be rejected if the B-Tree condition is not fulfilled
                         in all nodes
   */
  _validateTree(in_params) {
    let requests = [
      this._storage.get('commit:' + in_params.guid)
    ];

    let root = true;
    let commitNode;

    return Promise.all(requests).then( ([commit]) => {
      if (commit === undefined) {
        throw new OperationError('Commit does not exist!', 'ValidateCommit', HTTPStatus.NOT_FOUND,
          OperationError.FLAGS.QUIET);
      }
      commitNode = commit;

      return this._storage.getNodeChangeset(commit.rootNodeRef);
    }).then((rootNodeCS) => {

      let order = in_params.bTreeParameters.bTreeOrder;
      let d = (order - 1) / 2 + 1;
      let maxLevel = 0;

      return this._btreeManager.traverseBTree([{
        changeSet: rootNodeCS,
        ref: commitNode.rootNodeRef
      }], {
        bTreeParameters: in_params.bTreeParameters,
        convertPathFunction: convertPathToChunkBoundaryFormat,
        nodeCallback: (node, level) => {
          let children = InternalNode.prototype.decodeCsChildren(node.changeSet);
          maxLevel = Math.max(maxLevel, level);
          if ((!root && d > children.length) ||
              children.length > order) {
            throw new OperationError(`Invalid B-Tree node with ${children.length} children`, 'ValidateCommit',
              HTTPStatus.INTERNAL_SERVER_ERROR);
          }

          root = false;
        }
      }).then(() => {
        expect(maxLevel).to.equal(commitNode.treeLevels - 1);
      });
    });
  }

  /**
   * Given a commit guid it provides a URL to a local HTML file that displays
   * the B-Tree for that commit.
   *
   * This function is only intended for debugging purposes.
   *
   * @param {String} in_commit Commit GUID
   * @return {String} URL to the B-Tree visualization page
   */
  _plotTree(in_commit) {
    let getSync = (in_ref) => {
      return JSON.parse(this._storage._data[in_ref]);
    };

    let root = getSync('commit:' + in_commit).rootNodeRef;

    const extractTree = function(in_rootRef) {
      let node = getSync(in_rootRef);
      let children = InternalNode.prototype.decodeCsChildren(node.changeSet);
      return children.map((x) => {
        let entry = {
          name: x.startPath || 'undefined'
        };
        if (x.nodeRef[0] !== 'l') {
          entry.children = extractTree(x.nodeRef);
        }
        return entry;
      });
    };

    return `file://${__dirname}'/../../VisualizeTree.html?data=` +
      encodeURIComponent(JSON.stringify({name: 'root', children: extractTree(root)}));
  }
}

module.exports = CommitManager;

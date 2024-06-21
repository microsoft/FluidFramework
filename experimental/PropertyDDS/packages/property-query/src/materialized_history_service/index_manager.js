/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const _ = require("lodash");
const asyncQueue = require("async").queue;
const Joi = require("joi");
const { calculateHash, OperationError } = require("@fluid-experimental/property-common");
const HTTPStatus = require("http-status");
const {
	PathHelper,
	ArrayChangeSetIterator,
	Utils,
} = require("@fluid-experimental/property-changeset");
const ModuleLogger = require("../utils/module_logger");
const logger = ModuleLogger.getLogger("HFDM.MaterializedHistoryService.IndexManager");
const DeterministicGuidGenerator = require("../utils/deterministic_guid_generator");
const IndexKeyEncoder = require("../utils/index_key_encoder");
const { mergeChunkedChangeSet } = require("./change_set_processing/merge_chunked_changeset");
const { chunkChangeSet } = require("./change_set_processing/chunk_change_set");
const IndexUtils = require("./query_pipeline/index_utils");
const BTreeManager = require("./btree_manager");

const MAX_PARALLEL_INDEX_UPDATE = 10;

const INDEX_SCHEMA = Joi.object({
	fields: Joi.array()
		.items(
			Joi.object({
				name: Joi.string()
					.regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
					.required(),
				typeId: Joi.string().required().valid(Object.keys(IndexKeyEncoder.Type)),
			}),
		)
		.min(1)
		.required(),
	include: Joi.array()
		.items(
			Joi.object({
				schema: Joi.string().required(), // For now
			}),
		)
		.min(1)
		.required(),
});

/**
 * Class in charge of index maintenance
 */
class IndexManager {
	/**
	 * Constructor for this class
	 * @param {Object} params Function parameters
	 * @param {Object} params.commitManager CommitManager used to obtain MVs
	 * @param {Object} params.storageManager - Storage manager used to store the materialized history
	 * @param {BTreeManager} params.btreeManager Manager that deals with shared B-tree related functionality
	 * @param {Object} params.systemMonitor The system monitor to use
	 */
	constructor(params) {
		this._commitManager = params.commitManager;
		this._storage = params.storageManager;
		this._btreeManager = params.btreeManager;
		this._systemMonitor = params.systemMonitor;
		this._indexUpdateQueue = asyncQueue(
			this._createAndApplyChangeSetOnIndex.bind(this),
			MAX_PARALLEL_INDEX_UPDATE,
		);
	}

	/**
	 * Creates an index on the specified branch given the specified parameters
	 * @param {Object} params Parameters for index creation
	 * @param {String} params.branchGuid GUID of the branch
	 * @param {String} params.name Name of the index
	 * @param {Object} params.def Definition of the index
	 * @param {Object} [params.inBatch] Used to process the update in a branch batch
	 * @param {*} params.inBatch.batch Write batch to be used. If not provided, a new batch will be created and used.
	 * @param {Object} params.inBatch.branch Branch node to be updated in memory.
	 */
	async createIndex(params) {
		const validation = Joi.validate(params.def, INDEX_SCHEMA, {
			convert: true,
		});
		if (validation.error) {
			const details = validation.error.details.map((e) => e.message).join(", ");
			throw new OperationError(
				`Index definition is not valid: ${details}`,
				"CreateIndex",
				HTTPStatus.BAD_REQUEST,
				OperationError.FLAGS.QUIET,
			);
		}
		params.def = validation.value;

		let branch;
		if (params.inBatch) {
			branch = params.inBatch.branch;
		} else {
			branch = await this._storage.get("branch:" + params.branchGuid);
		}

		if (!branch) {
			throw new OperationError(
				`Branch '${params.branchGuid}' does not exist!`,
				"CreateIndex",
				HTTPStatus.NOT_FOUND,
				OperationError.FLAGS.QUIET,
			);
		}

		branch.indices = branch.indices || {};
		if (branch.indices[params.name]) {
			throw new OperationError(
				`Index '${params.name}' already exists!`,
				"CreateIndex",
				HTTPStatus.CONFLICT,
				OperationError.FLAGS.QUIET,
			);
		}

		let batch;
		if (params.inBatch) {
			batch = params.inBatch.batch;
		} else {
			batch = this._storage.startWriteBatch();
		}

		const indexGuid = calculateHash(params.name);
		const guidGenerator = new DeterministicGuidGenerator(params.branchGuid, indexGuid);
		const rootNodeRef = this._btreeManager.createBTree(
			batch,
			{},
			params.branchGuid,
			guidGenerator,
		);

		branch.indices[params.name] = {
			def: params.def,
			head: {
				guid: branch.rootCommitGuid,
				sequence: 0,
			},
		};

		this._storage.store(
			batch,
			`commitIndex#${params.branchGuid}#${params.name}:${branch.rootCommitGuid}`,
			{
				branchGuid: params.branchGuid,
				rootNodeRef,
				treeLevels: 1,
			},
		);

		if (!params.inBatch) {
			this._storage.update(batch, "branch:" + params.branchGuid, branch);
			await this._storage.finishWriteBatch(batch);
		}
	}

	/**
	 * Branches and index, creating a new commitIndex meta node for the child branch pointing to the same index tree
	 * from the parent branch.
	 * @param {Object} params Parameters for index creation
	 * @param {String} params.branchGuid GUID of the branch
	 * @param {String} params.parentBranchGuid GUID of the parent branch
	 * @param {String} params.rootCommit Root commit at which the branching is done
	 * @param {String} params.name Name of the index
	 * @param {Object} params.def Index definition
	 * @param {Object} [params.inBatch] Used to process the update in a branch batch
	 * @param {*} params.inBatch.batch Write batch to be used. If not provided, a new batch will be created and used.
	 * @param {Object} params.inBatch.branch Branch node to be updated in memory.
	 */
	async branchIndex(params) {
		let branch;
		if (params.inBatch) {
			branch = params.inBatch.branch;
		} else {
			branch = await this._storage.get("branch:" + params.branchGuid);
		}

		if (!branch) {
			throw new OperationError(
				`Branch '${params.branchGuid}' does not exist!`,
				"CreateIndex",
				HTTPStatus.NOT_FOUND,
				OperationError.FLAGS.QUIET,
			);
		}

		branch.indices = branch.indices || {};
		if (branch.indices[params.name]) {
			throw new OperationError(
				`Index '${params.name}' already exists!`,
				"CreateIndex",
				HTTPStatus.CONFLICT,
				OperationError.FLAGS.QUIET,
			);
		}

		let batch;
		if (params.inBatch) {
			batch = params.inBatch.batch;
		} else {
			batch = this._storage.startWriteBatch();
		}

		const parentBranchCommitNode = await this._storage.get(
			`commitIndex#${params.parentBranchGuid}#${params.name}:${params.rootCommit.guid}`,
		);
		if (!parentBranchCommitNode) {
			logger.debug(
				`Cannot copy index '${name}' from branch '${params.parentBranchGuid}' to branch ` +
					`'${params.branchGuid}'. The index is not up to date with commit '${params.rootCommit.guid}'.`,
			);
		} else {
			this._storage.store(
				batch,
				`commitIndex#${params.branchGuid}#${params.name}:${params.rootCommit.guid}`,
				{
					branchGuid: params.branchGuid,
					rootNodeRef: parentBranchCommitNode.rootNodeRef,
					treeLevels: parentBranchCommitNode.treeLevels,
				},
			);

			// Note the head points to the commit we are branching on
			branch.indices[params.name] = {
				def: params.def,
				head: {
					guid: params.rootCommit.guid,
					sequence: params.rootCommit.sequence,
				},
			};

			if (!params.inBatch) {
				this._storage.update(batch, "branch:" + params.branchGuid, branch);
				await this._storage.finishWriteBatch(batch);
			}
		}
	}

	/**
	 * Update branch indices by applying the commit provided
	 * @param {Object} params Function parameters
	 * @param {Object} params.commit Commit to apply
	 * @param {String} params.commit.guid Guid of the commit
	 * @param {String} params.commit.branchGuid Guid of the branch
	 * @param {String} params.commit.parentGuid Guid of the parent commit
	 * @param {Object} params.commit.changeSet ChangeSet of the commit
	 * @param {Object} [params.inBatch] Used to process the update in a branch batch
	 * @param {*} params.inBatch.batch Write batch to be used. If not provided, a new batch will be created and used.
	 * @param {Object} params.inBatch.branch Branch node to be updated in memory.
	 */
	async updateBranchIndices(params) {
		const commit = params.commit;
		let branch;
		if (params.inBatch) {
			branch = params.inBatch.branch;
		} else {
			branch = await this._storage.get("branch:" + commit.branchGuid);
		}

		let indexHeads = _.mapValues(branch.indices, (index) => index.head.guid);
		indexHeads = _.pickBy(indexHeads, (head, name) => {
			if (head === commit.guid) {
				logger.debug(
					`Index '${name}' of branch '${commit.branchGuid}' is up to date with commit '${commit.guid}'`,
				);
				return false;
			} else if (head !== commit.parentGuid) {
				logger.debug(
					`Commit '${commit.guid}' cannot be applied on index '${name}' of branch '${commit.branchGuid}'` +
						`. Head at '${head}'`,
				);
				return false;
			} else {
				return true;
			}
		});

		const parentRequests = _.mapValues(indexHeads, (index, name) => {
			return this._storage.get(
				`commitIndex#${commit.branchGuid}#${name}:${commit.parentGuid}`,
			);
		});

		for (const indexName of Object.keys(parentRequests)) {
			const parentCommit = await parentRequests[indexName];
			if (!parentCommit) {
				throw new OperationError(
					`Head commit '${indexHeads[indexName]}' of index '${indexName}' of branch ` +
						`'${commit.branchGuid}' does not exist!`,
					"IndexUpdate",
					HTTPStatus.INTERNAL_SERVER_ERROR,
				);
			}
		}

		const indicesToProcess = _.pick(branch.indices, Object.keys(indexHeads));
		if (_.isEmpty(indicesToProcess)) {
			// No indices to update
			return;
		}

		const updates = await this._getIndexUpdates({
			changeSet: params.commit.changeSet,
			indices: indicesToProcess,
			previousCommitGuid: commit.parentGuid,
			bTreeParameters: branch.bTreeParameters || BTreeManager.ORIGINAL_BTREE_PARAMETERS,
		});

		const indexUpdatePromises = [];
		for (const indexName of Object.keys(indicesToProcess)) {
			indexUpdatePromises.push(
				this._indexUpdateQueue.pushAsync({
					indexName,
					indexUpdates: updates[indexName],
					indexDef: branch.indices[indexName].def,
					branchGuid: commit.branchGuid,
					parentCommitGuid: indexHeads[indexName],
					commitGuid: commit.guid,
					parentCommit: await parentRequests[indexName], // Already resolved
					inBatch: {
						branch,
						batch: params.inBatch && params.inBatch.batch,
					},
				}),
			);
		}
		await Promise.all(indexUpdatePromises);
	}

	/**
	 * Creates a change set from index update operations and applies it on the index tree
	 * @param {Object} task Includes all the information for this task
	 * @param {String} task.indexName Index name
	 * @param {Object} task.indexDef Index definition
	 * @param {Object} task.indexUpdates Operations to be applied on the index
	 * @param {String} task.branchGuid Guid of the branch that owns the index
	 * @param {String} task.parentCommitGuid Guid of the parent commit
	 * @param {String} task.commitGuid Guid of the current commit
	 * @param {Object} task.parentCommit Parent commit node
	 * @param {Object} task.inBatch Used to process the update in a branch batch
	 * @param {*} params.inBatch.batch Write batch to be used. If not provided, a new batch will be created and used.
	 * @param {Object} params.inBatch.branch Branch node to be updated in memory.
	 * @private
	 */
	async _createAndApplyChangeSetOnIndex(task) {
		const changeSet = await this._getChangeSetFromIndexUpdates({
			indexUpdates: task.indexUpdates,
			indexName: task.indexName,
			indexDef: task.indexDef,
			branchGuid: task.branchGuid,
			parentCommitGuid: task.parentCommitGuid,
		});
		await this._applyChangeSetOnIndex({
			indexName: task.indexName,
			indexDef: task.indexDef,
			branchGuid: task.branchGuid,
			commitGuid: task.commitGuid,
			parentCommit: task.parentCommit,
			inBatch: task.inBatch,
			changeSet,
		});
	}

	/**
	 * Treverses the given changeSet and returns the update operations that are relevant for each index.
	 * Relevancy is determined by whether the properties match the inclusion criteria for the index.
	 * While insert operations can be directly determined from the changeSet, modifications and removals require
	 * additional data that gets fetched from the primary index MV for each affected path.
	 * @param {Object} params Function parameters
	 * @param {Object} params.changeSet ChangeSet to traverse
	 * @param {Object} params.indices Indices to check properties to match to
	 * @param {String} params.previousCommitGuid Guid of the parent commit. Used to query data from the MV.
	 * @param {Object} params.bTreeParameters Parameter values for the primary B-Tree.
	 * @return {Object} Contains the property paths found in the changeSet that affect indices, organized by index and
	 * operation type. It includes the values required for index update operations.
	 */
	async _getIndexUpdates(params) {
		const { changeSet, indices, previousCommitGuid, bTreeParameters } = params;
		const filterByIncludeSchema = (schema) =>
			Object.keys(
				_.pickBy(indices, (idx) => idx.def.include.some((i) => i.schema === schema)),
			);
		const filterByIncludeProperty = (indexNames, property) =>
			indexNames.filter((name) => indices[name].def.fields.some((f) => f.name === property));

		const result = {};
		const allRemoves = new Set();
		const modifies = new Set();
		const matchedChangeSets = new Map();
		Utils.traverseChangeSetRecursively(changeSet, {
			preCallback: (context) => {
				if (context.getOperationType() === "remove") {
					allRemoves.add(context.getFullPath());
				} else {
					const indicesWithSchema = filterByIncludeSchema(context.getTypeid());
					if (!_.isEmpty(indicesWithSchema)) {
						matchedChangeSets.set(context.getNestedChangeSet(), {
							typeid: context.getTypeid(),
							indices: indicesWithSchema,
							path: context.getFullPath(),
							operation: context.getOperationType(),
						});
					}

					// Only direct children of schemas, with exact name match, are supported for now
					const matchedParent = matchedChangeSets.get(context.getParentNestedChangeSet());
					if (matchedParent) {
						let indicesToUpdate = matchedParent.indices;
						if (matchedParent.operation === "modify") {
							// For modifies, there is no need to change anything if no keys were modified
							indicesToUpdate = filterByIncludeProperty(
								indicesToUpdate,
								context.getLastSegment(),
							);
							if (!_.isEmpty(indicesToUpdate)) {
								modifies.add(matchedParent.path);
							}
						}

						for (const indexName of indicesToUpdate) {
							const field = indices[indexName].def.fields.find(
								(f) => f.name === context.getLastSegment(),
							);
							result[indexName] = result[indexName] || {};
							result[indexName][matchedParent.operation] =
								result[indexName][matchedParent.operation] || {};
							result[indexName][matchedParent.operation][matchedParent.path] =
								result[indexName][matchedParent.operation][matchedParent.path] || {};
							if (field) {
								const indexedProperty =
									result[indexName][matchedParent.operation][matchedParent.path];
								const value = IndexUtils.normalizeValue(
									context.getNestedChangeSet(),
									context.getTypeid(),
								);
								if (matchedParent.operation === "modify") {
									if (
										context.getTypeid() === "String" &&
										_.isObject(context.getNestedChangeSet())
									) {
										// Instead of a string value we have string OTs
										// The new value will be determined by performing the OTs on the old value once we get it
										indexedProperty[field.name] = {
											ot: context.getNestedChangeSet(),
										};
									} else {
										indexedProperty[field.name] = {
											newValue: value,
										};
									}
								} else {
									indexedProperty[field.name] = value;
								}
							}
						}
					}

					// Indexing inside of arrays is not supported. Some problems that should be solved in order to do it:
					// 1) Partial checkout is not allowd inside arrays. This means the entire array would need to be requested
					//    from the primary index for modifies and removes.
					// 2) Array shifting. Inserting or removing items will require an update of other indexed paths, to point
					//    to the right place.
					if (context.getSplitTypeID().context === "array") {
						context._traversalStopped = true;
					}
				}
			},
		});

		if (allRemoves.size > 0 || modifies.size > 0) {
			// Modifications and removals are a special case as we need to query the MV at the previous commit
			// to get the old values in order to provide enough info to update the indices.
			const mv = await this._commitManager.getCommitMV({
				guid: previousCommitGuid,
				paths: [...allRemoves, ...modifies],
				bTreeParameters,
			});

			const performStringOT = (otChangeSet, value) => {
				const iterator = new ArrayChangeSetIterator(otChangeSet);
				let offset;
				while (!iterator.atEnd()) {
					switch (iterator.opDescription.type) {
						case ArrayChangeSetIterator.types.INSERT:
							offset = iterator.currentOffset + iterator.lastOperationIndex;
							value =
								value.substring(0, offset) +
								iterator.opDescription.operation[1] +
								value.substring(offset);
							break;
						case ArrayChangeSetIterator.types.MODIFY:
							offset = iterator.currentOffset + iterator.opDescription.operation[0];
							value =
								value.substring(0, offset) +
								iterator.opDescription.operation[1] +
								value.substring(offset + iterator.opDescription.operation[1].length);
							break;
						case ArrayChangeSetIterator.types.REMOVE:
							offset = iterator.currentOffset + iterator.lastOperationIndex;
							value =
								value.substring(0, offset) +
								value.substring(offset + iterator.lastOperationOffset * -1);
							break;
						default:
							break;
					}
					iterator.next();
				}
				return value;
			};

			matchedChangeSets.clear();
			let isModify;
			Utils.traverseChangeSetRecursively(mv.changeSet, {
				preCallback: (context) => {
					if (modifies.has(context.getFullPath())) {
						isModify = true;
					} else if (allRemoves.has(context.getFullPath())) {
						isModify = false;
					}

					const indicesWithSchema = filterByIncludeSchema(context.getTypeid());
					if (!_.isEmpty(indicesWithSchema)) {
						matchedChangeSets.set(context.getNestedChangeSet(), {
							typeid: context.getTypeid(),
							indices: indicesWithSchema,
							path: context.getFullPath(),
						});
					}

					// Only direct children of schemas, with exact name match, are supported for now
					const matchedParent = matchedChangeSets.get(context.getParentNestedChangeSet());
					if (matchedParent) {
						for (const indexName of matchedParent.indices) {
							const field = indices[indexName].def.fields.find(
								(f) => f.name === context.getLastSegment(),
							);
							if (field) {
								const value = IndexUtils.normalizeValue(
									context.getNestedChangeSet(),
									context.getTypeid(),
								);
								if (isModify) {
									// Modifies may affect only some of the indices via filterByIncludeProperty
									if (result[indexName] && result[indexName]["modify"][matchedParent.path]) {
										result[indexName]["modify"][matchedParent.path][field.name] =
											result[indexName]["modify"][matchedParent.path][field.name] || {};
										const fieldValueContainer =
											result[indexName]["modify"][matchedParent.path][field.name];
										if (fieldValueContainer.ot) {
											fieldValueContainer.newValue = performStringOT(
												fieldValueContainer.ot,
												value,
											);
											delete fieldValueContainer.ot;
										}
										fieldValueContainer.oldValue = value;
									}
								} else {
									result[indexName] = result[indexName] || {};
									result[indexName]["remove"] = result[indexName]["remove"] || {};
									result[indexName]["remove"][matchedParent.path] =
										result[indexName]["remove"][matchedParent.path] || {};
									result[indexName]["remove"][matchedParent.path][field.name] = value;
								}
							}
						}
					}

					// Don't want to process here either
					if (context.getSplitTypeID().context === "array") {
						context._traversalStopped = true;
					}
				},
			});
		}

		return result;
	}

	/**
	 * Applies a change set on the index
	 * @param {Object} params Parameters for this function
	 * @param {Object} params.changeSet Change set to apply on the index
	 * @param {String} params.indexName Name of the index to update
	 * @param {Object} params.indexDef Definition of the index to update
	 * @param {String} params.branchGuid Guid of the branch owner of the index
	 * @param {String} params.commitGuid Guid of the commit the changeSet should be based on
	 * @param {Object} params.parentCommit Parent commit in the index tree
	 * @param {Object} [params.inBatch] Used to process the update in a branch batch
	 * @param {*} params.inBatch.batch Write batch to be used, ONLY for metadata.
	 * @param {Object} params.inBatch.branch Branch node to be updated in memory.
	 */
	async _applyChangeSetOnIndex(params) {
		const { branchGuid, commitGuid, parentCommit, indexName, indexDef, changeSet } = params;

		let metaBatch;
		if (params.inBatch) {
			metaBatch = params.inBatch.batch;
		} else {
			metaBatch = this._storage.startWriteBatch();
		}

		let branch;
		if (params.inBatch) {
			branch = params.inBatch.branch;
		} else {
			branch = await this._storage.get("branch:" + params.branchGuid);
		}

		// Index tree writes are done in their own batch
		const batch = this._storage.startWriteBatch();

		const keyEncoder = new IndexKeyEncoder(indexDef.fields);
		const rootNode = await this._systemMonitor.startSegment(
			"Index B-Tree update",
			true,
			async () => {
				return await this._btreeManager.updateBTree(
					{
						branchGuid,
						commitGuid,
						bTreeParameters: branch.bTreeParameters,
						pathBuilder: IndexUtils.indexChunkPathBuilder.bind(null),
						sortKeyEncoder: IndexUtils.normalizedToBinaryEncoder.bind(
							null,
							indexDef.fields,
							keyEncoder,
						),
					},
					parentCommit.rootNodeRef,
					changeSet,
					batch,
				);
			},
		);
		if (!rootNode) {
			throw new OperationError(
				`Error writing commit ${commitGuid} in index ${indexName} of branch ${branchGuid}, rootNode did not exist`,
				"GetCommit",
				HTTPStatus.NOT_FOUND,
				OperationError.FLAGS.QUIET,
			);
		}
		const newRootNode = rootNode.newParentNode || rootNode.newChildNodes[0];
		const levelChange = rootNode.levelChange || 0;

		// Wait for the nodes batch processing to be completed
		// This prevents inconsistencies in case writes are interrupted halfway through
		await this._systemMonitor.startSegment(
			"Storage: Finish index B-tree update batches",
			true,
			async () => {
				await this._storage.finishWriteBatch(batch);
			},
		);

		// Create the root commit object
		let newCommit = {
			branchGuid: branchGuid,
			rootNodeRef: newRootNode.nodeRef,
			treeLevels: parentCommit.treeLevels + levelChange,
		};

		// Store index commit meta node in meta batch
		this._storage.store(
			metaBatch,
			`commitIndex#${branchGuid}#${indexName}:${commitGuid}`,
			newCommit,
		);

		// Update index info in branch object
		branch.indices[indexName].head.guid = commitGuid;
		branch.indices[indexName].head.sequence++;

		if (!params.inBatch) {
			// Writing the branch node and waiting the meta batch is our responsibility
			this._storage.update(metaBatch, "branch:" + branch.guid, branch);

			await this._systemMonitor.startSegment(
				"Storage: Finish index meta update batches",
				true,
				async () => {
					await this._storage.finishWriteBatch(metaBatch);
				},
			);
		}
	}

	/**
	 * Produces a changeSet that can be applied on the provided commit of an index to perform the provided operations.
	 * @param {Object} params Parameters for this function
	 * @param {Object} params.indexUpdates Index update operations
	 * @param {String} params.indexName Name of the index to update
	 * @param {Object} params.indexDef Definition of the index to update
	 * @param {String} params.branchGuid Guid of the branch owner of the index
	 * @param {String} params.parentCommitGuid Guid of the commit the changeSet should be based on
	 * @return {Object} A changeSet that can be applied on the provided commit of the index to perform the updates
	 */
	async _getChangeSetFromIndexUpdates(params) {
		const { indexUpdates, indexName, indexDef, branchGuid, parentCommitGuid } = params;
		const indexKeyMap = new Map();
		let currentKeyMap, keyValue;

		// Transforms index update operations into a map of index keys
		const addToKeyMap = (operations, subProperty) => {
			for (const path of Object.keys(operations)) {
				currentKeyMap = indexKeyMap;
				for (const field of indexDef.fields) {
					keyValue = operations[path][field.name];
					if (subProperty) {
						keyValue = keyValue[subProperty];
					}
					if (keyValue === undefined) {
						keyValue = IndexUtils.UNDEFINED_KEY;
					}
					if (!currentKeyMap.has(keyValue)) {
						currentKeyMap.set(keyValue, new Map());
					}
					currentKeyMap = currentKeyMap.get(keyValue);
				}
			}
		};

		// Flattens a map of index keys into an array of index key values
		const flattenKeyMap = () => {
			const values = [];
			const addKeyRecursive = (keys, keyMap) => {
				if (keyMap.size === 0) {
					values.push(keys);
				} else {
					for (const key of keyMap.keys()) {
						addKeyRecursive([...keys, key], keyMap.get(key));
					}
				}
			};
			addKeyRecursive([], indexKeyMap);
			return values;
		};

		if (!indexUpdates) {
			// No changes affect this index. We still need to update the head anyway, so return an empty CS
			return {};
		}

		if (indexUpdates.insert) {
			addToKeyMap(indexUpdates.insert);
		}
		if (indexUpdates.modify) {
			addToKeyMap(indexUpdates.modify, "oldValue");
			addToKeyMap(indexUpdates.modify, "newValue");
		}
		if (indexUpdates.remove) {
			addToKeyMap(indexUpdates.remove);
		}

		const { changeSet: indexMV } = await this.getIndexMV({
			branchGuid,
			commitGuid: parentCommitGuid,
			indexName,
			indexDef,
			filtering: {
				values: flattenKeyMap(),
			},
		});

		const changeSet = {};

		// Traverses an index change set following the provided keys and operation. Not found keys are created
		const traverseAndCreate = (cs, keys, operation) => {
			let csAt = cs;
			let keysFoundCount = 0;
			for (const key of keys) {
				if (
					csAt[operation] &&
					csAt[operation].NodeProperty &&
					csAt[operation].NodeProperty[key]
				) {
					csAt = csAt[operation].NodeProperty[key];
					keysFoundCount++;
				} else {
					csAt[operation] = csAt[operation] || {};
					csAt[operation].NodeProperty = csAt[operation].NodeProperty || {};
					csAt[operation].NodeProperty[key] = {};
					csAt = csAt[operation].NodeProperty[key];
				}
			}
			return { keysFoundCount, csAt };
		};

		const applyInsertInMV = (keys) => {
			const { keysFoundCount } = traverseAndCreate(indexMV, keys, "insert");
			return keysFoundCount;
		};

		const applyInsertInChangeSet = (keys, keysFoundCount) => {
			const keysToModify = keys.slice(0, keysFoundCount);
			let { csAt } = traverseAndCreate(changeSet, keysToModify, "modify");
			const keysToInsert = keys.slice(keysFoundCount);
			traverseAndCreate(csAt, keysToInsert, "insert");
		};

		const applyRemoveInChangeSet = (keys, keysToKeepCount) => {
			const keysToModify = keys.slice(0, keysToKeepCount);
			let { csAt, keysFoundCount } = traverseAndCreate(changeSet, keysToModify, "modify");
			// If there happened to be an insert or modify for this key  we delete it before adding the remove
			if (
				csAt.insert &&
				csAt.insert.NodeProperty &&
				csAt.insert.NodeProperty[keys[keysFoundCount]]
			) {
				delete csAt.insert.NodeProperty[keys[keysFoundCount]];
				if (_.isEmpty(csAt.insert.NodeProperty)) {
					delete csAt.insert.NodeProperty;
					delete csAt.insert;
				}
			}
			if (
				csAt.modify &&
				csAt.modify.NodeProperty &&
				csAt.modify.NodeProperty[keys[keysFoundCount]]
			) {
				delete csAt.modify.NodeProperty[keys[keysFoundCount]];
				if (_.isEmpty(csAt.modify.NodeProperty)) {
					delete csAt.modify.NodeProperty;
					delete csAt.modify;
				}
			}
			// Now proceed with removal
			csAt.remove = csAt.remove || {};
			csAt.remove.NodeProperty = csAt.remove.NodeProperty || {};
			csAt.remove.NodeProperty[keys[keysFoundCount]] = {};
		};

		let keys;
		if (indexUpdates.insert) {
			for (const path of Object.keys(indexUpdates.insert)) {
				keys = [];
				for (const field of indexDef.fields) {
					keys.push(IndexUtils.normalizeValue(indexUpdates.insert[path][field.name]));
				}
				keys.push(path);
				const keysFoundCount = applyInsertInMV(keys);
				applyInsertInChangeSet(keys, keysFoundCount);
			}
		}

		if (indexUpdates.modify) {
			for (const path of Object.keys(indexUpdates.modify)) {
				keys = [];
				for (const field of indexDef.fields) {
					keys.push(IndexUtils.normalizeValue(indexUpdates.modify[path][field.name].newValue));
				}
				keys.push(path);
				const keysFoundCount = applyInsertInMV(keys);
				applyInsertInChangeSet(keys, keysFoundCount);
			}
			for (const path of Object.keys(indexUpdates.modify)) {
				keys = [];
				for (const field of indexDef.fields) {
					keys.push(IndexUtils.normalizeValue(indexUpdates.modify[path][field.name].oldValue));
				}
				keys.push(path);
				const keysFoundCount = IndexUtils.applyRemoveInMV(indexMV, keys);
				applyRemoveInChangeSet(keys, keysFoundCount);
			}
		}

		if (indexUpdates.remove) {
			for (const path of Object.keys(indexUpdates.remove)) {
				keys = [];
				for (const field of indexDef.fields) {
					keys.push(IndexUtils.normalizeValue(indexUpdates.remove[path][field.name]));
				}
				keys.push(path);
				const keysFoundCount = IndexUtils.applyRemoveInMV(indexMV, keys);
				applyRemoveInChangeSet(keys, keysFoundCount);
			}
		}

		return changeSet;
	}

	/**
	 * Gets the materialized view, potentially filtered and paged, for an index.
	 * @param {Object} params Parameters for this function
	 * @param {String} params.branchGuid Branch that owns the index
	 * @param {String} params.commitGuid Commit where to get the MV at
	 * @param {String} params.indexName Name of the index
	 * @param {Object} params.indexDef Index definition
	 * @param {Object} [params.filtering] Settings that control filtering of results
	 * @param {Array<Array<*>>} [params.filtering.values] List of field values to retrieve
	 * @param {Array<Array<Array<*>>>} [params.filtering.valueRanges] List of ranges of values to retrieve
	 * @param {Array<Array<*>>} [params.filtering.excludeValues] List of field values that should be excluded
	 * @param {String} [params.filtering.pathPrefix] Path prefix that a property should have to be considered
	 * @param {Number} [params.filtering.depthLimit] Depth limit (from prefix) up to which a property is considered
	 * @param {Object} [params.paging] Settings that control paging of scanned results
	 * @param {Boolean} [params.paging.isDescending] Determines if paging order is descending
	 * @param {Number} [params.paging.limit] Maximum number of matched paths to return
	 * @param {Number} [params.paging.offset] Number of matched paths to skip before start counting
	 * @return {Object} Result including the changeSet and the list of primary paths obtained
	 * {Object} changeSet The requested MV of the index
	 * {Array<String>} paths Property paths that are at the leaf level of the provided index MV
	 */
	async getIndexMV(params) {
		const { branchGuid, commitGuid, indexName, indexDef, filtering, paging } = params;
		let values, valueRanges, excludeValues, pathPrefix, depthLimit;
		if (filtering) {
			({ values, valueRanges, excludeValues, pathPrefix, depthLimit } = filtering);
		}
		let isDescending, limit, offset;
		if (paging) {
			({ isDescending, limit, offset } = paging);
		}
		const commitRef = `commitIndex#${branchGuid}#${indexName}:${commitGuid}`;
		const commitNode = await this._storage.get(commitRef);
		if (commitNode === undefined) {
			throw new OperationError(
				`Index '${indexName}' of branch '${branchGuid}' is not up to date with ` +
					`commit '${commitGuid}'`,
				"GetIndexMV",
				HTTPStatus.NOT_FOUND,
				OperationError.FLAGS.QUIET,
			);
		}

		const rootNodeCS = await this._storage.getNodeChangeset(commitNode.rootNodeRef);
		const rootNode = {
			changeSet: rootNodeCS,
			ref: commitNode.rootNodeRef,
		};

		const keyEncoder = new IndexKeyEncoder(indexDef.fields);
		const paths = values ? values.map((valueArray) => keyEncoder.encode(valueArray)) : [];
		paths.sort();
		let ranges;
		if (valueRanges) {
			ranges = valueRanges.map((valueRange) => IndexUtils.encodeRange(valueRange, keyEncoder));
		}

		const { nodes } = await this._btreeManager.traverseBTree([rootNode], {
			paths,
			pagingLimit: undefined,
			pagingStartPath: undefined,
			ranges,
			treeLevels: commitNode.treeLevels,
			onlyChanges: false,
			previousNodes: undefined,
			treeLevelDifference: undefined,
			directParent: true,
			bTreeParameters: params.bTreeParameters,
		});

		// TODO: Here we cannot really do a normalization of the values, because we don't know the typeid.
		// We could either:
		// 1) Assume values are already normalized by the caller (should be easy to do)
		// 2) Let the caller give us the values with data information (typed values?)
		// 3) Try to infer from the field type and the actual value (error prone, can't distinguish Int64 and Uint64)
		// Going with 1 for simplicity.
		const convertValueToChangeSetPath = (valueArray) =>
			valueArray
				.map((part) => {
					return PathHelper.quotePathSegmentIfNeeded(IndexUtils.normalizeValue(part));
				})
				.join(".");
		const valuesPaths = values ? values.map(convertValueToChangeSetPath) : [];
		const filterPathsTree = Utils.convertPathArrayToTree(valuesPaths);
		let toSkip = offset ? offset : 0;
		let toTake = limit ? limit : Infinity;
		if (isDescending) {
			nodes.reverse();
		}
		const resultPaths = [];
		const mergedResultChangeSet = mergeChunkedChangeSet(
			_.map(nodes, (x, i) => {
				let changeSet = x.changeSet;

				if (toTake === 0) {
					// Skip remaining nodes
					return {};
				}

				let filteredChangeSet;
				if (valuesPaths.length !== 0) {
					filteredChangeSet = Utils.getFilteredChangeSetByPaths(changeSet, filterPathsTree);
				}

				if (ranges && ranges.length > 0) {
					let changeSetsToMerge = filteredChangeSet !== undefined ? [filteredChangeSet] : [];
					for (let j = 0; j < ranges.length; j++) {
						let chunks = chunkChangeSet(changeSet, undefined, ranges[j], {
							pathBuilder: IndexUtils.indexChunkPathBuilder.bind(null),
							sortKeyEncoder: IndexUtils.normalizedToBinaryEncoder.bind(
								null,
								indexDef.fields,
								keyEncoder,
							),
						});
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

				if (excludeValues) {
					for (const value of excludeValues) {
						// TODO: Once we have typed values, we should pass the type id to normalizeValue to properly support (U)Int64
						IndexUtils.applyRemoveInMV(changeSet, value.map(IndexUtils.normalizeValue));
					}
				}

				if (toSkip > 0) {
					// If we are still skipping, we'll first count how many paths we have in this chunk.
					const pathsInChunk = IndexUtils.extractPathsFromIndexMV(
						changeSet,
						indexDef.fields.length,
						pathPrefix,
						depthLimit,
					);
					if (pathsInChunk.length <= toSkip) {
						// We may skip this chunk entirely
						toSkip -= pathsInChunk.length;
						return {};
					}
				}
				// We have to take some paths from this chunk. Need to follow the specified order.
				const pathsInChunk = IndexUtils.extractPathsFromIndexMV(
					changeSet,
					indexDef.fields.length,
					pathPrefix,
					depthLimit,
					{
						isDescending,
						sortKeyEncoder: IndexUtils.normalizedToBinaryEncoder.bind(
							null,
							indexDef.fields,
							keyEncoder,
						),
					},
				);
				const pathsToTake = pathsInChunk.slice(toSkip, toSkip + toTake);
				resultPaths.push(...pathsToTake);
				toSkip = 0;
				toTake -= pathsToTake.length;

				return changeSet;
			}),
		);

		return {
			changeSet: mergedResultChangeSet,
			paths: resultPaths,
		};
	}
}

module.exports = IndexManager;

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const { queue: asyncQueue, retry: asyncRetry } = require("async");
const DeferredPromise = require("@fluid-experimental/property-common").DeferredPromise;
const HTTPStatus = require("http-status");
const ModuleLogger = require("../utils/module_logger");
const OperationError = require("@fluid-experimental/property-common").OperationError;
const logger = ModuleLogger.getLogger("MaterializedHistoryService.BranchWriteQueue");
const { ChangeSet, rebaseToRemoteChanges } = require("@fluid-experimental/property-changeset");
const LRU = require("lru-cache");

const _ = require("lodash");

const MAX_COMMITS_TO_REPAIR_IN_A_BATCH = 10;

/**
 * Queues commits and branch creations, and will trigger creation of missing items so that
 * everything happens in an orderly fashion
 */
class BranchWriteQueue {
	/**
	 * Constructor for this class.
	 * @param {Object} params - Parameters for the new instance
	 * @param {CommitManager} params.commitManager Reference to the commit manager used to get/create commits
	 * @param {BranchManager} params.branchManager Reference to the branch manager used to get/create branches
	 * @param {PSSClient} params.pssClient - PSS Client to fetch missing commits
	 */
	constructor(params) {
		this._commitManager = params.commitManager;
		this._branchManager = params.branchManager;
		this._pssClient = params.pssClient;
		this._validateTopologyQueue = {};
		this._writeQueue = {};
		this._pendingCommitPromises = {};
		this._pendingBranchPromises = {};
		this._currentlyWritingCommit = {};
		this._errorsPerBranch = {};
		this._lockedBranches = new Set();
		this._cache = new LRU({
			length: (n) => n.length,
		});
	}

	/**
	 * Returns whether a branch is being written to or not.
	 * @param {String} branchGuid - Branch to check
	 * @return {Boolean} - Whether the branch is being processed or not
	 */
	isProcessing(branchGuid) {
		return (
			branchGuid in this._pendingCommitPromises ||
			branchGuid in this._pendingBranchPromises ||
			branchGuid in this._writeQueue
		);
	}

	/**
	 * Adds a promise for a commit to the list
	 * @param {String} branchGuid - Branch guid
	 * @param {String} commitGuid - Commit guid
	 * @param {Promise} promise - Promise to retain
	 * @return {Promise} - Returns the promise
	 */
	async _addPendingCommitPromise(branchGuid, commitGuid, promise) {
		if (!this._pendingCommitPromises[branchGuid]) {
			logger.trace(`Creating pending commit promises collection for branch ${branchGuid}`);
			this._pendingCommitPromises[branchGuid] = {};
		}
		logger.trace(`Adding pending promise for commit ${commitGuid}`);
		this._pendingCommitPromises[branchGuid][commitGuid] = promise;

		let cleanUp = () => {
			if (this._pendingCommitPromises[branchGuid]) {
				logger.trace(`Deleting pending commit promise for commit ${commitGuid}`);
				delete this._pendingCommitPromises[branchGuid][commitGuid];
				if (Object.keys(this._pendingCommitPromises[branchGuid]).length === 0) {
					logger.trace(`Deleting pending commit promise collection for branch ${branchGuid}`);
					delete this._pendingCommitPromises[branchGuid];
				}
			}
		};

		this._pendingCommitPromises[branchGuid][commitGuid].then(cleanUp, cleanUp);

		return promise;
	}

	/**
	 * Adds a promise for a branch to the list
	 * @param {String} branchGuid - Branch guid
	 * @param {function} theFunction - Function creating a promise to retain
	 * @return {Promise} - Returns the promise
	 */
	async _addPendingBranchPromise(branchGuid, theFunction) {
		let thePromise = theFunction();
		this._pendingBranchPromises[branchGuid] = thePromise;

		let cleanUp = () => {
			if (this._pendingBranchPromises[branchGuid]) {
				delete this._pendingBranchPromises[branchGuid];
			}
		};

		thePromise.then(cleanUp, cleanUp);

		return thePromise;
	}

	/**
	 * Waits until a commit is ingested for a branch. If not queued
	 * it will trigger the ingestion up to this point
	 * @param {String} branchGuid - Guid of the branch
	 * @param {String} commitGuid - Guid of the commit
	 * @return {Promise} - Resolves when the commit was processed
	 */
	async waitUntilCommitApplied(branchGuid, commitGuid) {
		if (this._lockedBranches.has(branchGuid)) {
			throw new OperationError(
				`Branch ${branchGuid} locked for deletion`,
				"lockQueuesForDeletion",
				HTTPStatus.BAD_REQUEST,
				OperationError.FLAGS.QUIET,
			);
		}

		if (
			this._pendingCommitPromises[branchGuid] &&
			this._pendingCommitPromises[branchGuid][commitGuid]
		) {
			// Currently inserting.  Hook on the promise
			return this._pendingCommitPromises[branchGuid][commitGuid];
		} else {
			try {
				// Let's see if it was already inserted
				await this._commitManager.getCommit(commitGuid);
				return Promise.resolve({ status: "existing" });
			} catch (ex) {
				// Not inserted
				if (ex.statusCode === HTTPStatus.NOT_FOUND) {
					let lastKnownCommitGuid = await this._getLastCommitGuid(branchGuid);

					logger.trace(
						`Waiting for  ${commitGuid}, but last known commit was ` +
							`${lastKnownCommitGuid}.  Fetching.`,
					);

					let commitFound = false;
					let lastWritePromise;
					let parentGuid = lastKnownCommitGuid;
					let minGuid = lastKnownCommitGuid;
					do {
						// Let's fetch a page of results
						let fetchedResults = await this._fetchSome(branchGuid, commitGuid, minGuid);
						commitFound = fetchedResults.find((fr) => fr.guid === commitGuid) !== undefined;
						fetchedResults.forEach((fr) => {
							lastWritePromise = this.queueCommitGracefully(fr);
							lastWritePromise.catch((ex2) => {
								logger.warn(
									`Failed writing a fetched commit for branch ${branchGuid}, commit ${fr.guid}`,
									ex2,
								);
							});
							parentGuid = fr.guid;
						});
						minGuid = parentGuid;
					} while (!commitFound);
					return lastWritePromise;
				} else {
					throw ex;
				}
			}
		}
	}

	/**
	 * Waits until a branch is created, if not queued
	 * It will trigger the ingestion up to this point
	 * @param {String} branchGuid - Guid of the branch
	 * @return {Promise} - Resolves when the commit was processed
	 */
	async waitUntilBranchCreated(branchGuid) {
		if (this._lockedBranches.has(branchGuid)) {
			throw new OperationError(
				`Branch ${branchGuid} locked for deletion`,
				"lockQueuesForDeletion",
				HTTPStatus.BAD_REQUEST,
				OperationError.FLAGS.QUIET,
			);
		}

		if (this._pendingBranchPromises[branchGuid]) {
			// Currently inserting.  Hook on the promise
			return this._pendingBranchPromises[branchGuid];
		} else {
			try {
				// Let's see if it was already inserted
				await this._branchManager.getBranch(branchGuid);
				return Promise.resolve({ status: "existing" });
			} catch (ex) {
				// Not inserted
				if (ex.statusCode === HTTPStatus.NOT_FOUND) {
					// Re-check if it got queued while we were checking;
					if (this._pendingBranchPromises[branchGuid]) {
						// Currently inserting.  Hook on the promise
						return this._pendingBranchPromises[branchGuid];
					} else {
						let branchInfo = await this._pssClient.getBranch(branchGuid);

						if (
							!branchInfo.branch.meta ||
							!branchInfo.branch.meta.materializedHistory ||
							!branchInfo.branch.meta.materializedHistory.enabled
						) {
							return Promise.reject(
								new OperationError(
									"Waiting for a branch not opted-in for MHS",
									"waitUntilBranchCreated",
									HTTPStatus.BAD_REQUEST,
									OperationError.FLAGS.QUIET,
								),
							);
						}

						let rootCommitGuid =
							(branchInfo.branch.parent &&
								branchInfo.branch.parent.commit &&
								branchInfo.branch.parent.commit.guid) ||
							branchInfo.repository.rootCommit.guid;

						return this.queueBranchGracefully({
							guid: branchGuid,
							rootCommitGuid: rootCommitGuid,
							meta: branchInfo.branch.meta,
						});
					}
				} else {
					throw ex;
				}
			}
		}
	}

	/**
	 * Fetches a commit range
	 * @param {String} branchGuid - Guid of the branch
	 * @param {String} commitGuid - Guid of the commit
	 * @param {String} parentCommitGuid - Guid of the parent
	 * @return {Array} - List of commit tasks
	 */
	async _fetchSome(branchGuid, commitGuid, parentCommitGuid) {
		// Fetch a batch of the missing range
		let commits = await this._pssClient.getCommitRange({
			branchGuid: branchGuid,
			minCommitGuid: parentCommitGuid,
			maxCommitGuid: commitGuid,
			limit: MAX_COMMITS_TO_REPAIR_IN_A_BATCH,
		});

		if (commits.commits.length === 0) {
			throw new OperationError(
				`Commit ${commitGuid} not found!`,
				"_fetchSome",
				HTTPStatus.NOT_FOUND,
				OperationError.FLAGS.QUIET,
			);
		}

		let previousGuid = parentCommitGuid;
		let commitTasks = commits.commits.map((c) => {
			let pg = previousGuid;
			previousGuid = c.guid;
			return {
				guid: c.guid,
				parentGuid: pg,
				meta: c.meta,
				changeSet: c.changeSet,
				branchGuid: branchGuid,
			};
		});

		return commitTasks;
	}

	/**
	 * The worker that validates the topology between an incoming commit and the DB or write queue
	 * @param {Object} params - Arguments
	 * @param {Object} params.task - The commit request
	 * @param {Promise} params.taskDp - A deferred promise to resolve when the write is completed
	 */
	async _validateTopologyWorker({ task, taskDp }) {
		const _tryToFetchMissingAndQueue = async (lastKnownCommit) => {
			let found = true;
			let itemSearchingParent = task.parentGuid;

			let parentsFound = [];

			let topologyWorkerQueue = [...this._validateTopologyQueue[task.branchGuid]];
			do {
				// Let's try to find if the hole isn't in the queue already
				let taskAndDp = topologyWorkerQueue.find(
					({ task: queueItem }) => queueItem.guid === itemSearchingParent,
				);

				if (taskAndDp) {
					let { task: expectedParent, taskDp: expectedDp } = taskAndDp;
					itemSearchingParent = expectedParent.parentGuid;
					parentsFound.unshift({
						task: expectedParent,
						taskDp: expectedDp,
					});
				} else {
					found = false;
				}
			} while (found);

			parentsFound.push({
				task: task,
				taskDp: taskDp,
			});

			// At this point, we built as much as we could from the chain
			// Did we plug the hole completely?
			if (itemSearchingParent !== lastKnownCommit) {
				logger.trace(
					`Item searching parent ${itemSearchingParent} ` +
						` was not the last known commit ${lastKnownCommit}.  Fetching`,
				);
				let minCommit = lastKnownCommit;
				// No we didn't find it all.
				// Fetch from the last known point to the last found
				let allCommitsFound = false;
				let lastPromise;
				do {
					// Let's fetch a page of results
					let fetchedResults = await this._fetchSome(
						task.branchGuid,
						itemSearchingParent,
						minCommit,
					);
					// We know we're done fetching the commits when we fetched the parent of the commit
					// Triggering the fetches
					allCommitsFound =
						fetchedResults.find((fr) => fr.guid === itemSearchingParent) !== undefined;

					// Refresh the topology worker queue since it could have changed with the fetchSome IO
					topologyWorkerQueue = [...this._validateTopologyQueue[task.branchGuid]];

					fetchedResults.forEach((fr) => {
						// Was it somewhere in the topology queue?
						let correspondingInTopologyQueue = topologyWorkerQueue.find(
							({ task: queueItem }) => queueItem.guid === fr.guid,
						);

						if (correspondingInTopologyQueue) {
							// Queue already and bind the promise
							let { task: foundTask, taskDp: foundDp } = correspondingInTopologyQueue;
							foundTask.previouslyCompleted = true;
							lastPromise = foundDp;
							this._queueCommit(foundTask)
								.then((res) => {
									logger.trace(`Done writing ${foundTask.guid}`);
									foundDp.resolve(res);
								})
								.catch((ex2) => {
									logger.trace(`Failed writing ${foundTask.guid}`, ex2);
									foundDp.reject(ex2);
								});
						} else {
							// No?  Just add it as a pending promise in case someone later hooks to it
							lastPromise = this._addPendingCommitPromise(
								task.branchGuid,
								fetchedResults.guid,
								this._queueCommit(fr),
							);
						}
					});

					minCommit = _.last(fetchedResults).guid;
					// Await until the insertions are completed before fetching the next page as it can get big in memory.
					await lastPromise;
				} while (!allCommitsFound);
			}

			parentsFound.forEach((pf) => {
				let { task: innerTask, taskDp: innerDp } = pf;
				innerTask.previouslyCompleted = true;
				this._queueCommit(innerTask)
					.then((res) => {
						logger.trace(`Done writing ${innerTask.guid}`);
						innerDp.resolve(res);
					})
					.catch((ex2) => {
						logger.trace(`Failed writing ${innerTask.guid}`);
						innerDp.reject(ex2);
					});
			});
		};

		if (this._errorsPerBranch[task.branchGuid]) {
			throw this._errorsPerBranch[task.branchGuid];
		}

		if (task.previouslyCompleted) {
			logger.trace(`Item ${task.guid} was processed as part of compensation, skipping`);
			return;
		}

		try {
			logger.trace(`Validating uniqueness of ${task.guid}`);
			await this._commitManager.getCommit(task.guid);
			logger.trace(`Uniqueness of ${task.guid} failed.  Resolving with existing`);
			// Commit already existing.  Resolve early
			taskDp.resolve({ status: "existing" });
		} catch (ex) {
			const change = {
				guid: task.guid,
				changeSet: new ChangeSet(task.changeSet),
				referenceGuid: task.parentGuid,
				remoteHeadGuid: task.meta && task.meta.remoteHeadGuid,
				localBranchStart: task.meta && task.meta.localBranchStart,
			};

			this._cache.set(change.guid, _.cloneDeep(change));

			// Commit not already existing  This is where the fun begins
			if (ex.statusCode === HTTPStatus.NOT_FOUND) {
				let lastCommitGuid = await this._getLastCommitGuid(task.branchGuid);

				if (lastCommitGuid !== task.parentGuid && lastCommitGuid !== task.guid) {
					// Not on tip!
					if (task.rebase) {
						// If rebase mode is active, we have to check, whether the parent commit exists
						try {
							await this._commitManager.getCommit(task.parentGuid);
							logger.info("Found parent commit, rebasing");

							await rebaseToRemoteChanges(
								change,
								this.getUnrebasedChange.bind(this),
								this.getRebasedChanges.bind(this, lastCommitGuid),
								true,
							);

							task.parentGuid = lastCommitGuid;

							// Enqueue the updated task
							logger.trace(`Queuing for write ${lastCommitGuid}`);
							this._queueCommit(task).then(
								(res) => {
									logger.trace(`Done writing ${lastCommitGuid}`);
									taskDp.resolve(res);
								},
								(ex2) => {
									logger.trace(`Failed writing ${lastCommitGuid}`);
									taskDp.reject(ex2);
								},
							);
						} catch (e) {
							throw new Error("Failed to fetch parent commit: " + e.message);
						}
					} else {
						// Fetch missing and queue
						logger.trace(`Fetching hole between ${lastCommitGuid} and ${task.guid}`);
						await _tryToFetchMissingAndQueue(lastCommitGuid).catch((ex2) => {
							logger.warn("Failed compensating for a hole", ex2);
							taskDp.reject(ex2);
						});
					}
				} else {
					if (lastCommitGuid === task.guid) {
						taskDp.resolve({ status: "existing" });
					} else {
						logger.trace(`Queuing for write ${lastCommitGuid}`);
						// On tip! Just queue
						this._queueCommit(task).then(
							(res) => {
								logger.trace(`Done writing ${lastCommitGuid}`);
								taskDp.resolve(res);
							},
							(ex2) => {
								logger.trace(`Failed writing ${lastCommitGuid}`);
								taskDp.reject(ex2);
							},
						);
					}
				}
			} else {
				throw ex;
			}
		}
	}

	async getUnrebasedChange(guid) {
		// TODO: As a first version, we can rely on a cache here, but for this
		// service to be reliable (e.g. after a restart or load shedding), we
		// need to have a mechanism to fetch the missing commits from the database.
		return this._cache.get(guid);
	}

	async getRebasedChanges(lastCommitGuid, startGuid, endGuid) {
		const remoteChanges = [];
		let currentCommitGUID = endGuid || lastCommitGuid;

		// TODO: Warning!  this is rather slow, as we linearly traverse the commit chain.
		// Currently the MaterializedHistory does not have an index to retrieve a commit range
		//  Maybe we should add such an index?
		//  On the other hand, maybe a cache is sufficient,
		// since we usually should only need a few commits prior to the tip.
		while (currentCommitGUID != startGuid) {
			let commit = await this._commitManager.getCommit(currentCommitGUID);
			let changeSet = await this._commitManager.getCommitCS({
				guid: currentCommitGUID,
			});

			remoteChanges.push({
				guid: currentCommitGUID,
				changeSet: changeSet.changeSet,
			});
			currentCommitGUID = commit.commit.parentGuid;
		}
		return remoteChanges;
	}

	/**
	 * Returns the last ingested commit guid for a branch
	 * @param {String} branchGuid - Branch guid
	 * @return {String} - Last ingested commit guid
	 */
	async _getLastCommitGuid(branchGuid) {
		let lastCommitGuid;
		// Not already inserting, but something is happening for this branch
		if (this._writeQueue[branchGuid] && this._writeQueue[branchGuid].length() > 0) {
			// Are we pushing a commit subsequent to the end of the queue
			lastCommitGuid = _.last([...this._writeQueue[branchGuid]]).guid;
		} else {
			// Nothing happening for that branch
			// Let's check if we are on tip
			if (this._currentlyWritingCommit[branchGuid]) {
				lastCommitGuid = this._currentlyWritingCommit[branchGuid].guid;
			} else {
				try {
					let theBranch = await this._branchManager.getBranch(branchGuid);
					lastCommitGuid = theBranch.headCommitGuid;
				} catch (ex2) {
					if (ex2.statusCode === HTTPStatus.NOT_FOUND) {
						await this.waitUntilBranchCreated(branchGuid);

						let theBranch = await this._branchManager.getBranch(branchGuid);
						lastCommitGuid = theBranch.headCommitGuid;
					} else {
						throw ex2;
					}
				}
			}
		}
		return lastCommitGuid;
	}

	/**
	 * Queues a commit for a branch.
	 * @param {Object} commitReq - Commit to create
	 * @return {Promise} - A promise that resolves after the commit was created
	 */
	queueCommitGracefully(commitReq) {
		if (this._lockedBranches.has(commitReq.branchGuid)) {
			return Promise.reject(
				new OperationError(
					`Branch ${commitReq.branchGuid} locked for deletion`,
					"lockQueuesForDeletion",
					HTTPStatus.BAD_REQUEST,
					OperationError.FLAGS.QUIET,
				),
			);
		}

		// Commit already pending, return the existing promise
		if (
			this._pendingCommitPromises[commitReq.branchGuid] &&
			this._pendingCommitPromises[commitReq.branchGuid][commitReq.guid]
		) {
			logger.trace(`Commit ${commitReq.guid} already queued, skipping the processing`);
			return this._pendingCommitPromises[commitReq.branchGuid][commitReq.guid];
		}

		let work = async () => {
			if (!this._validateTopologyQueue[commitReq.branchGuid]) {
				this._validateTopologyQueue[commitReq.branchGuid] = asyncQueue(
					this._validateTopologyWorker.bind(this),
				);

				this._validateTopologyQueue[commitReq.branchGuid].drain().then(() => {
					delete this._validateTopologyQueue[commitReq.branchGuid];
				});
			}

			let dp = new DeferredPromise();
			this._validateTopologyQueue[commitReq.branchGuid].push(
				{ task: commitReq, taskDp: dp },
				(err, result) => {
					if (err) {
						dp.reject(err);
					}
				},
			);

			return dp;
		};

		return this._addPendingCommitPromise(commitReq.branchGuid, commitReq.guid, work());
	}

	/**
	 * Queues a branch creation for insertion
	 * @param {Object} branchReq - Branch creation request body
	 * @return {Promise} - Resolves when the branch is created
	 */
	async queueBranchGracefully(branchReq) {
		if (this._lockedBranches.has(branchReq.guid)) {
			throw new OperationError(
				`Branch ${branchReq.guid} locked for deletion`,
				"lockQueuesForDeletion",
				HTTPStatus.BAD_REQUEST,
				OperationError.FLAGS.QUIET,
			);
		}

		// Commit already pending, return the existing promise
		if (this._pendingBranchPromises[branchReq.guid]) {
			logger.trace(`Branch ${branchReq.guid} already queued, skipping the processing`);
			return this._pendingBranchPromises[branchReq.guid];
		}

		let work = async () => {
			if (branchReq.parentBranchGuid) {
				await this.waitUntilCommitApplied(
					branchReq.parentBranchGuid,
					branchReq.rootCommitGuid,
				);
			}
			if (this._lockedBranches.has(branchReq.guid)) {
				throw new OperationError(
					`Branch ${branchReq.guid} locked for deletion`,
					"lockQueuesForDeletion",
					HTTPStatus.BAD_REQUEST,
					OperationError.FLAGS.QUIET,
				);
			}
			return await this._branchManager.createBranch(branchReq);
		};

		return this._addPendingBranchPromise(branchReq.guid, work);
	}

	/**
	 * Queues a commit for a branch.
	 * @param {Object} commitReq - Commit to create
	 * @return {Promise} - A promise that resolves after the commit was created
	 */
	async _queueCommit(commitReq) {
		const branchGuid = commitReq.branchGuid;
		const commitGuid = commitReq.guid;
		logger.debug(
			`Queuing commit ${commitGuid} for branch ${branchGuid}, parent ${commitReq.parentGuid}`,
		);
		if (!this._writeQueue[branchGuid]) {
			this._writeQueue[branchGuid] = asyncQueue(async (task) => {
				if (this._errorsPerBranch[branchGuid]) {
					throw this._errorsPerBranch[task.branchGuid];
				}

				this._currentlyWritingCommit[task.branchGuid] = task;
				if (!task.changeSet) {
					let fetchedCommit = await this._pssClient.getCommit({
						branchGuid: task.branchGuid,
						commitGuid: task.guid,
					});
					task.changeSet = fetchedCommit.commit.changeSet;
				}

				logger.debug(
					`Beginning to process ${task.guid} for branch ${task.branchGuid}, parent ${task.parentGuid}`,
				);

				let tryCount = 0;
				try {
					let result = await asyncRetry(async (rc) => {
						if (tryCount > 0) {
							logger.info("Retried applying commit", task);
						}
						tryCount++;
						return await this._commitManager.createCommit(task);
					});

					logger.debug(
						`Done processing ${task.guid} for branch ${task.branchGuid}, parent ${task.parentGuid}`,
					);

					return result;
				} catch (ex) {
					let childrenError = new Error(
						`Failed applying a parent commit ${task.guid} for branch ${task.branchGuid}` +
							`, error was ${ex.message}`,
					);
					childrenError.stack = ex.stack;
					this._flushBranchQueue(task.branchGuid, childrenError);
					logger.debug(
						`Failed processing ${task.guid} for branch ${task.branchGuid}, parent ${task.parentGuid}`,
					);
					return Promise.reject(ex);
				} finally {
					this._currentlyWritingCommit[task.branchGuid] = null;
				}
			});

			this._writeQueue[branchGuid].drain().then(() => {
				delete this._writeQueue[branchGuid];
				delete this._currentlyWritingCommit[branchGuid];
			});
		}

		return new Promise((resolve, reject) => {
			this._writeQueue[branchGuid].push(commitReq, (error, result) => {
				// For commits that were queued by read repair we continue on client errors.
				// Could be due to a write that got queued while we fetched from PS.
				logger.debug(
					`Write callback: error = ${JSON.stringify(error)} ${
						error && error.stack
					}, result = ${JSON.stringify(result)}`,
				);

				if (error) {
					reject(error);
				} else {
					resolve(result);
				}
			});
		});
	}

	/**
	 * Cancels and flush the branch queue by failing every subsequent operation
	 * @param {String} branchGuid - Guid of the branch
	 * @param {Error} ex - Exception causing the flush of the queue
	 */
	_flushBranchQueue(branchGuid, ex) {
		if (!this._writeQueue[branchGuid] && !this._validateTopologyQueue[branchGuid]) {
			return;
		}
		this._errorsPerBranch[branchGuid] = ex;

		if (this._validateTopologyQueue[branchGuid]) {
			this._validateTopologyQueue[branchGuid].drain().then(() => {
				if (!this._writeQueue[branchGuid] || this._writeQueue[branchGuid].idle()) {
					delete this._errorsPerBranch[branchGuid];
				}
			});
		}

		if (this._writeQueue[branchGuid]) {
			this._writeQueue[branchGuid].drain().then(() => {
				if (
					!this._validateTopologyQueue[branchGuid] ||
					this._validateTopologyQueue[branchGuid].idle()
				) {
					delete this._errorsPerBranch[branchGuid];
				}
			});
		}
	}

	/**
	 * Locks the write and read processes for branches
	 * Will await for pending operations to complete
	 * And then invalidate every subsequent operation
	 * @param {Array<String>} branchGuids - Guids of the branches to lock
	 */
	async lockQueuesForDeletion(branchGuids) {
		branchGuids.forEach((bg) => {
			this._lockedBranches.add(bg);
			this._flushBranchQueue(
				bg,
				new OperationError(
					`Branch ${bg} locked for deletion`,
					"lockQueuesForDeletion",
					HTTPStatus.BAD_REQUEST,
					OperationError.FLAGS.QUIET,
				),
			);
		});

		return Promise.all(
			branchGuids.map(
				(bg) =>
					new Promise(async (res, rej) => {
						let branchResolved = !this._pendingBranchPromises[bg];
						let wqResolved = !this._writeQueue[bg] || this._writeQueue[bg].idle();
						let vtqResolved =
							!this._validateTopologyQueue[bg] || this._validateTopologyQueue[bg].idle();

						const resolveIfDone = () => {
							if (wqResolved && vtqResolved && branchResolved) {
								res();
							}
						};

						resolveIfDone();

						if (!wqResolved) {
							await this._writeQueue[bg].drain();
							wqResolved = true;
							resolveIfDone();
						}

						if (!vtqResolved) {
							await this._validateTopologyQueue[bg].drain();
							vtqResolved = true;
							resolveIfDone();
						}

						if (!branchResolved) {
							let afterBranch = () => {
								branchResolved = true;
								resolveIfDone();
							};
							this._pendingBranchPromises[bg].then(afterBranch, afterBranch);
						}
					}),
			),
		);
	}

	/**
	 * Cleanups the queues locked for deletion
	 * @param {Array<String>} branchGuids - Guids of the branches to clear for
	 */
	async clearQueuesForDeletion(branchGuids) {
		branchGuids.forEach((bg) => this._lockedBranches.delete(bg));
	}
}

module.exports = BranchWriteQueue;

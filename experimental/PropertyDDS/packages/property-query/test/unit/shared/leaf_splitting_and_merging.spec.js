/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* globals PropertyFactory */
/* eslint no-unused-expressions: 0 */

const MaterializedHistoryService = require("../../../src/materialized_history_service/materialized_history_service");
const InMemoryBackend = require("../../../src/materialized_history_service/storage_backends/in_memory");
const SerializerFactory = require("../../../src/materialized_history_service/serialization/factory");
const ChangeSet = require("@fluid-experimental/property-changeset").ChangeSet;
const _ = require("lodash");
const deepCopy = _.cloneDeep;
const generateGUID = require("@fluid-experimental/property-common").GuidUtils.generateGUID;
const DeterministicRandomGenerator =
	require("@fluid-experimental/property-common").DeterministicRandomGenerator;
const PathHelper = require("@fluid-experimental/property-changeset").PathHelper;
const mergeChunkedChangeSet =
	require("../../../src/materialized_history_service/change_set_processing/merge_chunked_changeset").mergeChunkedChangeSet;
const {
	getPathFromChunkBoundaryFormat,
} = require("../../../src/materialized_history_service/change_set_processing/chunk_change_set");
const {
	generateDeterministicGuid,
	insertSuccessiveProperties,
	convertKey,
} = require("./test_utils");
const stripReversibleChangeSet = require("../../../src/materialized_history_service/change_set_processing/strip_reversible_changeset");
const SystemMonitor = require("../../../src/utils/system_monitor");
const NodeDependencyManager = require("../../../src/materialized_history_service/node_dependency_manager");
//const PSSClient = require('../../../src/server/pss_client');
const BranchWriteQueue = require("../../../src/materialized_history_service//branch_write_queue");
const StorageManager = require("../../../src/materialized_history_service/storage_backends/storage_manager");

/**
 * Returns a btree settings object from the settings
 * @param {Settings} settings - Settings object
 * @return {Object} - Settings in the form of an object
 */
function getBtreeParameters(settings) {
	return {
		chunkSize: settings.get("mh:chunkSize"),
		initialChunkSizeFactor: settings.get("mh:initialChunkSizeFactor"),
		splitLimitFactor: settings.get("mh:splitLimitFactor"),
		mergeLimitFactor: settings.get("mh:mergeLimitFactor"),
		maxNodeSizeFactor: settings.get("mh:maxNodeSizeFactor"),
		maxNodeSubEntries: settings.get("mh:maxNodeSubEntries"),
		bTreeOrder: settings.get("mh:bTreeOrder"),
		nodesPerHierarchicalHistoryLevel: settings.get("mh:nodesPerHierarchicalHistoryLevel"),
	};
}

describe("Node", function () {
	let randomGuids = [];
	const numRandomTests = 30;
	let summedTime = 0;

	before(() => {
		let outerRandom = new DeterministicRandomGenerator("fcfaa9c7-8483-85ca-04ee-c20458f86532");
		for (let i = 0; i < numRandomTests; i++) {
			randomGuids.push(generateDeterministicGuid(outerRandom));
		}

		PropertyFactory.register({
			inherits: "NamedProperty",
			typeid: "adsk.test:TestProperty-1.0.0",
			properties: [
				{ id: "name", typeid: "String" },
				{ id: "data", typeid: "NodeProperty" },
			],
		});
	});
	let DEFAULT_SETTINGS = {
		"mh:chunkSize": 16384,
		"mh:initialChunkSizeFactor": 1.0,
		"mh:splitLimitFactor": 1.5,
		"mh:mergeLimitFactor": 0.6,
		"mh:bTreeOrder": 5,
		"mh:nodesPerHierarchicalHistoryLevel": 3,
		"mhTest:numRandomizedSquashedChangesetTests": 0,
	};

	let removeSuccessiveProperties = function (in_root, in_start, in_end) {
		let sortedKeys = in_root.getIds();
		sortedKeys.sort();

		let startIndex = _.sortedIndex(sortedKeys, convertKey(in_start));
		let endIndex = _.sortedIndex(sortedKeys, convertKey(in_end));
		for (let l = startIndex; l < endIndex; l++) {
			in_root.remove(sortedKeys[l]);
		}
	};
	let getStartPathFromTree = function (in_path, in_tree) {
		let current = in_tree;
		for (let i = 0; i < in_path.length; i++) {
			current = current.node || current;
			current = current.children[in_path[i]];
		}
		return current.startPath.substr(0, current.startPath.length - 1) / 1e16;
	};

	let runMhsTest = async function (in_modificationFunctions, in_settings, in_options = {}) {
		let meta = in_options.meta || {};
		let inSettings = _.defaults(in_settings || {}, DEFAULT_SETTINGS);
		let startTime;

		// Create a node that serves as working space for the test functions
		let root = PropertyFactory.create("NodeProperty");

		// Crate a settings object for this test
		let settings = require("../../test_settings");
		_.forEach(inSettings, (value, name) => settings.set(name, value));

		// Create a storage backend
		let storageBackend = new InMemoryBackend({ settings });

		let sf = new SerializerFactory({ settings });

		//const pssClient = new PSSClient();
		const pssClient = null;
		const branchWriteQueue = new BranchWriteQueue({
			pssClient,
		});

		const storageManager = new StorageManager({
			backend: storageBackend,
			settings: settings,
			serializer: sf.getSerializer(),
		});

		// And create a materialized history service
		let service = new MaterializedHistoryService({
			settings,
			storageManager,
			serializer: sf.getSerializer(),
			systemMonitor: new SystemMonitor(),
			nodeDependencyManager: new NodeDependencyManager(storageBackend),
			branchWriteQueue,
		});

		// Create a branch for the following test
		let branchGuid = generateGUID();
		let rootCommitGuid = generateGUID();

		await service.createBranch({
			guid: branchGuid,
			meta,
			rootCommitGuid: rootCommitGuid,
		});

		let commitInformation = [
			{
				fullChangeSet: {},
				guid: rootCommitGuid,
				changeSet: {},
				branchGuid: branchGuid,
			},
		];

		let lastCommitGuid = rootCommitGuid;
		let promise1 = Promise.resolve();
		in_modificationFunctions.forEach((fun) => {
			promise1 = promise1
				.then(() => {
					return Promise.all([
						service._getAllLeafsForCommit({
							guid: lastCommitGuid,
							bTreeParameters: getBtreeParameters(settings),
						}),
						service._commitManager._getFullTree({
							guid: lastCommitGuid,
							bTreeParameters: getBtreeParameters(settings),
						}),
					]);
				})
				.then(([leafs, tree]) => {
					// Make sure the leafs all have correct start paths
					if (leafs.length > 1) {
						for (let i = 0; i < leafs.length; i++) {
							if (i > 1) {
								expect(leafs[i].startPath).not.to.be.undefined;
								expect(i === 1 || leafs[i - 1].startPath < leafs[i].startPath).to.be.true;
							}

							let leafSize = JSON.stringify(leafs[i].changeSet).length;
							expect(leafSize).to.be.gte(
								settings.get("mh:chunkSize") * settings.get("mh:mergeLimitFactor"),
							);

							// This check is disabled intentionally. The upper leaf size limit is not enforced.
							// For example, if string is longer that the chunk size, we will create a bigger leaf node
							// to contain it
							// console.assert( leafSize <= settings.get('mh:chunkSize') *
							//                          settings.get('mh:splitLimitFactor'));
						}
					}

					// Invoke the function to create a new modified version of the property tree
					return Promise.resolve(fun(root, { leafs, service, commitInformation, tree }));
				})
				.then(async () => {
					// Determine whether there has been any change
					if (root.hasPendingChanges()) {
						// If there were changes, apply them to the previous changes to create a normlized changeset for
						// the state in node property
						let changes = root.serialize({ dirtyOnly: true });
						let lastChangeSet = new ChangeSet(
							deepCopy(commitInformation[commitInformation.length - 1].fullChangeSet),
						);
						if (in_options.useReversibleChangeSets) {
							let changesChangeSet = new ChangeSet(changes);
							changesChangeSet._toReversibleChangeSet(lastChangeSet.getSerializedChangeSet());
						}
						lastChangeSet.applyChangeSet(changes);

						// And add a corresponding commit node to the materialized history service
						let commitGuid = generateGUID();
						startTime = new Date();
						let commitPromise = service.createCommit({
							guid: commitGuid,
							meta: {},
							branchGuid,
							parentGuid: lastCommitGuid,
							changeSet: JSON.stringify(changes),
						});

						commitInformation.push({
							guid: commitGuid,
							fullChangeSet: lastChangeSet.getSerializedChangeSet(),
							changeSet: changes,
							branchGuid: branchGuid,
						});
						lastCommitGuid = commitGuid;

						root.cleanDirty();

						await commitPromise;
					}
				})
				.then(() => {
					if (startTime) {
						summedTime += new Date() - startTime;
					}
				});
		});

		// Now we check, whether all generated commits can be retrieved

		await promise1;

		let promise2 = Promise.resolve();
		for (let i = 0; i < commitInformation.length; i++) {
			(() => {
				let commitInfo = commitInformation[i];
				let index = i;
				global.ci = commitInformation;
				promise2 = promise2
					.then(() => {
						return Promise.all([
							service.getCommitMV({
								guid: commitInfo.guid,
								branchGuid: branchGuid,
							}),
							index > 0
								? service.getCommitCS({
										guid: commitInfo.guid,
										branchGuid: branchGuid,
									})
								: undefined,
						]);
					})
					.then(([materializedViewCS, commitCS]) => {
						if (in_options.materializedViewCheckFunction) {
							in_options.materializedViewCheckFunction(
								materializedViewCS.changeSet,
								index,
								commitInformation,
							);
						}

						// Remove any server generated indices from the response
						let changeSet = materializedViewCS.changeSet;
						if (
							changeSet.insert &&
							changeSet.insert.NodeProperty &&
							changeSet.insert.NodeProperty.indices
						) {
							delete changeSet.insert.NodeProperty.indices;

							if (_.isEmpty(changeSet.insert.NodeProperty)) {
								delete changeSet.insert.NodeProperty;
							}

							if (_.isEmpty(changeSet.insert)) {
								delete changeSet.insert;
							}
						}

						delete changeSet.remove;

						expect(changeSet).to.deep.equal(commitInfo.fullChangeSet);
						if (index > 0) {
							let strippedCS = new ChangeSet(commitCS.changeSet);
							if (!in_options.useReversibleChangeSets) {
								stripReversibleChangeSet.call(strippedCS);
								// strippedCS._stripReversibleChangeSet();

								strippedCS = strippedCS.getSerializedChangeSet();

								if (strippedCS.remove) {
									strippedCS.remove.sort();
								}
								if (commitInfo.changeSet.remove) {
									commitInfo.changeSet.remove.sort();
								}
							} else {
								strippedCS = strippedCS.getSerializedChangeSet();
							}

							// Remove any server generated indices from the response
							if (
								strippedCS.modify &&
								strippedCS.modify.NodeProperty &&
								strippedCS.modify.NodeProperty.indices
							) {
								delete strippedCS.modify.NodeProperty.indices;

								if (_.isEmpty(strippedCS.modify.NodeProperty)) {
									delete strippedCS.modify.NodeProperty;
								}

								if (_.isEmpty(strippedCS.modify)) {
									delete strippedCS.modify;
								}
							}

							expect(strippedCS).to.deep.equal(commitInfo.changeSet);
						}
						return service._commitManager._validateTree({
							guid: commitInfo.guid,
							bTreeParameters: getBtreeParameters(settings),
						});
					});
			})();
		}

		await promise2;

		for (let i = 0; i < inSettings["mhTest:numRandomizedSquashedChangesetTests"]; i++) {
			let random = new DeterministicRandomGenerator(randomGuids[i]);
			let startCommitIdx = random.irandom() % (commitInformation.length - 1);
			let endCommitIdx =
				startCommitIdx + (random.irandom() % (commitInformation.length - startCommitIdx)) + 1;

			let expectSquashedCS = new ChangeSet();
			_.forEach(commitInformation.slice(startCommitIdx + 1, endCommitIdx), (commit) =>
				expectSquashedCS.applyChangeSet(commit.changeSet),
			);

			let computedSquashedCS = await service.getSquashedCommitRange({
				branchGuid,
				oldCommitGuid: commitInformation[startCommitIdx].guid,
				newCommitGuid: commitInformation[endCommitIdx - 1].guid,
			});
			computedSquashedCS = computedSquashedCS.changeSet;

			stripReversibleChangeSet.call(new ChangeSet(computedSquashedCS));
			// new ChangeSet(computedSquashedCS)._stripReversibleChangeSet();

			expect(computedSquashedCS).to.deep.equal(expectSquashedCS.getSerializedChangeSet());
		}
	};

	describe("merging of", () => {
		let defaultSettings = {
			"mh:bTreeOrder": 3,
			"mh:chunkSize": 16384,
			"resultingNumLeafs": 7,
		};
		let deepTreeSettings = {
			"mh:bTreeOrder": 3,
			"mh:chunkSize": 4096,
			"resultingNumLeafs": 29,
		};

		let highOrderSettings = {
			"mh:bTreeOrder": 23,
			"mh:chunkSize": 1024,
			"resultingNumLeafs": 130,
		};

		let leafMergeTestCode = function (in_params) {
			let {
				leafsToDelete = [],
				leafsToModify = [],
				expectedNumLeafs = undefined,
				initialSize = 1040,
				settings,
			} = in_params;

			settings = settings || defaultSettings;
			expectedNumLeafs =
				expectedNumLeafs !== undefined
					? expectedNumLeafs
					: Math.max(1, settings.resultingNumLeafs - leafsToDelete.length);

			return runMhsTest(
				[
					(root) => {
						insertSuccessiveProperties(root, initialSize);
					},
					(root, { leafs }) => {
						for (let leafNumber of leafsToDelete.concat(leafsToModify)) {
							// Delete all properties in the specified leaf (which are not shared with the next leaf)
							let leafsInChunk1 = Object.keys(leafs[leafNumber].changeSet.insert.String);
							let leafsInChunk2 = leafs[leafNumber + 1]
								? Object.keys(leafs[leafNumber + 1].changeSet.insert.String)
								: [];
							for (let i = 0; i < leafsInChunk1.length; i++) {
								if (!_.includes(leafsInChunk2, leafsInChunk1[i])) {
									root.remove(leafsInChunk1[i]);
									if (_.includes(leafsToModify, leafNumber)) {
										// If this leaf should only be modifed we leave after the first deletion
										break;
									}
								}
							}
						}
					},
					(root, { leafs }) => {
						expect(leafs.length).to.equal(expectedNumLeafs);
					},
				],
				settings,
			);
		};
		let runTests = (in_settings) => {
			it("work when removing the first leaf", function () {
				return leafMergeTestCode({
					leafsToDelete: [0],
					settings: in_settings,
				});
			});
			it("work when removing the second leaf", function () {
				return leafMergeTestCode({
					leafsToDelete: [1],
					settings: in_settings,
				});
			});
			it("work when removing the third leaf", function () {
				return leafMergeTestCode({
					leafsToDelete: [2],
					settings: in_settings,
				});
			});
			it("work when removing all leafs", function () {
				return leafMergeTestCode({
					leafsToDelete: _.range(in_settings.resultingNumLeafs),
					settings: in_settings,
				});
			});
			it("not happen for small changes to the first leaf", function () {
				return leafMergeTestCode({
					leafsToDelete: [],
					leafsToModify: [0],
					settings: in_settings,
				});
			});
			it("not happen for small changes to the second leaf", function () {
				return leafMergeTestCode({
					leafsToDelete: [],
					leafsToModify: [1],
					settings: in_settings,
				});
			});
			it("not happen for small changes to the first two leafs", function () {
				return leafMergeTestCode({
					leafsToDelete: [],
					leafsToModify: [0, 1],
					settings: in_settings,
				});
			});
		};

		describe("shallow tree nodes should", () => {
			runTests(defaultSettings);

			it("work when removing first B-Tree leaf", function () {
				return leafMergeTestCode({
					leafsToDelete: [0, 1, 2],
					settings: defaultSettings,
				});
			});
			it("work when removing second B-Tree leaf", function () {
				return leafMergeTestCode({
					leafsToDelete: [3, 4],
					settings: defaultSettings,
				});
			});
			it("work when removing third B-Tree leaf", function () {
				return leafMergeTestCode({
					leafsToDelete: [5, 6],
					settings: defaultSettings,
				});
			});
		});

		describe("deeper tree nodes should", () => {
			runTests(deepTreeSettings);

			it("not happen for small changes to nodes in distant siblings", function () {
				return leafMergeTestCode({
					leafsToDelete: [],
					leafsToModify: [11, 12],
					settings: deepTreeSettings,
				});
			});
			it("work for deletions to nodes in distant siblings", function () {
				return leafMergeTestCode({
					leafsToDelete: [11, 12],
					settings: deepTreeSettings,
				});
			});
		});

		describe("trees with high order should", () => {
			runTests(highOrderSettings);

			it("not happen for small changes to nodes in distant siblings", function () {
				return leafMergeTestCode({
					leafsToDelete: [],
					leafsToModify: [11, 12],
					settings: highOrderSettings,
				});
			});
			it("work for deletions to nodes in distant siblings", function () {
				return leafMergeTestCode({
					leafsToDelete: [11, 12],
					settings: highOrderSettings,
				});
			});
		});
	});

	describe("splitting should work for", () => {
		let settings = {
			"mh:bTreeOrder": 3,
			"mh:chunkSize": 4096,
		};
		it("a single large commit", function () {
			return runMhsTest(
				[
					(root) => {
						insertSuccessiveProperties(root, 1040);
					},
					(root, { leafs }) => {
						expect(leafs.length).to.equal(29);
					},
				],
				settings,
			);
		});
		it("multiple smaller commits", function () {
			return runMhsTest(
				[
					// Add 1000 entries in 10 separate commits
					..._.range(0, 1000, 100).map((start) => {
						return (root) => {
							insertSuccessiveProperties(root, 100, start);
						};
					}),
					(root, { leafs }) => {
						expect(leafs.length).to.equal(28);
					},
				],
				settings,
			);
		});

		it("splitting commits in distant siblings", function () {
			return runMhsTest(
				[
					(root) => {
						insertSuccessiveProperties(root, 2000, 0.0, 0.2, true);
					},
					(root, { leafs, tree }) => {
						let limit = getStartPathFromTree([1, 0, 0, 0, 0], tree);
						insertSuccessiveProperties(root, 50, limit, limit + 1e-13, true);

						let limit2 = getStartPathFromTree([0, 2, 1, 1, 1], tree);
						insertSuccessiveProperties(root, 500, limit2, limit2 + 1e-13, true);
					},
				],
				settings,
			);
		});
	});

	describe("mixed changes", () => {
		let settings = {
			"mh:bTreeOrder": 3,
			"mh:chunkSize": 4096,
		};

		it("should work for one range removal and one range insertion", function () {
			return runMhsTest(
				[
					(root) => {
						insertSuccessiveProperties(root, 974, 0.0, 0.973, true);
					},
					(root, { leafs, tree }) => {
						insertSuccessiveProperties(root, 100, 0.01, 0.02, true);
						removeSuccessiveProperties(root, 0.713, 0.968);
					},
				],
				settings,
			);
		});

		it("should work for one range removal and one range insertion", function () {
			return runMhsTest(
				[
					(root) => {
						insertSuccessiveProperties(root, 838, 0.0, 0.837, true);
					},
					(root, { leafs, tree }) => {
						let limit = getStartPathFromTree([0, 1, 0, 1], tree);
						insertSuccessiveProperties(root, 280, limit + 1e-12, limit + 2e-12, true);

						let limit2 = getStartPathFromTree([2, 0, 1, 1], tree);
						let limit3 = getStartPathFromTree([2, 1, 1, 1], tree);
						removeSuccessiveProperties(root, limit2 + 1e-12, limit3 + 1e-12);
					},
				],
				settings,
			);
		});

		it("should work for one range removal and one range insertion", function () {
			return runMhsTest(
				[
					(root) => {
						insertSuccessiveProperties(root, 754, 0.0, 0.754, true);
					},
					(root, { leafs, tree }) => {
						let limit = getStartPathFromTree([0, 0, 1, 0], tree);
						insertSuccessiveProperties(root, 583, limit + 1e-12, limit + 2e-12, true);

						let limit2 = getStartPathFromTree([0, 0, 2, 0], tree);
						let limit3 = getStartPathFromTree([0, 1, 1, 1], tree);
						removeSuccessiveProperties(root, limit2 + 1e-12, limit3 + 1e-12);

						limit2 = getStartPathFromTree([0, 2, 1, 0], tree);
						limit3 = getStartPathFromTree([0, 2, 1, 1], tree);
						removeSuccessiveProperties(root, limit2 + 1e-12, limit3 + 1e-12);
					},
				],
				settings,
			);
		});

		it("should work when inserting and removing into the same leaf", function () {
			return runMhsTest(
				[
					(root) => {
						insertSuccessiveProperties(root, 1160, 0.0, 1.16, true);
					},
					(root, { leafs, tree }) => {
						let limit = getStartPathFromTree([0, 0, 0, 0, 1], tree);
						let limit2 = getStartPathFromTree([1, 1, 1, 1, 0], tree);
						removeSuccessiveProperties(root, limit, limit2);
						insertSuccessiveProperties(root, 150, limit + 1e-12, limit + 2e-12, true);
					},
				],
				settings,
			);
		});

		/*
		 * This test reproduces a bug where the system returned an invalid MV. This was triggered by a bug in
		 * chunk_change_set function failing on reversible changesets.
		 *
		 * What happened was, that a NodeProperty was first created, which was split in the middle of the property
		 * into two leafs. The content of the first leaf was then deleted, leaving only the empty NodeProperty within
		 * the first leaf node. When the whole NodeProperty then was deleted, the splitting of the remove operation failed
		 * leaving the empty NodeProperty within the first Node.
		 */
		it("should work with reversible changesets when removing an empty node", function () {
			let dataString = _.times(5000, () => "x").join("");
			return runMhsTest(
				[
					(root) => {
						// Create a Node Property
						root.insert("testProperty", PropertyFactory.create("NodeProperty"));

						// Add two strings to force the creation of two leaf nodes
						root
							.get("testProperty")
							.insert("stringA", PropertyFactory.create("String", undefined, dataString));
						root
							.get("testProperty")
							.insert("stringB", PropertyFactory.create("String", undefined, dataString));
					},
					(root, { leafs, tree }) => {
						expect(leafs.length).to.equal(2);
						expect(leafs[1].startPath).to.equal("testProperty\x00stringB\x00");

						// Remove property string A, which will leave the empty NodeProperty within the first leaf node
						root.get("testProperty").remove("stringA");

						// And insert some other data to make sure the first leaf node is not merged with the second
						root.insert("aaa", PropertyFactory.create("String", undefined, dataString));
					},
					(root, { leafs, tree }) => {
						expect(leafs.length).to.equal(2);
						expect(leafs[1].startPath).to.equal("testProperty\x00stringB\x00");

						// Now remove the whole NodeProperty
						root.remove("testProperty");
					},
				],
				settings,
				{
					useReversibleChangeSets: true,
				},
			);
		});

		it("should give the correct results with empty inserts", function () {
			let dataString = _.times(5000, () => "x").join("");
			return runMhsTest(
				[
					(root) => {
						// Create a Node Property
						root.insert("testProperty", PropertyFactory.create("NodeProperty"));

						// Add two strings to force the creation of three leaf nodes
						root
							.get("testProperty")
							.insert("stringA", PropertyFactory.create("String", undefined, dataString));
						root
							.get("testProperty")
							.insert("stringB", PropertyFactory.create("String", undefined, dataString));
						root
							.get("testProperty")
							.insert("stringC", PropertyFactory.create("String", undefined, dataString));
					},
					(root, { leafs, tree }) => {
						expect(leafs.length).to.equal(3);
						expect(leafs[1].startPath).to.equal("testProperty\x00stringB\x00");
						expect(leafs[2].startPath).to.equal("testProperty\x00stringC\x00");

						// Remove property string A and stringC, which will leave the empty NodeProperty within the
						// first leaf and last leaf node
						root.get("testProperty").remove("stringA");
						root.get("testProperty").remove("stringC");

						// And insert some other data to make sure the first leaf node is not merged with the second
						root.insert("aaa", PropertyFactory.create("String", undefined, dataString));
						root.insert("zzz", PropertyFactory.create("String", undefined, dataString));
					},
					async (root, { leafs, commitInformation, service }) => {
						expect(leafs.length).to.equal(3);
						let initalMV = await service.getCommitMV({
							guid: commitInformation[commitInformation.length - 1].guid,
							paths: ["testProperty.stringA"],
							followReferences: false,
							branchGuid: commitInformation[commitInformation.length - 1].branchGuid,
						});

						let finalMV = await service.getCommitMV({
							guid: commitInformation[commitInformation.length - 1].guid,
							paths: ["testProperty.stringD"],
							followReferences: false,
							branchGuid: commitInformation[commitInformation.length - 1].branchGuid,
						});

						expect(initalMV.changeSet).to.eql({
							insert: {
								NodeProperty: {
									testProperty: {},
								},
							},
						});
						expect(finalMV.changeSet).to.eql({
							insert: {
								NodeProperty: {
									testProperty: {},
								},
							},
						});

						// Now remove the whole NodeProperty
						root.remove("testProperty");
					},
					(root) => {
						root.insert("testProperty", PropertyFactory.create("NodeProperty"));
						root.remove("aaa");

						// Add a string, which will be within the first leaf
						root
							.get("testProperty")
							.insert("string1", PropertyFactory.create("String", undefined, dataString));
					},
					async (root, { leafs, commitInformation, service }) => {
						expect(leafs.length).to.equal(2);
						let initalMV = await service.getCommitMV({
							guid: commitInformation[commitInformation.length - 1].guid,
							paths: ["testProperty.stringA"],
							followReferences: false,
							branchGuid: commitInformation[commitInformation.length - 1].branchGuid,
						});

						let finalMV = await service.getCommitMV({
							guid: commitInformation[commitInformation.length - 1].guid,
							paths: ["testProperty.stringD"],
							followReferences: false,
							branchGuid: commitInformation[commitInformation.length - 1].branchGuid,
						});

						expect(initalMV.changeSet).to.eql({
							insert: {
								NodeProperty: {
									testProperty: {},
								},
							},
						});
						expect(finalMV.changeSet).to.eql({
							insert: {
								NodeProperty: {
									testProperty: {},
								},
							},
						});
					},
				],
				settings,
			);
		});
	});

	describe("getCommitMV", () => {
		let settings = {
			"mh:bTreeOrder": 3,
			"mh:chunkSize": 4096,
		};

		let getCommitMVTestFunction = (options = {}) => {
			let fetchedMV = {};
			let startPath = undefined;
			let allPaths = [];
			let fetchMVWithPaging = function (service, guid, tree, branchGuid) {
				// If a function is supplied for the paths, we allow the caller to
				// dynamically choose paths based on the tree structure
				if (_.isFunction(options.paths)) {
					options.paths = options.paths(tree);
				}

				return service
					.getCommitMV({
						guid: guid,
						paths: options.paths,
						pagingLimit: options.pagingLimit,
						pagingStartPath: startPath,
						ranges: options.ranges,
						branchGuid: branchGuid,
					})
					.then(({ changeSet, nextPagePath }) => {
						fetchedMV = mergeChunkedChangeSet([fetchedMV, changeSet]);
						if (nextPagePath) {
							startPath = nextPagePath;
							return fetchMVWithPaging(service, guid, undefined, branchGuid);
						} else {
							return fetchedMV;
						}
					});
			};

			return runMhsTest(
				[
					(root) => {
						for (let i = 0; i < 10; i++) {
							let property = PropertyFactory.create("NodeProperty");
							insertSuccessiveProperties(property, 100);
							root.insert("Node." + i, property);
							allPaths.push('"Node.' + i + '"');
						}
					},
					(root, { service, commitInformation, tree }) => {
						return fetchMVWithPaging(
							service,
							commitInformation[commitInformation.length - 1].guid,
							tree,
							commitInformation[commitInformation.length - 1].branchGuid,
						).then((materializedView) => {
							// Make sure the materialized view contains exactly the paths we selected
							let keys = Object.keys(materializedView.insert.NodeProperty);
							keys.sort();

							let expectedKeys = options.paths;
							if (options.ranges) {
								for (let i = 0; i < options.ranges.length; i++) {
									let range = options.ranges[i];
									let pathsInRange = _.filter(allPaths, (x) => {
										return x >= range[0] && x < range[1];
									});
									expectedKeys = (expectedKeys || []).concat(pathsInRange);
								}
							}
							if (expectedKeys === undefined) {
								expectedKeys = allPaths;
							}

							let expectedSubKeys = {};
							expectedKeys = expectedKeys.map((x) => {
								let tokenizedPath = PathHelper.tokenizePathString(x);
								if (tokenizedPath.length > 1) {
									expectedSubKeys[tokenizedPath[0]] = expectedSubKeys[tokenizedPath[0]] || [];
									expectedSubKeys[tokenizedPath[0]].push(tokenizedPath[1]);
								}
								return tokenizedPath[0];
							});
							expectedKeys.sort();
							expectedKeys = _.uniq(expectedKeys);

							expect(keys).to.deep.equal(expectedKeys);

							// And has all members for those paths
							for (let i = 0; i < keys.length; i++) {
								let CS = materializedView.insert.NodeProperty[keys[i]];
								if (expectedSubKeys[keys[i]]) {
									let expectedSubKeyList = expectedSubKeys[keys[i]];
									expectedSubKeyList.sort();
									let actualKeys = Object.keys(CS.insert.String);
									actualKeys.sort();
									expect(actualKeys).to.deep.equal(expectedSubKeyList);
								} else {
									expect(Object.keys(CS.insert.String)).to.have.length(100);
								}
							}
						});
					},
				],
				options.settings || settings,
			);
		};

		it("should work for the first path", function () {
			return getCommitMVTestFunction({ paths: ['"Node.0"'] });
		});
		it("should work for the last path", function () {
			return getCommitMVTestFunction({ paths: ['"Node.9"'] });
		});
		it("should work for a path in the middle", function () {
			return getCommitMVTestFunction({ paths: ['"Node.5"'] });
		});
		it("should work when passing a node boundary", function () {
			return getCommitMVTestFunction({
				paths: (tree) => {
					return [getPathFromChunkBoundaryFormat(tree.children[1].startPath)];
				},
			});
		});

		it("should work with multiple paths", function () {
			return getCommitMVTestFunction({
				paths: ['"Node.0"', '"Node.2"', '"Node.5"', '"Node.9"'],
			});
		});

		it("should support reference following", function () {
			return runMhsTest(
				[
					(root) => {
						root.insert("Prop1", PropertyFactory.create("NodeProperty"));
						root.insert("Prop2", PropertyFactory.create("NodeProperty"));
						root.insert("Prop3", PropertyFactory.create("NodeProperty"));
						root
							.get("Prop2")
							.insert("data", PropertyFactory.create("String", undefined, "abcde"));
						root
							.get("Prop2")
							.insert("selfRef", PropertyFactory.create("Reference", undefined, "/Prop2"));
						root
							.get("Prop2")
							.insert("selfSubRef", PropertyFactory.create("Reference", undefined, "data"));
						root
							.get("Prop3")
							.insert("Ref", PropertyFactory.create("Reference", undefined, "../Prop2"));
						root.insert("Ref", PropertyFactory.create("Reference", undefined, "/Prop3"));
					},
					(root, { service, commitInformation }) => {
						return service
							.getCommitMV({
								guid: commitInformation[commitInformation.length - 1].guid,
								paths: ["Ref"],
								followReferences: true,
								branchGuid: commitInformation[commitInformation.length - 1].branchGuid,
							})
							.then((materializedView) => {
								let Properties = materializedView.changeSet.insert;

								expect(Properties.Reference.Ref).to.exist;
								expect(Properties.NodeProperty.Prop1).to.not.exist;
								expect(Properties.NodeProperty.Prop2).to.exist;
								expect(Properties.NodeProperty.Prop3).to.exist;
							});
					},
				],
				settings,
			);
		});

		it("should work with paging", function () {
			return getCommitMVTestFunction({
				settings: {
					"mh:bTreeOrder": 3,
					"mh:chunkSize": 1024,
				},
				pagingLimit: 4 * 1024,
			});
		});

		it("should work with a single range", function () {
			return getCommitMVTestFunction({
				ranges: [['"Node.0"', '"Node.4"']],
			});
		});
	});

	describe("random Tests", () => {
		let deepTreeSettings = {
			"mh:bTreeOrder": 3,
			"mh:chunkSize": 4096,
		};
		after(() => {
			console.log("Total time: " + Math.ceil(summedTime / 10) / 100 + "s");
		});

		for (let i = 0; i < numRandomTests; i++) {
			(() => {
				let j = i;
				it("Test " + j, () => {
					let random = new DeterministicRandomGenerator(randomGuids[j]);

					let randomPermutationFunction = (root) => {
						// Get all keys
						let sortedKeys = root.getIds();
						sortedKeys.sort();

						// First we remove a random number of ranges from root
						let rangesToRemove = random.irandom() % 3;
						for (let k = 0; k < rangesToRemove; k++) {
							if (sortedKeys.length > 0) {
								let startIndex = random.irandom() % sortedKeys.length;
								let remainingKeys = sortedKeys.length - startIndex - 1;
								let endIndex = startIndex + 1 + (random.irandom() % remainingKeys);
								for (let l = startIndex; l < endIndex; l++) {
									root.remove(sortedKeys[l]);
								}

								sortedKeys = root.getIds();
								sortedKeys.sort();
							}
						}

						// Now we insert some ranges
						let rangesToInsert = random.irandom() % 3;
						for (let k = 0; k < rangesToInsert; k++) {
							let rangeStart, rangeEnd;
							if (sortedKeys.length < 3) {
								rangeStart = 0;
								rangeEnd = 1;
							} else {
								let startIndex = random.irandom() % (sortedKeys.length - 1);

								rangeStart = Number(sortedKeys[startIndex]) / 1e16;
								rangeEnd = Number(sortedKeys[startIndex + 1]) / 1e16;
								if (rangeEnd - rangeStart < 1e-13) {
									rangeEnd = rangeStart + 1e-13;
								}
							}

							let propertiesToInsert = random.irandom() % 500;
							insertSuccessiveProperties(root, propertiesToInsert, rangeStart, rangeEnd, true);

							sortedKeys = root.getIds();
							sortedKeys.sort();
						}
					};

					return runMhsTest(
						_.range(10).map(() => randomPermutationFunction),
						deepTreeSettings,
					);
				});
			})();
		}
	});

	describe.skip("Squashed commit range queries should", () => {
		let settings = {
			// 'mh:maxNodeSizeFactor': 0, // Enforce the creation of a new node for each commit
			"mh:maxNodeSubEntries": 4,
			"mhTest:numRandomizedSquashedChangesetTests": 10,
		};
		it("work for linear commit ranges with one node", () => {
			// Generate a linear commit range with only one node
			return runMhsTest(
				[
					(root) => {
						root.insert("array", PropertyFactory.create("Float64", "array"));
						root.insert("text", PropertyFactory.create("String"));
					},
					// Add 400 commits
					..._.range(0, 400).map((i) => {
						return (root) => {
							root.get("array").push(i);
							root.get("text").setValue(i);
						};
					}),
					(root, { leafs }) => {
						expect(leafs.length).to.equal(1);
					},
				],
				settings,
			);
		});
	});
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

import {
	AsyncGenerator,
	chainAsync as chain,
	describeFuzz,
	makeRandom,
	performFuzzActionsAsync as performFuzzActionsBase,
	takeAsync as take,
	type SaveInfo,
} from '@fluid-private/stochastic-test-utils';
import { DisconnectReason } from '@fluidframework/container-definitions/internal';
import { expect } from 'chai';

import { fail } from '../../Common.js';
import { areRevisionViewsSemanticallyEqual } from '../../EditUtilities.js';
import { SharedTree } from '../../SharedTree.js';
import { WriteFormat } from '../../persisted-types/index.js';
import {
	setUpLocalServerTestSharedTree,
	testDocumentsPathBase,
	withContainerOffline,
} from '../utilities/TestUtilities.js';

import { makeOpGenerator } from './Generators.js';
import { EditGenerationConfig, FuzzChange, FuzzTestState, Operation } from './Types.js';

const directory = join(testDocumentsPathBase, 'fuzz-tests');

// TODO: Kludge: Use this to change the seed such that the tests avoid hitting bugs in the Fluid Framework.
// Should be removed once fuzz tests pass reliably with any seed.
const adjustSeed = 0;

/**
 * Performs random actions on a set of clients.
 * @param generator - finite generator for a sequence of Operations to test. The test will run until this generator is
 * exhausted.
 * @param seed - the seed for the random generation of the fuzz actions
 * @param synchronizeAtEnd - if provided, all client will have all operations delivered from the server at the end of
 * the test
 * @param saveInfo - optionally provide an operation number at which a history of all operations will be saved to disk
 * at a given filepath. This can be useful for debugging why a fuzz test may have failed.
 */
export async function performFuzzActions(
	generator: AsyncGenerator<Operation, FuzzTestState>,
	seed: number,
	synchronizeAtEnd: boolean = true,
	saveInfo?: SaveInfo
): Promise<Required<FuzzTestState>> {
	const random = makeRandom(seed);

	// Note: the direct fields of `state` aren't mutated, but it is mutated transitively.
	const initialState: FuzzTestState = {
		random,
		passiveCollaborators: [],
		activeCollaborators: [],
	};
	const finalState = await performFuzzActionsBase(
		generator,
		{
			edit: async (state, operation) => {
				const { index, contents } = operation;
				const { tree } = state.activeCollaborators[index];
				applyFuzzChange(tree, contents);
				return state;
			},
			join: async (state, operation) => {
				const { isObserver, summarizeHistory, writeFormat } = operation;
				const { container, tree, testObjectProvider } = await setUpLocalServerTestSharedTree({
					writeFormat,
					summarizeHistory,
					testObjectProvider: state.testObjectProvider,
				});
				(isObserver ? state.passiveCollaborators : state.activeCollaborators).push({
					container,
					tree,
				});
				return { ...state, testObjectProvider };
			},
			leave: async (state, operation) => {
				const { index, isObserver } = operation;
				const treeList = isObserver ? state.passiveCollaborators : state.activeCollaborators;
				treeList[index].container.close(DisconnectReason.Expected);
				treeList.splice(index, 1);
				return state;
			},
			stash: async (state, operation) => {
				const { index, contents, writeFormat, summarizeHistory } = operation;
				const testObjectProvider =
					state.testObjectProvider ?? fail('Attempted to synchronize with undefined testObjectProvider');

				const { container, tree } = state.activeCollaborators[index];
				await testObjectProvider.ensureSynchronized();
				const { pendingLocalState } = await withContainerOffline(testObjectProvider, container, () => {
					applyFuzzChange(tree, contents);
				});

				const {
					container: newContainer,
					tree: newTree,
					testObjectProvider: newTestObjectProvider,
				} = await setUpLocalServerTestSharedTree({
					writeFormat,
					summarizeHistory,
					testObjectProvider,
					pendingLocalState,
				});

				state.activeCollaborators.splice(index, 1, { container: newContainer, tree: newTree });
				await newTestObjectProvider.ensureSynchronized();
				await newTestObjectProvider.ensureSynchronized(); // Synchronize twice in case stashed ops caused an upgrade round-trip
				return { ...state, testObjectProvider: newTestObjectProvider };
			},
			synchronize: async (state) => {
				const { testObjectProvider } = state;
				if (testObjectProvider === undefined) {
					fail('Attempted to synchronize with undefined testObjectProvider');
				}
				await testObjectProvider.ensureSynchronized();
				const trees = [...state.activeCollaborators, ...state.passiveCollaborators];
				if (trees.length > 1) {
					const first = trees[0].tree;
					for (let i = 1; i < trees.length; i++) {
						const tree = trees[i].tree;
						const editLogA = first.edits;
						const editLogB = tree.edits;
						const minEdits = Math.min(editLogA.length, editLogB.length);
						for (let j = 0; j < minEdits - 1; j++) {
							const editA = editLogA.tryGetEditAtIndex(editLogA.length - j - 1);
							const editB = editLogB.tryGetEditAtIndex(editLogB.length - j - 1);
							expect(editA).to.not.be.undefined;
							expect(editA?.id).to.equal(editB?.id);
						}
						expect(areRevisionViewsSemanticallyEqual(tree.currentView, tree, first.currentView, first)).to.be.true;

						for (const node of tree.currentView) {
							expect(tree.attributeNodeId(node.identifier)).to.equal(
								first.attributeNodeId(first.convertToNodeId(tree.convertToStableNodeId(node.identifier)))
							);
						}
					}
				}
				return state;
			},
		},
		initialState,
		saveInfo
	);

	if (synchronizeAtEnd) {
		if (finalState.testObjectProvider !== undefined) {
			await finalState.testObjectProvider.ensureSynchronized();
			const events = finalState.testObjectProvider.tracker.reportAndClearTrackedEvents();
			expect(events.expectedNotFound.length).to.equal(0);
			for (const event of events.unexpectedErrors) {
				switch (event.eventName) {
					// Tolerate failed edit chunk uploads, because they are fire-and-forget and can fail (e.g. the uploading client leaves before upload completes).
					case 'fluid:telemetry:FluidDataStoreRuntime:SharedTree:EditChunkUploadFailure':
					// TODO:#1120
					case 'fluid:telemetry:OrderedClientElection:InitialElectedClientNotFound':
					// Summary nacks can happen as part of normal operation and are handled by the framework
					case 'fluid:telemetry:Summarizer:Running:SummaryNack':
					case 'fluid:telemetry:Summarizer:summarizingError':
					case 'fluid:telemetry:Summarizer:Running:Summarize_cancel':
						break;
					default:
						expect.fail(`Unexpected error event: ${event.eventName}`);
				}
			}
		}
		const trees = [
			...finalState.activeCollaborators.map(({ tree }) => tree),
			...finalState.passiveCollaborators.map(({ tree }) => tree),
		];
		for (let i = 0; i < trees.length - 1; i++) {
			expect(trees[i].equals(trees[i + 1]));
		}
	}

	return finalState as Required<FuzzTestState>;
}

export function runSharedTreeFuzzTests(title: string): void {
	// Some useful tips for debugging fuzz tests:
	// - A JSON dump of the operation sequence can be written to disk by passing `true` for `saveOnFailure`.
	// - Different shared-tree instances can be distinguished (e.g. in logs) by using `tree.getRuntime().clientId`
	describeFuzz(title, ({ testCount }) => {
		function runTest(
			generatorFactory: () => AsyncGenerator<Operation, FuzzTestState>,
			seed: number,
			saveOnFailure?: boolean
		): void {
			it(`with seed ${seed}`, async () => {
				const saveInfo: SaveInfo | undefined =
					saveOnFailure === true
						? {
								saveOnFailure: { path: join(directory, `test-history-${seed}.json`) },
								saveOnSuccess: false,
							}
						: undefined;
				if (saveInfo !== undefined && !existsSync(directory)) {
					mkdirSync(directory);
				}
				await performFuzzActions(generatorFactory(), seed + adjustSeed, true, saveInfo);
			}).timeout(10000);
		}

		function runMixedVersionTests(summarizeHistory: boolean, testsPerSuite: number, testLength: number): void {
			describe('using 0.0.2 and 0.1.1 trees', () => {
				for (let seed = 0; seed < testsPerSuite; seed++) {
					runTest(
						() => take(testLength, makeOpGenerator({ joinConfig: { summarizeHistory: [summarizeHistory] } })),
						seed
					);
				}
			});

			describe('using only version 0.0.2', () => {
				for (let seed = 0; seed < testsPerSuite; seed++) {
					runTest(
						() =>
							take(
								testLength,
								makeOpGenerator({
									joinConfig: {
										writeFormat: [WriteFormat.v0_0_2],
										summarizeHistory: [summarizeHistory],
									},
								})
							),
						seed
					);
				}
			});

			describe('using only version 0.1.1', () => {
				for (let seed = 0; seed < testsPerSuite; seed++) {
					runTest(
						() =>
							take(
								testLength,
								makeOpGenerator({
									joinConfig: {
										writeFormat: [WriteFormat.v0_1_1],
										summarizeHistory: [summarizeHistory],
									},
								})
							),
						seed
					);
				}
			});

			describe('upgrading halfway through', () => {
				const maximumActiveCollaborators = 10;
				const maximumPassiveCollaborators = 5;
				const editConfig: EditGenerationConfig = { maxTreeSize: 1000 };
				const generatorFactory = () =>
					chain(
						take(
							testLength / 2 - 1,
							makeOpGenerator({
								editConfig,
								joinConfig: {
									maximumActiveCollaborators,
									maximumPassiveCollaborators,
									writeFormat: [WriteFormat.v0_0_2],
									summarizeHistory: [summarizeHistory],
								},
							})
						),
						take(
							1,
							makeOpGenerator({
								joinConfig: {
									maximumActiveCollaborators: maximumActiveCollaborators + 1,
									maximumPassiveCollaborators,
									writeFormat: [WriteFormat.v0_1_1],
									summarizeHistory: [summarizeHistory],
								},
								editWeight: 0,
								joinWeight: 1,
								leaveWeight: 0,
								synchronizeWeight: 0,
							})
						),
						take(
							testLength / 2,
							makeOpGenerator({
								editConfig,
								joinConfig: {
									maximumActiveCollaborators,
									maximumPassiveCollaborators,
									summarizeHistory: [summarizeHistory],
								},
							})
						)
					);
				for (let seed = 0; seed < testsPerSuite; seed++) {
					runTest(generatorFactory, seed);
				}
			});
		}

		const testLength = 200;
		describe('with no-history summarization', () => {
			runMixedVersionTests(false, testCount, testLength);
		});

		describe('with history summarization', () => {
			runMixedVersionTests(true, testCount, testLength);
		});
	});
}

function applyFuzzChange(tree: SharedTree, contents: FuzzChange): void {
	switch (contents.fuzzType) {
		case 'insert':
			tree.applyEdit(contents.build, contents.insert);
			break;

		case 'delete':
			tree.applyEdit(contents);
			break;

		case 'move':
			tree.applyEdit(contents.detach, contents.insert);
			break;

		case 'setPayload':
			tree.applyEdit(contents);
			break;
		default:
			fail('Invalid edit.');
	}
}

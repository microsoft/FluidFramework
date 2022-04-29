/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { promises as fs, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { expect } from 'chai';
import { makeRandom, setUpLocalServerTestSharedTree, testDocumentsPathBase } from '../utilities/TestUtilities';
import { WriteFormat } from '../../persisted-types';
import { fail } from '../../Common';
import { areRevisionViewsSemanticallyEqual } from '../../EditUtilities';
import { FuzzTestState, done, EditGenerationConfig, AsyncGenerator, Operation } from './Types';
import { chain, makeOpGenerator, take } from './Generators';

const directory = join(testDocumentsPathBase, 'fuzz-tests');

// TODO: Kludge: Use this to change the seed such that the tests avoid hitting bugs in the Fluid Framework.
// Should be removed once fuzz tests pass reliably with any seed.
const adjustSeed = 0;

/**
 * Performs random actions on a set of clients.
 * @param generator finite generator for a sequence of Operations to test. The test will run until this generator is exhausted.
 * @param seed the seed for the random generation of the fuzz actions
 * @param synchronizeAtEnd if provided, all client will have all operations delivered from the server at the end of the test
 * @param saveInfo optionally provide an operation number at which a history of all operations will be saved to disk at a given filepath.
 * This can be useful for debugging why a fuzz test may have failed.
 */
export async function performFuzzActions(
	generator: AsyncGenerator<Operation, FuzzTestState>,
	seed: number,
	synchronizeAtEnd: boolean = true,
	saveInfo?: { saveAt?: number; saveOnFailure: boolean; filepath: string }
): Promise<Required<FuzzTestState>> {
	const rand = makeRandom(seed);

	// Note: the direct fields of `state` aren't mutated, but it is mutated transitively.
	const state: FuzzTestState = { rand, passiveCollaborators: [], activeCollaborators: [] };
	const { activeCollaborators, passiveCollaborators } = state;
	const operations: Operation[] = [];
	for (let operation = await generator(state); operation !== done; operation = await generator(state)) {
		operations.push(operation);
		if (saveInfo !== undefined && operations.length === saveInfo.saveAt) {
			await fs.writeFile(saveInfo.filepath, JSON.stringify(operations));
		}

		try {
			switch (operation.type) {
				case 'edit': {
					const { index, contents } = operation;
					const { tree } = activeCollaborators[index];
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
							break;
					}
					break;
				}
				case 'join': {
					const { isObserver, summarizeHistory, writeFormat } = operation;
					const { container, tree, testObjectProvider } = await setUpLocalServerTestSharedTree({
						writeFormat,
						summarizeHistory,
						testObjectProvider: state.testObjectProvider,
					});
					if (state.testObjectProvider === undefined) {
						state.testObjectProvider = testObjectProvider;
					}
					(isObserver ? passiveCollaborators : activeCollaborators).push({ container, tree });
					break;
				}
				case 'leave': {
					const { index, isObserver } = operation;
					const treeList = isObserver ? passiveCollaborators : activeCollaborators;
					treeList[index].container.close();
					treeList.splice(index, 1);
					break;
				}
				case 'synchronize': {
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
								const editA = await editLogA.getEditAtIndex(editLogA.length - j - 1);
								const editB = await editLogB.getEditAtIndex(editLogB.length - j - 1);
								expect(editA.id).to.equal(editB.id);
							}
							expect(areRevisionViewsSemanticallyEqual(tree.currentView, tree, first.currentView, first))
								.to.be.true;
						}
					}
					break;
				}
				default:
					throw new Error('Unknown operation.');
			}
		} catch (err) {
			console.log(`Error encountered on operation number ${operations.length}`);
			if (saveInfo !== undefined && saveInfo.saveOnFailure) {
				await fs.writeFile(saveInfo.filepath, JSON.stringify(operations));
			}
			throw err;
		}
	}

	if (synchronizeAtEnd) {
		await state.testObjectProvider?.ensureSynchronized();
		const trees = [...activeCollaborators.map(({ tree }) => tree), ...passiveCollaborators.map(({ tree }) => tree)];
		for (let i = 0; i < trees.length - 1; i++) {
			expect(trees[i].equals(trees[i + 1]));
		}
	}

	return state as Required<FuzzTestState>;
}

export function runSharedTreeFuzzTests(title: string): void {
	// Some useful tips for debugging fuzz tests:
	// - A JSON dump of the operation sequence can be written to disk by passing `true` for `saveOnFailure`.
	// - Different shared-tree instances can be distinguished (e.g. in logs) by using `tree.getRuntime().clientId`
	describe(title, () => {
		function runTest(
			generatorFactory: () => AsyncGenerator<Operation, FuzzTestState>,
			seed: number,
			saveOnFailure?: boolean
		): void {
			it(`with seed ${seed}`, async () => {
				const saveInfo =
					saveOnFailure !== undefined
						? { filepath: join(directory, `test-history-${seed}.json`), saveOnFailure }
						: undefined;
				if (saveInfo !== undefined && !existsSync(directory)) {
					mkdirSync(directory);
				}
				await performFuzzActions(generatorFactory(), seed + adjustSeed, true, saveInfo);
			}).timeout(10000);
		}

		function runMixedVersionTests(summarizeHistory: boolean, testsPerSuite: number): void {
			describe('using 0.0.2 and 0.1.1 trees', () => {
				for (let seed = 0; seed < testsPerSuite; seed++) {
					runTest(
						() => take(1000, makeOpGenerator({ joinConfig: { summarizeHistory: [summarizeHistory] } })),
						seed
					);
				}
			});

			describe('using only version 0.0.2', () => {
				for (let seed = 0; seed < testsPerSuite; seed++) {
					runTest(
						() =>
							take(
								1000,
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
								1000,
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
				const testLength = 500;
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

		const testCount = 1;
		describe('with no-history summarization', () => {
			runMixedVersionTests(false, testCount);
		});

		describe('with history summarization', () => {
			runMixedVersionTests(true, testCount);
		});
	});
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { promises as fs, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import Prando from 'prando';
import { expect } from 'chai';
import { setUpLocalServerTestSharedTree, testDocumentsPathBase } from '../utilities/TestUtilities';
import { WriteFormat } from '../../persisted-types';
import { fail } from '../../Common';
import { FuzzTestState, done, EditGenerationConfig, AsyncGenerator, Operation } from './Types';
import { chain, makeOpGenerator, take, generatorFromArray } from './Generators';

const directory = join(testDocumentsPathBase, 'fuzz-tests');

/**
 * Performs random actions on a set of clients.
 * @param generator finite generator for a sequence of Operations to test. The test will run until this generator is exhausted.
 * @param seed the seed for the random generation of the fuzz actions
 * @param synchronizeAtEnd if provided, all client will have all operations delivered from the server at the end of the test
 * @param saveInfo optionally provide an operation number at which a history of all operations will be saved to disk at a given filepath.
 * This can be useful for debugging why a fuzz test may have failed.
 */
export async function performFuzzActions(
	generator: AsyncGenerator<Operation, undefined>,
	seed: number,
	synchronizeAtEnd: boolean = true,
	saveInfo?: { saveAt?: number; saveOnFailure: boolean; filepath: string }
): Promise<Required<FuzzTestState>> {
	const rand = new Prando(seed);

	// Note: the direct fields of `state` aren't mutated, but it is mutated transitively.
	const state: FuzzTestState = { rand, passiveCollaborators: [], activeCollaborators: [] };
	const { activeCollaborators, passiveCollaborators } = state;
	const operations: Operation[] = [];
	for (
		let operation = await generator(state, undefined);
		operation !== done;
		operation = await generator(state, undefined)
	) {
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
					// May want to validate state here
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
			generatorFactory: () => AsyncGenerator<Operation, undefined>,
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
				await performFuzzActions(generatorFactory(), seed, true, saveInfo);
			});
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

		/**
		 * TODO: This test demonstrates issues with clients using writeFormat v0.1.1 and mixed `summarizeHistory` values.
		 * The problem is illustrated by the following scenario:
		 * 1. Client A and client B join a session. A does not summarize history, but B does.
		 * 2. A is elected to be the summarizer.
		 * 3. Client A and B make 50 edits (half a chunks' worth), then idle.
		 * 4. Client A summarizes. Since it does not summarize history, the summary it produces has a single edit.
		 * 5. Client C joins, configured to write history.
		 * 6. The three clients collaborate further for another 50/51 edits.
		 *
		 * At this point in time, client B thinks the first edit chunk is full, but client C thinks it's only half-full.
		 * The entire edit compression scheme is built upon assuming clients agree where the chunk boundaries are, so this
		 * generally leads to correctness issues. The fuzz test below repros a similar scenario, and what ultimately causes
		 * failure is a newly-loaded client being shocked at a chunk with `startRevision: 400` uploaded (when it thinks
		 * there has only been one edit).
		 *
		 * To fix this, we need to incorporate a scheme where all clients agree on chunk boundaries (e.g., by including the
		 * total number of edits even in no-history summaries).
		 *
		 * In the meantime, we are forbidding collaboration of no-history clients and history clients.
		 */
		describe.skip('Regression test for mixed writeSummary values', () => {
			// This file is saved as an explicit history to make sure changes to fuzz test infrastructure don't affect which
			// test reproduces the issue.
			const operations: Operation[] = JSON.parse(
				readFileSync(join(directory, 'mixed-summarizeHistory.json')).toString()
			);

			runTest(() => generatorFromArray(operations), 0);
		});
	});
}

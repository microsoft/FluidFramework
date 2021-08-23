/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from 'fs';
import { expect } from 'chai';
// KLUDGE:#62681: Remove eslint ignore due to unresolved import false positive
import { TestObjectProvider } from '@fluidframework/test-utils'; // eslint-disable-line import/no-unresolved
import {
	Change,
	noHistorySummarizer,
	noHistorySummarizer_0_1_1,
	SharedTree,
	SharedTreeNoHistorySummarizer,
} from '../../default-edits';
import { EditId } from '../../Identifiers';
import {
	Edit,
	SharedTreeSummary,
	SharedTreeSummaryBase,
	SharedTreeSummaryWriteFormat,
	EditWithoutId,
	UploadedEditChunkContents,
	SharedTreeSummaryReadFormat,
} from '../../generic';
import { deserialize, getSummaryStatistics, SummaryStatistics } from '../../SummaryBackCompatibility';
import { SharedTreeWithAnchors } from '../../anchored-edits';
import { EditLog, separateEditAndId } from '../../EditLog';
import { assertNotUndefined } from '../../Common';
import {
	getDocumentFiles,
	LocalServerSharedTreeTestingComponents,
	LocalServerSharedTreeTestingOptions,
	SharedTreeTestingComponents,
	SharedTreeTestingOptions,
	testDocumentsPathBase,
} from './TestUtilities';
import { TestFluidSerializer } from './TestSerializer';

/**
 * A version/summarizer pair must be specified for a no history write test to be generated.
 * Versions that can no longer be written should be removed from this list.
 */
const noHistorySupportedSummarizers: {
	version: SharedTreeSummaryWriteFormat;
	summarizer: SharedTreeNoHistorySummarizer;
}[] = [
	{ version: SharedTreeSummaryWriteFormat.Format_0_0_2, summarizer: noHistorySummarizer },
	{ version: SharedTreeSummaryWriteFormat.Format_0_1_1, summarizer: noHistorySummarizer_0_1_1 },
];

const supportedSummaryWriteFormats: SharedTreeSummaryWriteFormat[] = [
	SharedTreeSummaryWriteFormat.Format_0_0_2,
	SharedTreeSummaryWriteFormat.Format_0_1_1,
];

/**
 * An entry into the forwardCompatibilityTests list that is run as the following test:
 *
 * For each load version,
 *   - load a tree with the specified version summary
 *   - write a new summary with the specified summarizer version
 *   - check the condition
 *       - if true, expect that the new summary is equal to the specified conditional write version's summary
 *       - if false, expect that the new summary is equal to the summarizer version's summary
 */
interface ForwardCompatibilityTestEntry {
	/** Version of the summarizer, should be older than the load versions. */
	summarizerVersion: SharedTreeSummaryWriteFormat;
	/** A list of all the versions that can be read with directions on how they are expected to be handled by the specified summarizer. */
	loadVersions: {
		/** Version of the summary to load for testing. */
		loadVersion: SharedTreeSummaryReadFormat;
		/** Condition under which the summarizer will write a different format version than the summarizerVersion. */
		condition: (summary: SharedTreeSummaryBase) => boolean;
		/** The format version that will be written if the condition is true. */
		conditionalWriteVersion: SharedTreeSummaryWriteFormat;
	}[];
}

/**
 * Directions for forward compatibility tests. There should be an entry for each supported summarizer that is not the latest.
 */
const forwardCompatibilityTests: ForwardCompatibilityTestEntry[] = [
	{
		summarizerVersion: SharedTreeSummaryWriteFormat.Format_0_0_2,
		loadVersions: [
			{
				loadVersion: SharedTreeSummaryReadFormat.Format_0_1_1,
				// In the special case in which a SharedTree loads a summary with handles (which would necessarily
				// imply that the summary was version >= 0.1.0), then a 0.1.0 summary is written even if the summarizer is 0.0.2.
				condition: (summary: SharedTreeSummaryBase): boolean => {
					const castedSummary = summary as SharedTreeSummary<Change>;
					if (castedSummary.editHistory === undefined || castedSummary.editHistory.editChunks === undefined) {
						return false;
					}
					// An editChunk is a handle iff its "chunk" field is not an array
					return castedSummary.editHistory.editChunks.some(({ chunk }) => !Array.isArray(chunk));
				},
				conditionalWriteVersion: SharedTreeSummaryWriteFormat.Format_0_1_1,
			},
		],
	},
];

/**
 * Runs a test suite for summaries on `SharedTree`.
 * This suite can be used to test other implementations that aim to fulfill `SharedTree`'s contract.
 */
export function runSummaryFormatCompatibilityTests<TSharedTree extends SharedTree | SharedTreeWithAnchors>(
	title: string,
	setUpTestSharedTree: (options?: SharedTreeTestingOptions) => SharedTreeTestingComponents<TSharedTree>,
	setUpLocalServerTestSharedTree: (
		options: LocalServerSharedTreeTestingOptions
	) => Promise<LocalServerSharedTreeTestingComponents<TSharedTree>>
) {
	describe(title, () => {
		const setupEditId = '9406d301-7449-48a5-b2ea-9be637b0c6e4' as EditId;

		const testSerializer = new TestFluidSerializer();

		let expectedTree: TSharedTree;
		let testObjectProvider: TestObjectProvider;
		let editsPerChunk: number;

		// Resets the tree before each test
		beforeEach(async () => {
			const testingComponents = await setUpLocalServerTestSharedTree({
				setupEditId,
			});
			expectedTree = testingComponents.tree;
			editsPerChunk = (expectedTree.edits as EditLog<Change>).editsPerChunk;
			testObjectProvider = testingComponents.testObjectProvider;
		});

		afterEach(async () => {
			testObjectProvider.reset();
		});

		const documentFolders = fs.readdirSync(testDocumentsPathBase);

		for (const document of documentFolders) {
			const {
				summaryByVersion,
				noHistorySummaryByVersion,
				denormalizedSummaryByVersion,
				denormalizedHistoryByType,
				blobsByVersion,
				history,
				changeNode,
				sortedVersions,
			} = getDocumentFiles(document);

			describe(`document ${document}`, () => {
				for (const version of supportedSummaryWriteFormats) {
					it(`version ${version} can be written`, async () => {
						// Use a tree with the correct summary write format
						const { tree, testObjectProvider } = await setUpLocalServerTestSharedTree({
							setupEditId,
							writeSummaryFormat: version,
						});

						history.forEach((edit) => {
							tree.processLocalEdit(edit);
						});

						// Wait for the ops to to be submitted and processed across the containers.
						await testObjectProvider.ensureSynchronized();

						// Save a new summary with the expected tree and use it to load a new SharedTree
						const newSummary = tree.saveSummary();
						const { tree: tree2 } = setUpTestSharedTree();
						tree2.loadSummary(newSummary);

						// The expected tree, tree loaded with the existing summary, and the tree loaded
						// with the new summary should all be equal.
						expect(tree2.equals(tree)).to.be.true;
					});
				}

				for (const { summarizer, version } of noHistorySupportedSummarizers) {
					it(`version ${version} with no history can be written`, async () => {
						history.forEach((edit) => {
							expectedTree.processLocalEdit(edit);
						});

						// Wait for the ops to to be submitted and processed across the containers.
						await testObjectProvider.ensureSynchronized();

						// Save a new summary with the expected tree and use it to load a new SharedTree
						const newSummary = summarizer(expectedTree.edits, expectedTree.currentView, true);
						const { tree: tree2 } = setUpTestSharedTree();
						tree2.loadSummary(newSummary);

						// Check that the new summary is equivalent to the saved one
						const serializedSummary = assertNotUndefined(noHistorySummaryByVersion.get(version));
						const summary = deserialize(serializedSummary, testSerializer);

						expect(JSON.parse(JSON.stringify(newSummary))).to.deep.equals(summary);

						// Ensure the produced change node is the same
						const newChangeNode = expectedTree.currentView.getChangeNodeTree();
						expect(newChangeNode).to.deep.equal(changeNode);
					});
				}

				it('change-node.json matches history.json', async () => {
					history.forEach((edit) => {
						expectedTree.processLocalEdit(edit);
					});

					// Wait for the ops to to be submitted and processed across the containers.
					await testObjectProvider.ensureSynchronized();
					expect(changeNode).deep.equals(expectedTree.currentView.getChangeNodeTree());
				});

				for (const [_index, version] of sortedVersions.entries()) {
					it(`version ${version} can be read`, async () => {
						history.forEach((edit) => {
							expectedTree.processLocalEdit(edit);
						});

						// Wait for the ops to to be submitted and processed across the containers.
						await testObjectProvider.ensureSynchronized();

						const serializedSummary = assertNotUndefined(summaryByVersion.get(version));
						const summary = deserialize(serializedSummary, testSerializer);

						const { tree } = setUpTestSharedTree();
						tree.loadSummary(summary);

						expect(tree.equals(expectedTree)).to.be.true;
					});

					it(`getTelemetryInfoFromSummary works for version ${version}`, () => {
						const serializedSummary = assertNotUndefined(summaryByVersion.get(version));
						const summary = deserialize(serializedSummary, testSerializer);
						const telemetryInfo = getSummaryStatistics(summary);
						const expectedTelemetryInfo: SummaryStatistics =
							version === '0.0.2'
								? {
										formatVersion: version,
										historySize: history.length,
								  }
								: {
										formatVersion: version,
										historySize: history.length,
										totalNumberOfChunks: history.length > 0 ? 1 : 0,
										uploadedChunks: history.length >= editsPerChunk ? 1 : 0,
								  };
						expect(telemetryInfo).to.deep.equals(expectedTelemetryInfo);
					});
				}

				// For each denormalized history type, load the edits into SharedTree and test that it produces a normalized change node tree.
				denormalizedHistoryByType.forEach((file, type) => {
					it(`load denormalized history type ${type} produces the correct change node`, async () => {
						const denormalizedHistory: Edit<Change>[] = JSON.parse(file);
						denormalizedHistory.forEach((edit) => {
							expectedTree.processLocalEdit(edit);
						});

						// Wait for the ops to to be submitted and processed across the containers.
						await testObjectProvider.ensureSynchronized();

						expect(changeNode).deep.equals(expectedTree.currentView.getChangeNodeTree());
					});
				});

				const firstVersion = sortedVersions[0];
				sortedVersions.forEach((version, index) => {
					if (index !== 0) {
						it(`version ${firstVersion} and version ${version} summaries produce identical trees`, async () => {
							// Load the first summary into the expected tree.
							const firstSerializedSummary = assertNotUndefined(summaryByVersion.get(firstVersion));
							const firstSummary = deserialize(firstSerializedSummary, testSerializer);
							expectedTree.loadSummary(firstSummary);

							// Wait for the ops to to be submitted and processed across the containers.
							await testObjectProvider.ensureSynchronized();

							// Create a tree that loads the current summary version.
							const { tree, containerRuntimeFactory } = setUpTestSharedTree();
							const serializedSummary = assertNotUndefined(summaryByVersion.get(version));
							const summary = deserialize(serializedSummary, testSerializer);
							tree.loadSummary(summary);

							containerRuntimeFactory.processAllMessages();

							expect(tree.equals(expectedTree)).to.be.true;
						});
					}

					// Test that the current format version can be loaded and produce the correct change node tree.
					it(`version ${version} produces the correct change node`, async () => {
						const serializedSummary = assertNotUndefined(summaryByVersion.get(version));
						const summary = deserialize(serializedSummary, testSerializer);
						expectedTree.loadSummary(summary);

						// Wait for the ops to to be submitted and processed across the containers.
						await testObjectProvider.ensureSynchronized();

						const newChangeNode = expectedTree.currentView.getChangeNodeTree();
						expect(newChangeNode).to.deep.equal(changeNode);
					});

					// Load each denormalized summary by version and verify that it produces a normalized change node tree.
					const denormalizedSummaryTypes = denormalizedSummaryByVersion.get(version);
					if (denormalizedSummaryTypes !== undefined) {
						denormalizedSummaryTypes.forEach((file, type) => {
							it(`version ${version} produces a normalized change node for denormalized summary type ${type}`, () => {
								const denormalizedSummary = deserialize(file, testSerializer);
								expectedTree.loadSummary(denormalizedSummary);

								const newChangeNode = expectedTree.currentView.getChangeNodeTree();
								expect(newChangeNode).to.deep.equal(changeNode);
							});
						});
					}
				});

				// Check that clients with certain loaded versions can write their supported write versions.
				for (const [index, readVersion] of sortedVersions.entries()) {
					// A client that has loaded an older version of a summary should be able to write newer versions
					for (const writeVersion of sortedVersions.slice(index)) {
						const supportedWriteVersion = supportedSummaryWriteFormats.find(
							(entry) => entry === writeVersion
						);
						if (supportedWriteVersion !== undefined) {
							it(`format version ${writeVersion} can be written by a client that loaded version ${readVersion}`, async () => {
								// Use a tree with the correct summary write format
								const { tree, testObjectProvider } = await setUpLocalServerTestSharedTree({
									setupEditId,
									writeSummaryFormat: supportedWriteVersion,
								});

								// Load the summary to be read
								const serializedSummary = assertNotUndefined(summaryByVersion.get(readVersion));
								const summary = deserialize(serializedSummary, testSerializer);

								// Wait for the ops to to be submitted and processed across the containers.
								await testObjectProvider.ensureSynchronized();
								tree.loadSummary(summary);

								await testObjectProvider.ensureSynchronized();

								// Write a new summary with the specified version
								const newSummary = JSON.parse(tree.saveSerializedSummary());

								const blobs = blobsByVersion.get(writeVersion);
								if (blobs !== undefined) {
									expectBlobsByVersion(newSummary, blobs, history);
								}

								// Check the newly written summary is equivalent to its corresponding test summary file.
								// This assumes the input file is normalized (that summarizing it produces an identical output).
								const expectedSummary = JSON.parse(
									assertNotUndefined(summaryByVersion.get(writeVersion))
								);

								expect(newSummary).to.deep.equal(expectedSummary);
								testObjectProvider.reset();
							});
						}
					}
				}

				// Forward compatibility tests
				for (const { summarizerVersion, loadVersions } of forwardCompatibilityTests) {
					for (const { loadVersion, condition, conditionalWriteVersion } of loadVersions) {
						it(`version ${loadVersion} can be loaded by a client with summarizer format ${summarizerVersion} and written in the correct summary version`, async () => {
							const supportedWriteVersion = supportedSummaryWriteFormats.find(
								(entry) => entry === summarizerVersion
							);
							if (supportedWriteVersion !== undefined) {
								// Use a tree with the correct summary write format
								const { tree, testObjectProvider } = await setUpLocalServerTestSharedTree({
									setupEditId,
									writeSummaryFormat: supportedWriteVersion,
								});

								const serializedSummary = assertNotUndefined(summaryByVersion.get(loadVersion));
								const summary = deserialize(serializedSummary, testSerializer);

								// Wait for the ops to to be submitted and processed across the containers.
								await testObjectProvider.ensureSynchronized();
								tree.loadSummary(summary);

								await testObjectProvider.ensureSynchronized();

								// Write a new summary with the summarizer of version `summarizerVersion`.
								const newSummary = JSON.parse(tree.saveSerializedSummary());

								// Check the new summary is equivalent to the conditional version summary if the condition is true.
								// Otherwise, check it's equivalent to the summarizer version summary.
								const conditionalSummary = deserialize(
									assertNotUndefined(summaryByVersion.get(conditionalWriteVersion)),
									testSerializer
								);
								let expectedSummary: SharedTreeSummaryBase;

								if (condition(conditionalSummary)) {
									expectedSummary = conditionalSummary;
								} else {
									expectedSummary = deserialize(
										assertNotUndefined(summaryByVersion.get(summarizerVersion)),
										testSerializer
									);
								}

								expect(newSummary).to.deep.equal(expectedSummary);
							}
						});
					}
				}
			});
		}
	});
}

/**
 * Checks that a given summary contains the correct blob contents.
 */
function expectBlobsByVersion(summary: SharedTreeSummaryBase, blobs: string, history: Edit<Change>[]): void {
	const { version } = summary;
	const storedBlobs: UploadedEditChunkContents<Change>[] = JSON.parse(blobs);

	switch (version) {
		case SharedTreeSummaryWriteFormat.Format_0_1_1: {
			let loadedEdits: EditWithoutId<Change>[] = [];

			// Obtain all edits from the summary, replacing handles with edits loaded from the stored blob file.
			assertNotUndefined((summary as SharedTreeSummary<Change>).editHistory).editChunks.forEach(({ chunk }) => {
				// A "chunk" in the edit history is a handle if it is not an array.
				if (!Array.isArray(chunk)) {
					const { absolutePath, chunkContents } = storedBlobs.splice(0)[0];

					// TestSerializer doesn't replace serialized handles with actual handles so the absolutePath is found under 'url'.
					expect(absolutePath).to.equal((chunk as any).url);
					loadedEdits = loadedEdits.concat(chunkContents);
				} else {
					loadedEdits = loadedEdits.concat(chunk);
				}
			});

			expect(loadedEdits.length).to.equal(history.length);

			// Check that each edit from the summary matches the edits from the history.
			loadedEdits.forEach((editWithoutId, index) => {
				const { editWithoutId: historyEditWithoutId } = separateEditAndId(history[index]);
				expect(editWithoutId).to.deep.equals(historyEditWithoutId);
			});
			break;
		}
		default:
			throw new Error('version does not support blobs');
	}
}

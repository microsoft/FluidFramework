/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from 'fs';
import { resolve, join } from 'path';
import { assert, expect } from 'chai';
import { TestObjectProvider } from '@fluidframework/test-utils';
import { assertNotUndefined } from '../../Common';
import { Change, SharedTree } from '../../default-edits';
import { EditId } from '../../Identifiers';
import { Edit, fullHistorySummarizer, fullHistorySummarizer_0_1_0, SharedTreeSummarizer } from '../../generic';
import { deserialize, getSummaryStatistics, SummaryStatistics } from '../../SummaryBackCompatibility';
import { SharedTreeWithAnchors } from '../../anchored-edits';
import {
	LocalServerSharedTreeTestingComponents,
	LocalServerSharedTreeTestingOptions,
	SharedTreeTestingComponents,
	SharedTreeTestingOptions,
} from './TestUtilities';
import { TestFluidSerializer } from './TestSerializer';

// This accounts for this file being executed after compilation. If many tests want to leverage resources, we should unify
// resource path logic to a single place.
const pathBase = resolve(__dirname, '../../../src/test/documents/');

function summaryFilePath(documentName: string, summaryVersion: string): string {
	return join(pathBase, documentName, `summary-${summaryVersion}.json`);
}

function historyFilePath(documentName: string): string {
	return join(pathBase, documentName, `history.json`);
}

/**
 * A version/summarizer pair must be specified for a write test to be generated.
 * Versions that can no longer be written should be removed from this list.
 */
const supportedSummarizers: { version: string; summarizer: SharedTreeSummarizer<unknown> }[] = [
	{ version: '0.0.2', summarizer: fullHistorySummarizer },
	{ version: '0.1.0', summarizer: fullHistorySummarizer_0_1_0 },
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

		// Create and populate a map of the versions associated with their summary type
		const summaryTypes = new Map<string, string[]>();
		const documentFolders = fs.readdirSync(pathBase);

		for (const documentFolder of documentFolders) {
			const documentFiles = fs.readdirSync(join(pathBase, documentFolder));
			for (const documentFile of documentFiles) {
				const fileNameRegularExpression = /summary-(?<version>\d+\.\d\.\d).json/;
				const match = fileNameRegularExpression.exec(documentFile);
				if (match && match.groups) {
					let collection = summaryTypes.get(documentFolder);
					if (collection === undefined) {
						collection = [];
						summaryTypes.set(documentFolder, collection);
					}
					collection.push(match.groups.version);
				}
			}
		}

		// Resets the tree before each test
		beforeEach(async () => {
			const testingComponents = await setUpLocalServerTestSharedTree({
				setupEditId,
			});
			expectedTree = testingComponents.tree;
			testObjectProvider = testingComponents.testObjectProvider;
		});

		afterEach(async () => {
			testObjectProvider.reset();
		});

		for (const [summaryType, versions] of summaryTypes.entries()) {
			// prefetch summaries
			const summaryFileContents = new Map<string, string>();
			for (const version of versions) {
				summaryFileContents[version] = fs.readFileSync(summaryFilePath(summaryType, version), 'utf8');
			}

			// prefetch history
			const history = JSON.parse(fs.readFileSync(historyFilePath(summaryType), 'utf8')) as Edit<Change>[];

			describe(`document ${summaryType}`, () => {
				it(`summaries with different format versions produce identical trees`, () => {
					// Load the first summary file
					const serializedSummary = summaryFileContents[versions[0]];
					const summary = deserialize(serializedSummary, testSerializer);
					expectedTree.loadSummary(summary);

					// Check every other summary file results in the same loaded tree
					for (let i = 1; i < versions.length; i++) {
						const { tree } = setUpTestSharedTree();

						const serializedSummary = summaryFileContents[versions[i]];
						const summary = deserialize(serializedSummary, testSerializer);
						tree.loadSummary(summary);

						expect(tree.equals(expectedTree)).to.be.true;
					}
				});

				// Check that clients with certain loaded versions can write their supported write versions.
				const sortedVersions = versions.sort(versionComparator);
				for (const [index, readVersion] of sortedVersions.entries()) {
					// A client that has loaded an older version of a summary should be able to write newer versions
					for (const writeVersion of sortedVersions.slice(index)) {
						const summarizerEntry = supportedSummarizers.find((entry) => entry.version === writeVersion);
						if (summarizerEntry !== undefined) {
							const summarizer = summarizerEntry.summarizer;
							it(`format version ${writeVersion} can be written by a client that loaded version ${readVersion}`, async () => {
								// Load the first summary file (the one with the oldest version)
								const serializedSummary = summaryFileContents[readVersion];
								const summary = deserialize(serializedSummary, testSerializer);

								// Wait for the ops to to be submitted and processed across the containers.
								await testObjectProvider.ensureSynchronized();
								expectedTree.loadSummary(summary);

								await testObjectProvider.ensureSynchronized();

								// Write a new summary with the specified version
								const newSummary = expectedTree.saveSerializedSummary(summarizer);

								// Check the newly written summary is equivalent to its corresponding test summary file.
								// This assumes the input file is normalized (that summarizing it produces an identical output).
								// TODO: Add support for testing de-normalized files, such as files with empty traits.
								// Re-stringify the the JSON file to remove escaped characters
								const expectedSummary = JSON.stringify(JSON.parse(summaryFileContents[writeVersion]));

								expect(newSummary).to.equal(expectedSummary);
							});
						}
					}
				}

				for (const [_index, version] of sortedVersions.entries()) {
					it(`version ${version} can be read`, async () => {
						history.forEach((edit) => {
							expectedTree.processLocalEdit(edit);
						});

						// Wait for the ops to to be submitted and processed across the containers.
						await testObjectProvider.ensureSynchronized();

						const serializedSummary = summaryFileContents[version];
						const summary = deserialize(serializedSummary, testSerializer);

						const { tree } = setUpTestSharedTree();
						tree.loadSummary(summary);

						expect(tree.equals(expectedTree)).to.be.true;
					});

					it(`version ${version} can be written`, async () => {
						history.forEach((edit) => {
							expectedTree.processLocalEdit(edit);
						});

						// Wait for the ops to to be submitted and processed across the containers.
						await testObjectProvider.ensureSynchronized();

						const summarizerEntry = supportedSummarizers.find((entry) => entry.version === version);
						const summarizer = assertNotUndefined(summarizerEntry).summarizer;

						// Save a new summary with the expected tree and use it to load a new SharedTree
						const newSummary = summarizer(expectedTree.edits, expectedTree.currentView);
						const { tree: tree2 } = setUpTestSharedTree();
						tree2.loadSummary(newSummary);

						// The expected tree, tree loaded with the existing summary, and the tree loaded
						// with the new summary should all be equal.
						expect(tree2.equals(expectedTree)).to.be.true;
					});

					it(`getTelemetryInfoFromSummary works for version ${version}`, () => {
						const serializedSummary = summaryFileContents[version];
						const summary = deserialize(serializedSummary, testSerializer);
						const telemetryInfo = getSummaryStatistics(summary);
						const expectedTelemetryInfo: SummaryStatistics = {
							formatVersion: version,
							historySize: history.length,
						};
						if (version !== '0.0.2') {
							expectedTelemetryInfo.totalNumberOfChunks = Math.floor((history.length + 249) / 250);
							expectedTelemetryInfo.uploadedChunks = Math.floor(history.length / 250);
						}
						expect(telemetryInfo).to.deep.equals(expectedTelemetryInfo);
					});
				}

				if (summaryType === 'large-history' || history.length > 250) {
					it('is written by a client with a 0.0.2 summarizer that has loaded version 0.1.0', async () => {
						const serializedSummary = summaryFileContents['0.1.0'];
						const summary = deserialize(serializedSummary, testSerializer);

						// Wait for the ops to to be submitted and processed across the containers.
						await testObjectProvider.ensureSynchronized();
						expectedTree.loadSummary(summary);

						await testObjectProvider.ensureSynchronized();

						// Write a new summary with the 0.0.2 summarizer
						const newSummary = expectedTree.saveSerializedSummary(fullHistorySummarizer);

						// Check the newly written summary is equivalent to the loaded summary
						// Re-stringify the the JSON file to remove escaped characters
						const expectedSummary = JSON.stringify(JSON.parse(serializedSummary));
						expect(newSummary).to.equal(expectedSummary);
					});
				}
			});
		}
	});
}

const versionComparator = (versionA: string, versionB: string): number => {
	const versionASplit = versionA.split('.');
	const versionBSplit = versionB.split('.');

	assert(
		versionASplit.length === versionBSplit.length && versionASplit.length === 3,
		'Version numbers should follow semantic versioning.'
	);

	for (let i = 0; i < 3; ++i) {
		const numberA = parseInt(versionASplit[i], 10);
		const numberB = parseInt(versionBSplit[i], 10);

		if (numberA > numberB) {
			return 1;
		}

		if (numberA < numberB) {
			return -1;
		}
	}

	return 0;
};

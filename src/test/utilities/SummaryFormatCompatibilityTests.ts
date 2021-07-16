/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from 'fs';
import { resolve, join } from 'path';
import { assert, expect } from 'chai';
import { TestObjectProvider } from '@fluidframework/test-utils';
import { Change, SharedTree } from '../../default-edits';
import { EditId } from '../../Identifiers';
import {
	Edit,
	fullHistorySummarizer,
	fullHistorySummarizer_0_1_0,
	SharedTreeSummarizer,
	SharedTreeSummary,
	SharedTreeSummaryBase,
} from '../../generic';
import { deserialize, getSummaryStatistics, SummaryStatistics } from '../../SummaryBackCompatibility';
import { SharedTreeWithAnchors } from '../../anchored-edits';
import { EditLog } from '../../EditLog';
import { assertNotUndefined } from '../../Common';
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

/**
 * A version/summarizer pair must be specified for a write test to be generated.
 * Versions that can no longer be written should be removed from this list.
 */
const supportedSummarizers: { version: string; summarizer: SharedTreeSummarizer<unknown> }[] = [
	{ version: '0.0.2', summarizer: fullHistorySummarizer },
	{ version: '0.1.0', summarizer: fullHistorySummarizer_0_1_0 },
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
	summarizerVersion: string;
	/** A list of all the versions that can be read with directions on how they are expected to be handled by the specified summarizer. */
	loadVersions: {
		/** Version of the summary to load for testing. */
		loadVersion: string;
		/** Condition under which the summarizer will write a different format version than the summarizerVersion. */
		condition: (summary: SharedTreeSummaryBase) => boolean;
		/** The format version that will be written if the condition is true. */
		conditionalWriteVersion: string;
	}[];
}

/**
 * Directions for forward compatibility tests. There should be an entry for each supported summarizer that is not the latest.
 */
const forwardCompatibilityTests: ForwardCompatibilityTestEntry[] = [
	{
		summarizerVersion: '0.0.2',
		loadVersions: [
			{
				loadVersion: '0.1.0',
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
				conditionalWriteVersion: '0.1.0',
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

		const documentFolders = fs.readdirSync(pathBase);

		for (const document of documentFolders) {
			// cache the contents of the relevant files here to avoid loading more than once
			// map containing summary file contents, keys are summary versions, values have file contents
			const summaryByVersion = new Map<string, string>();
			let historyOrUndefined: Edit<Change>[] | undefined;

			const documentFiles = fs.readdirSync(join(pathBase, document));
			for (const documentFile of documentFiles) {
				const summaryFileRegex = /summary-(?<version>\d+\.\d\.\d).json/;
				const match = summaryFileRegex.exec(documentFile);
				const filePath = join(pathBase, document, documentFile);
				if (match && match.groups) {
					summaryByVersion.set(match.groups.version, fs.readFileSync(filePath, 'utf8'));
				} else if (documentFile === 'history.json') {
					historyOrUndefined = JSON.parse(fs.readFileSync(filePath, 'utf8'));
				}
			}

			const history = assertNotUndefined(historyOrUndefined);
			const sortedVersions = Array.from(summaryByVersion.keys()).sort(versionComparator);

			describe(`document ${document}`, () => {
				for (const { summarizer, version } of supportedSummarizers) {
					it(`version ${version} can be written`, async () => {
						history.forEach((edit) => {
							expectedTree.processLocalEdit(edit);
						});

						// Wait for the ops to to be submitted and processed across the containers.
						await testObjectProvider.ensureSynchronized();

						// Save a new summary with the expected tree and use it to load a new SharedTree
						const newSummary = summarizer(expectedTree.edits, expectedTree.currentView);
						const { tree: tree2 } = setUpTestSharedTree();
						tree2.loadSummary(newSummary);

						// The expected tree, tree loaded with the existing summary, and the tree loaded
						// with the new summary should all be equal.
						expect(tree2.equals(expectedTree)).to.be.true;
					});
				}

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

				const firstVersion = sortedVersions[0];
				for (let i = 1; i < sortedVersions.length; i++) {
					const secondVersion = sortedVersions[i];
					it(`version ${firstVersion} and version ${secondVersion} summaries produce identical trees`, () => {
						const serializedSummary1 = assertNotUndefined(summaryByVersion.get(firstVersion));
						const summary1 = deserialize(serializedSummary1, testSerializer);
						expectedTree.loadSummary(summary1);

						const { tree } = setUpTestSharedTree();
						const serializedSummary2 = assertNotUndefined(summaryByVersion.get(secondVersion));
						const summary2 = deserialize(serializedSummary2, testSerializer);
						tree.loadSummary(summary2);

						expect(tree.equals(expectedTree)).to.be.true;
					});
				}

				// Check that clients with certain loaded versions can write their supported write versions.
				for (const [index, readVersion] of sortedVersions.entries()) {
					// A client that has loaded an older version of a summary should be able to write newer versions
					for (const writeVersion of sortedVersions.slice(index)) {
						const summarizerEntry = supportedSummarizers.find((entry) => entry.version === writeVersion);
						if (summarizerEntry !== undefined) {
							const summarizer = summarizerEntry.summarizer;
							it(`format version ${writeVersion} can be written by a client that loaded version ${readVersion}`, async () => {
								// Load the first summary file (the one with the oldest version)
								const serializedSummary = assertNotUndefined(summaryByVersion.get(readVersion));
								const summary = deserialize(serializedSummary, testSerializer);

								// Wait for the ops to to be submitted and processed across the containers.
								await testObjectProvider.ensureSynchronized();
								expectedTree.loadSummary(summary);

								await testObjectProvider.ensureSynchronized();

								// Write a new summary with the specified version
								const newSummary = JSON.parse(expectedTree.saveSerializedSummary(summarizer));

								// Check the newly written summary is equivalent to its corresponding test summary file.
								// This assumes the input file is normalized (that summarizing it produces an identical output).
								// TODO: Add support for testing de-normalized files, such as files with empty traits.
								const expectedSummary = JSON.parse(
									assertNotUndefined(summaryByVersion.get(writeVersion))
								);

								expect(newSummary).to.deep.equal(expectedSummary);
							});
						}
					}
				}

				// Forward compatibility tests
				for (const { summarizerVersion, loadVersions } of forwardCompatibilityTests) {
					for (const { loadVersion, condition, conditionalWriteVersion } of loadVersions) {
						it(`version ${loadVersion} can be loaded by a client with summarizer format ${summarizerVersion} and written in the correct summary version`, async () => {
							const summarizerEntry = supportedSummarizers.find(
								(entry) => entry.version === summarizerVersion
							);
							if (summarizerEntry !== undefined) {
								const serializedSummary = assertNotUndefined(summaryByVersion.get(loadVersion));
								const summary = deserialize(serializedSummary, testSerializer);

								// Wait for the ops to to be submitted and processed across the containers.
								await testObjectProvider.ensureSynchronized();
								expectedTree.loadSummary(summary);

								await testObjectProvider.ensureSynchronized();

								// Write a new summary with the summarizer of version `summarizerVersion`.
								const summarizer = summarizerEntry.summarizer;
								const newSummary = JSON.parse(expectedTree.saveSerializedSummary(summarizer));

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

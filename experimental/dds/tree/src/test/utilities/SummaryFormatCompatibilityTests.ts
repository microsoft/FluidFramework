/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from 'fs';
import { resolve, join } from 'path';
import { assert, expect } from 'chai';
import { TestObjectProvider } from '@fluidframework/test-utils';
import { fail } from '../../Common';
import { SharedTree } from '../../default-edits';
import { EditId } from '../../Identifiers';
import { deserialize } from '../../SummaryBackCompatibility';
import {
	fullHistorySummarizer,
	fullHistorySummarizer_0_1_0,
	SharedTreeSummarizer,
	SharedTreeSummaryBase,
} from '../../generic';
import { SharedTreeWithAnchors } from '../../anchored-edits';
import {
	createStableEdits,
	LocalServerSharedTreeTestingComponents,
	LocalServerSharedTreeTestingOptions,
	SharedTreeTestingComponents,
	SharedTreeTestingOptions,
} from './TestUtilities';
import { TestFluidSerializer } from './TestSerializer';

// This accounts for this file being executed after compilation. If many tests want to leverage resources, we should unify
// resource path logic to a single place.
const pathBase = resolve(__dirname, '../../../src/test/summary-files/');

function summaryFilePath(summaryName: string): string {
	return join(pathBase, `${summaryName}.json`);
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
export function runSummaryTests<TSharedTree extends SharedTree | SharedTreeWithAnchors>(
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

		const testSummaryFiles = fs.readdirSync(pathBase);

		// Create and populate a map of the file names associated with their summary type
		const summaryTypes = new Map<string, string[]>();
		for (let fileName of testSummaryFiles) {
			// Summary files should be named in the following format: `${summaryType}-${version}.json`
			const fileNameRegularExpression = /(?<summaryType>[\w+-]*\w+)-(?<version>\d+\.\d\.\d).json/;
			const match = fileNameRegularExpression.exec(fileName);

			const matchGroups = match?.groups ?? fail(`invalid filename ${fileName}`);
			const summaryType = matchGroups.summaryType;
			fileName = `${matchGroups.summaryType}-${matchGroups.version}`;

			let collection = summaryTypes.get(summaryType);
			if (collection === undefined) {
				collection = [];
				summaryTypes.set(summaryType, collection);
			}
			collection.push(fileName);
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

		const validateSummaryRead = (fileName: string): void => {
			const serializedSummary = fs.readFileSync(summaryFilePath(fileName), 'utf8');
			const summary = deserialize(serializedSummary, testSerializer);

			const { tree } = setUpTestSharedTree();
			assert.typeOf(summary, 'object');
			tree.loadSummary(summary as SharedTreeSummaryBase);

			expect(tree.equals(expectedTree)).to.be.true;
		};

		const validateSummaryWrite = (summarizer: SharedTreeSummarizer<unknown>): void => {
			// Save a new summary with the expected tree and use it to load a new SharedTree
			const newSummary = summarizer(expectedTree.edits, expectedTree.currentView);
			const { tree: tree2 } = setUpTestSharedTree();
			tree2.loadSummary(newSummary);

			// The expected tree, tree loaded with the existing summary, and the tree loaded
			// with the new summary should all be equal.
			expect(tree2.equals(expectedTree)).to.be.true;
		};

		for (const [summaryType, files] of summaryTypes.entries()) {
			it(`files of type '${summaryType}' with different format versions produce identical trees`, () => {
				// Load the first summary file
				const serializedSummary = fs.readFileSync(summaryFilePath(files[0]), 'utf8');
				const summary = deserialize(serializedSummary, testSerializer);
				assert.typeOf(summary, 'object');
				expectedTree.loadSummary(summary as SharedTreeSummaryBase);

				// Check every other summary file results in the same loaded tree
				for (let i = 1; i < files.length; i++) {
					const { tree } = setUpTestSharedTree();

					const serializedSummary = fs.readFileSync(summaryFilePath(files[i]), 'utf8');
					const summary = deserialize(serializedSummary, testSerializer);
					assert.typeOf(summary, 'object');
					tree.loadSummary(summary as SharedTreeSummaryBase);

					expect(tree.equals(expectedTree)).to.be.true;
				}
			});

			for (const { version, summarizer } of supportedSummarizers) {
				it(`format version ${version} can be written for ${summaryType} summary type`, async () => {
					// Load the first summary file (the one with the oldest version)
					const serializedSummary = fs.readFileSync(summaryFilePath(files.sort()[0]), 'utf8');
					const summary = deserialize(serializedSummary, testSerializer);
					assert.typeOf(summary, 'object');

					// Wait for the ops to to be submitted and processed across the containers.
					await testObjectProvider.ensureSynchronized();
					expectedTree.loadSummary(summary as SharedTreeSummaryBase);

					await testObjectProvider.ensureSynchronized();

					// Write a new summary with the specified version
					const newSummary = expectedTree.saveSerializedSummary({ summarizer });

					// Check the newly written summary is equivalent to its corresponding test summary file
					const fileName = `${summaryType}-${version}`;
					// Re-stringify the the JSON file to remove escaped characters
					const expectedSummary = JSON.stringify(
						JSON.parse(fs.readFileSync(summaryFilePath(fileName), 'utf8'))
					);

					expect(newSummary).to.equal(expectedSummary);
				});
			}
		}

		describe('version 0.0.2', () => {
			it('can be read and written with no history', async () => {
				validateSummaryRead('no-history-0.0.2');
				validateSummaryWrite(fullHistorySummarizer);
			});

			it('can be read and written with small history', async () => {
				createStableEdits(11).forEach((edit) => {
					expectedTree.processLocalEdit(edit);
				});

				// Wait for the ops to to be submitted and processed across the containers.
				await testObjectProvider.ensureSynchronized();

				validateSummaryRead('small-history-0.0.2');
				validateSummaryWrite(fullHistorySummarizer);
			});
		});

		describe('version 0.1.0', () => {
			it('can be read and written with no history', async () => {
				validateSummaryRead('no-history-0.1.0');
				validateSummaryWrite(fullHistorySummarizer_0_1_0);
			});

			it('can be read and written with large history', async () => {
				testObjectProvider.logger.registerExpectedEvent(
					{ eventName: 'fluid:telemetry:Batching:LengthTooBig' },
					{ eventName: 'fluid:telemetry:Batching:LengthTooBig' }
				);
				// Process an arbitrarily large number of stable edits
				createStableEdits(251).forEach((edit) => {
					expectedTree.processLocalEdit(edit);
				});

				// Wait for the ops to to be submitted and processed across the containers.
				await testObjectProvider.ensureSynchronized();

				validateSummaryRead('large-history-0.1.0');
				validateSummaryWrite(fullHistorySummarizer_0_1_0);
			});
		});
	});
}

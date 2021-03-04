import * as fs from 'fs';
import { resolve, join } from 'path';
import { v5 as uuidv5 } from 'uuid';
import { assert, expect } from 'chai';
import { TestObjectProvider } from '@fluidframework/test-utils';
import { fail } from '../Common';
import { Change, StablePlace } from '../PersistedTypes';
import { DetachedSequenceId, EditId, NodeId } from '../Identifiers';
import { newEdit } from '../EditUtilities';
import { SharedTree, SharedTreeEvent } from '../SharedTree';
import { deserialize } from '../SummaryBackCompatibility';
import {
	fullHistorySummarizer,
	fullHistorySummarizer_0_1_0,
	SharedTreeSummarizer,
	SharedTreeSummaryBase,
} from '../Summary';
import {
	ITestContainerConfig,
	left,
	makeEmptyNode,
	setUpLocalServerTestSharedTree,
	setUpTestSharedTree,
} from './utilities/TestUtilities';

// This accounts for this file being executed after compilation. If many tests want to leverage resources, we should unify
// resource path logic to a single place.
const pathBase = resolve(__dirname, '../../src/test/summary-files/');

function summaryFilePath(summaryName: string): string {
	return join(pathBase, `${summaryName}.json`);
}

/**
 * A version/summarizer pair must be specified for a write test to be generated.
 * Versions that can no longer be written should be removed from this list.
 */
const supportedSummarizers: { version: string; summarizer: SharedTreeSummarizer }[] = [
	{ version: '0.0.2', summarizer: fullHistorySummarizer },
	{ version: '0.1.0', summarizer: fullHistorySummarizer_0_1_0 },
];

describe('Summary', () => {
	const uuidNamespace = '44864298-500e-4cf8-9f44-a249e5b3a286';
	const setupEditId = '9406d301-7449-48a5-b2ea-9be637b0c6e4' as EditId;

	let expectedTree: SharedTree;
	let localTestObjectProvider: TestObjectProvider<ITestContainerConfig>;

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
		localTestObjectProvider = testingComponents.testObjectProvider;
	});

	// Completes any pending chunk uploads on expectedTree and processes the handle ops
	const catchupExpectedTree = async () => {
		expectedTree.saveSummary();
		await new Promise((resolve) => expectedTree.once(SharedTreeEvent.ChunksUploaded, resolve));
		await localTestObjectProvider.opProcessingController.process();
	};

	afterEach(async () => {
		localTestObjectProvider.reset();
	});

	const validateSummaryRead = (fileName: string): void => {
		const serializeSummary = fs.readFileSync(summaryFilePath(fileName), 'utf8');
		const summary = deserialize(serializeSummary);

		const { tree } = setUpTestSharedTree();
		assert.typeOf(summary, 'object');
		tree.loadSummary(summary as SharedTreeSummaryBase);

		expect(tree.equals(expectedTree)).to.be.true;
	};

	const validateSummaryWrite = (summarizer: SharedTreeSummarizer): void => {
		// Save a new summary with the expected tree and use it to load a new SharedTree
		expectedTree.summarizer = summarizer;
		const newSummary = expectedTree.saveSummary();
		const { tree: tree2 } = setUpTestSharedTree();
		tree2.loadSummary(newSummary);

		// The expected tree, tree loaded with the existing summary, and the tree loaded
		// with the new summary should all be equal.
		expect(tree2.equals(expectedTree)).to.be.true;
	};

	for (const [summaryType, files] of summaryTypes.entries()) {
		it(`files of type '${summaryType}' with different format versions produce identical trees`, () => {
			// Load the first summary file
			const serializeSummary = fs.readFileSync(summaryFilePath(files[0]), 'utf8');
			const summary = deserialize(serializeSummary);
			assert.typeOf(summary, 'object');
			expectedTree.loadSummary(summary as SharedTreeSummaryBase);

			// Check every other summary file results in the same loaded tree
			for (let i = 1; i < files.length; i++) {
				const { tree } = setUpTestSharedTree();

				const serializeSummary = fs.readFileSync(summaryFilePath(files[i]), 'utf8');
				const summary = deserialize(serializeSummary);
				assert.typeOf(summary, 'object');
				tree.loadSummary(summary as SharedTreeSummaryBase);

				expect(tree.equals(expectedTree)).to.be.true;
			}
		});

		for (const { version, summarizer } of supportedSummarizers) {
			it(`format version ${version} can be written for ${summaryType} summary type`, async () => {
				// Load the first summary file (the one with the oldest version)
				const serializeSummary = fs.readFileSync(summaryFilePath(files.sort()[0]), 'utf8');
				const summary = deserialize(serializeSummary);
				assert.typeOf(summary, 'object');
				expectedTree.loadSummary(summary as SharedTreeSummaryBase);

				await catchupExpectedTree();

				// Write a new summary with the specified version
				expectedTree.summarizer = summarizer;
				const newSummary = expectedTree.saveSummary();

				// Check the newly written summary is equivalent to its corresponding test summary file
				const fileName = `${summaryType}-${version}`;
				const expectedSerializeSummary = fs.readFileSync(summaryFilePath(fileName), 'utf8');
				const expectedSummary = deserialize(expectedSerializeSummary);

				expect(newSummary).to.deep.equal(expectedSummary);
			});
		}
	}

	describe('format version 0.0.2', () => {
		it('can be read and written with no history', async () => {
			validateSummaryRead('no-history-0.0.2');
			validateSummaryWrite(fullHistorySummarizer);
		});

		it('can be read and written with small history', async () => {
			const numberOfEdits = 10;
			// First edit is an insert
			const nodeId = 'ae6b24eb-6fa8-42cc-abd2-48f250b7798f' as NodeId;
			const node = makeEmptyNode(nodeId);
			const firstEdit = newEdit([
				Change.build([node], 0 as DetachedSequenceId),
				Change.insert(0 as DetachedSequenceId, StablePlace.before(left)),
			]);
			expectedTree.processLocalEdit({ ...firstEdit, id: uuidv5('test', uuidNamespace) as EditId });

			// Every subsequent edit is a set payload
			for (let i = 1; i < numberOfEdits; i++) {
				const edit = newEdit([Change.setPayload(nodeId, { base64: 'dGVzdA==' })]);
				expectedTree.processLocalEdit({ ...edit, id: uuidv5(i.toString(), uuidNamespace) as EditId });
			}

			await localTestObjectProvider.opProcessingController.process();

			validateSummaryRead('small-history-0.0.2');
			validateSummaryWrite(fullHistorySummarizer);
		});
	});

	describe('format version 0.1.0', () => {
		it('can be read and written with no history', async () => {
			validateSummaryRead('no-history-0.1.0');
			validateSummaryWrite(fullHistorySummarizer_0_1_0);
		});

		it('can be read and written with large history', async () => {
			// Arbitrarily large number of edits
			const numberOfEdits = 250;
			// First edit is an insert
			const nodeId = 'ae6b24eb-6fa8-42cc-abd2-48f250b7798f' as NodeId;
			const node = makeEmptyNode(nodeId);
			const firstEdit = newEdit([
				Change.build([node], 0 as DetachedSequenceId),
				Change.insert(0 as DetachedSequenceId, StablePlace.before(left)),
			]);
			expectedTree.processLocalEdit({ ...firstEdit, id: uuidv5('test', uuidNamespace) as EditId });

			// Every subsequent edit is a set payload
			for (let i = 1; i < numberOfEdits; i++) {
				const edit = newEdit([Change.setPayload(nodeId, { base64: 'dGVzdA==' })]);
				expectedTree.processLocalEdit({ ...edit, id: uuidv5(i.toString(), uuidNamespace) as EditId });
			}

			await localTestObjectProvider.opProcessingController.process();

			await catchupExpectedTree();

			validateSummaryRead('large-history-0.1.0');
			validateSummaryWrite(fullHistorySummarizer_0_1_0);
		});
	});
});

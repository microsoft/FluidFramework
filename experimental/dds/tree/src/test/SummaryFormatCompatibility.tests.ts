/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from 'fs';
import { v5 as uuidv5 } from 'uuid';
import { assert, expect } from 'chai';
import { TestObjectProvider } from '@fluidframework/test-utils';
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
	simpleTestTree,
} from './utilities/TestUtilities';

describe('Summary format', () => {
	const uuidNamespace = '44864298-500e-4cf8-9f44-a249e5b3a286';
	// This path can't be found by the mocha test explorer but is found by `npm test`
	const summaryFilesPath = 'src/test/summary-files/';
	const setupEditId = '9406d301-7449-48a5-b2ea-9be637b0c6e4' as EditId;

	let expectedTree: SharedTree;
	let localTestObjectProvider: TestObjectProvider;

	// Resets the tree before each test
	beforeEach(async () => {
		const testingComponents = await setUpLocalServerTestSharedTree({
			initialTree: simpleTestTree,
			setupEditId,
		});
		expectedTree = testingComponents.tree;
		localTestObjectProvider = testingComponents.localTestObjectProvider;
	});

	const validateSummaryRead = (fileName: string): void => {
		const serializeSummary = fs.readFileSync(`${summaryFilesPath}${fileName}.json`, 'utf8');
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

	describe('version 0.0.2', () => {
		it('can be read and written with no history', async () => {
			validateSummaryRead('0.0.2-no-history');
			validateSummaryWrite(fullHistorySummarizer);
		});

		it('can be read and written with history', async () => {
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

			await localTestObjectProvider.ensureSynchronized();

			validateSummaryRead('0.0.2-history');
			validateSummaryWrite(fullHistorySummarizer);
		});
	});

	describe('version 0.1.0', () => {
		// Completes any pending chunk uploads on expectedTree and processes the handle ops
		const catchupExpectedTree = async () => {
			expectedTree.saveSummary();
			await new Promise((resolve) => expectedTree.once(SharedTreeEvent.ChunksUploaded, resolve));
			await localTestObjectProvider.ensureSynchronized();
		};

		it('can be read and written with no history', async () => {
			validateSummaryRead('0.1.0-no-history');
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

			await localTestObjectProvider.ensureSynchronized();

			await catchupExpectedTree();

			validateSummaryRead('0.1.0-large');
			validateSummaryWrite(fullHistorySummarizer_0_1_0);
		});
	});
});

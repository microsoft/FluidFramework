import path from 'path';
import * as fs from 'fs';
import { assert, expect } from 'chai';
import { Change, StablePlace } from '../PersistedTypes';
import { deserialize, SharedTreeSummary } from '../Summary';
import { DetachedSequenceId, EditId, NodeId } from '../Identifiers';
import { newEdit } from '../EditUtilities';
import {
	leftConsistent,
	makeEmptyNode,
	setUpTestSharedTree,
	simpleTestTreeConsistent,
} from './utilities/TestUtilities';

function summaryFilePath(formatVersion: string): string {
	const summaryFileName = `${formatVersion}.json`;
	return path.resolve('packages/shared-tree/src/test/summary-files/', summaryFileName);
}

describe('Summary back compatibility', () => {
	const setupEditId = '9406d301-7449-48a5-b2ea-9be637b0c6e4' as EditId;
	const { tree: expectedTree, containerRuntimeFactory } = setUpTestSharedTree({
		initialTree: simpleTestTreeConsistent,
		localMode: false,
		setupEditId,
	});
	const [, edit] = newEdit([
		Change.build([makeEmptyNode('ae6b24eb-6fa8-42cc-abd2-48f250b7798f' as NodeId)], 0 as DetachedSequenceId),
		Change.insert(0 as DetachedSequenceId, StablePlace.before(leftConsistent)),
	]);
	expectedTree.processLocalEdit('48e38bb4-6953-4dbc-9811-9c69512f29c2' as EditId, edit);
	containerRuntimeFactory.processAllMessages();

	const testedVersions = ['0.0.2'];

	testedVersions.forEach((version) => {
		it(`correctly loads version ${version}`, () => {
			const serializeSummary = fs.readFileSync(summaryFilePath(version), 'utf8');

			const { tree } = setUpTestSharedTree();

			const summary = deserialize(serializeSummary);
			assert.typeOf(summary, 'object');
			tree.loadSummary(summary as SharedTreeSummary);

			expect(tree.equals(expectedTree)).to.be.true;
		});
	});
});

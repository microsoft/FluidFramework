/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { NodeId } from '../Identifiers';
import { makeEmptyNode, makeTestNode, deepCompareNodes } from './utilities/TestUtilities';

// TODO #45414: Re-enable when compareEdits compares the actual changes instead of just the edit IDs.
// 			    Commented out instead of skipped to avoid linting errors.
// describe('compareSequencedEdits', () => {
// 	it('correctly compares two equal sequenced edits', () => {
// 		const node = makeTestNode();
// 		const editId = '75dd0d7d-ea87-40cf-8860-dc2b9d827597' as EditId;
// 		const editA: Edit = {
// 			changes: [Delete.create(StableRange.only(node))],
// 		};

// 		const sequencedEditB: Edit = {
// 			changes: [Delete.create(StableRange.only(node))],
// 		};

// 		expect(compareEdits(editA, sequencedEditB)).to.be.true;
// 	});

// 	it('correctly compares two non-equal sequenced edits', () => {
// 		const node = makeTestNode();
// 		const nodeDestination = makeTestNode();

// 		const sequencedEditA: Edit = {
// 			changes: [Delete.create(StableRange.only(node))],
// 			id: '7366efae-f96a-4f5d-9c6c-eea62ac6dffb' as EditId,
// 		};

// 		const sequencedEditB: Edit = {
// 			changes: [...Move.create(StableRange.only(node), StablePlace.before(nodeDestination))],
// 			id: '57cb9fa9-9d1d-49eb-919a-5636ed55a65a' as EditId,
// 		};

// 		expect(compareEdits(sequencedEditA, sequencedEditB)).to.be.false;
// 	});
// });

describe('deepCompareNodes', () => {
	it('correctly compares two empty nodes', () => {
		const nodeId = '8d39e7ee-890a-4443-aef7-16d7e8ef3de0' as NodeId;
		expect(deepCompareNodes(makeEmptyNode(nodeId), makeEmptyNode(nodeId))).to.be.true;
	});

	it('correctly compares two deeply equal nodes', () => {
		const nodeId = 'a5946b8c-fb40-4631-81c8-c5473da50359' as NodeId;
		expect(deepCompareNodes(makeTestNode(nodeId), makeTestNode(nodeId))).to.be.true;
	});

	it('returns false for unequal nodes', () => {
		const nodeId = '30df2134-f347-494b-9f47-ddc9a73f227b' as NodeId;
		expect(deepCompareNodes(makeEmptyNode(), makeEmptyNode())).to.be.false;
		expect(deepCompareNodes(makeEmptyNode(nodeId), makeTestNode(nodeId))).to.be.false;
		expect(deepCompareNodes(makeEmptyNode(), makeTestNode())).to.be.false;
		expect(deepCompareNodes(makeTestNode(), makeEmptyNode())).to.be.false;
	});
});

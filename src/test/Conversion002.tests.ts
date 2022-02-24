/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import {
	StablePlace,
	StableRange,
	tryConvertToStablePlace,
	tryConvertToStablePlace_0_0_2,
	tryConvertToStableRange,
	tryConvertToStableRange_0_0_2,
} from '../default-edits';
import {
	tryConvertToChangeNode,
	tryConvertToChangeNode_0_0_2,
	tryConvertToNodeData,
	tryConvertToNodeData_0_0_2,
} from '../generic';
import { expectDefined } from './utilities/TestCommon';
import { refreshTestTree, deepCompareNodes, areNodesEquivalent } from './utilities/TestUtilities';

describe('0_0_2 type conversions', () => {
	const testTree = refreshTestTree();

	it('can convert stable places', () => {
		const stablePlace = StablePlace.after(testTree.left);
		const stablePlace_0_0_2 = expectDefined(tryConvertToStablePlace_0_0_2(stablePlace, testTree));
		const stablePlaceConverted = expectDefined(tryConvertToStablePlace(stablePlace_0_0_2, testTree));
		expect(stablePlace).to.deep.equal(stablePlaceConverted);
	});

	it('can convert stable ranges', () => {
		const stableRange = StableRange.only(testTree.left);
		const stableRange_0_0_2 = expectDefined(tryConvertToStableRange_0_0_2(stableRange, testTree));
		const stableRangeConverted = expectDefined(tryConvertToStableRange(stableRange_0_0_2, testTree));
		expect(stableRange).to.deep.equal(stableRangeConverted);
	});

	it('can convert node data', () => {
		const nodeData = testTree;
		const nodeData_0_0_2 = expectDefined(tryConvertToNodeData_0_0_2(nodeData, testTree));
		const nodeDataConverted = expectDefined(tryConvertToNodeData(nodeData_0_0_2, testTree));
		expect(areNodesEquivalent(nodeData, nodeDataConverted)).to.be.true;
	});

	it('can convert change nodes', () => {
		const changeNode = testTree;
		const changeNode_0_0_2 = expectDefined(tryConvertToChangeNode_0_0_2(changeNode, testTree));
		const changeNodeConverted = expectDefined(tryConvertToChangeNode(changeNode_0_0_2, testTree));
		expect(deepCompareNodes(changeNode, changeNodeConverted)).to.be.true;
	});
});

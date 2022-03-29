/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { StablePlace, StableRange } from '../ChangeTypes';
import {
	tryConvertToChangeNode,
	tryConvertToChangeNode_0_0_2,
	tryConvertToNodeData,
	tryConvertToNodeData_0_0_2,
	tryConvertToStablePlace,
	tryConvertToStablePlaceInternal_0_0_2,
	tryConvertToStableRange,
	tryConvertToStableRangeInternal_0_0_2,
} from '../Conversion002';
import { deepCompareNodes } from '../EditUtilities';
import { expectDefined } from './utilities/TestCommon';
import { refreshTestTree, areNodesEquivalent } from './utilities/TestUtilities';

describe('0_0_2 type conversions', () => {
	const testTree = refreshTestTree();

	it('can convert stable places', () => {
		const stablePlace = StablePlace.after(testTree.left);
		const StablePlaceInternal_0_0_2 = expectDefined(tryConvertToStablePlaceInternal_0_0_2(stablePlace, testTree));
		const stablePlaceConverted = expectDefined(tryConvertToStablePlace(StablePlaceInternal_0_0_2, testTree));
		expect(stablePlace).to.deep.equal(stablePlaceConverted);
	});

	it('can convert stable ranges', () => {
		const stableRange = StableRange.only(testTree.left);
		const StableRangeInternal_0_0_2 = expectDefined(tryConvertToStableRangeInternal_0_0_2(stableRange, testTree));
		const stableRangeConverted = expectDefined(tryConvertToStableRange(StableRangeInternal_0_0_2, testTree));
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

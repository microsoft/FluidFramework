/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { StablePlace, StableRange } from '../ChangeTypes';
import { convertStablePlaceIds, convertStableRangeIds, convertNodeDataIds } from '../IdConversion';
import { NodeId, StableNodeId } from '../Identifiers';
import { refreshTestTree, areNodesEquivalent } from './utilities/TestUtilities';

describe('0_0_2 type conversions', () => {
	const testTree = refreshTestTree();

	it('can convert stable places', () => {
		const stablePlace = StablePlace.after(testTree.left);
		const stablePlaceInternal_0_0_2 = convertStablePlaceIds(stablePlace, convertToStableId);
		const stablePlaceConverted = convertStablePlaceIds(stablePlaceInternal_0_0_2, convertToNodeId);
		expect(stablePlace).to.deep.equal(stablePlaceConverted);
	});

	it('can convert stable ranges', () => {
		const stableRange = StableRange.only(testTree.left);
		const stableRangeInternal_0_0_2 = convertStableRangeIds(stableRange, convertToStableId);
		const stableRangeConverted = convertStableRangeIds(stableRangeInternal_0_0_2, convertToNodeId);
		expect(stableRange).to.deep.equal(stableRangeConverted);
	});

	it('can convert node data', () => {
		const nodeData = testTree;
		const nodeData_0_0_2 = convertNodeDataIds(nodeData, convertToStableId);
		const nodeDataConverted = convertNodeDataIds(nodeData_0_0_2, convertToNodeId);
		expect(areNodesEquivalent(nodeData, nodeDataConverted)).to.be.true;
	});

	function convertToStableId(id: NodeId): StableNodeId {
		return testTree.convertToStableNodeId(id);
	}

	function convertToNodeId(id: StableNodeId): NodeId {
		return testTree.convertToNodeId(id);
	}
});

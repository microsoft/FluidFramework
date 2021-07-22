/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { compareForestNodes, Forest, ForestNode } from '../Forest';
import { Payload } from '../generic';
import { NodeId, TraitLabel } from '../Identifiers';
import { makeEmptyNode } from './utilities/TestUtilities';

const mainTraitLabel = 'main' as TraitLabel;

function makeForestNodeWithChildren(id: NodeId, ...children: NodeId[]): ForestNode {
	return {
		...makeEmptyNode(id),
		traits: new Map(children.length > 0 ? [[mainTraitLabel, [...children]]] : []),
	};
}

describe('Forest', () => {
	const parentId = 'parent' as NodeId;
	const childId = 'child' as NodeId;
	const secondChildId = 'secondChild' as NodeId;
	const thirdChildId = 'thirdChild' as NodeId;
	const childNode = makeForestNodeWithChildren(childId);
	const parentNode = makeForestNodeWithChildren(parentId);
	const emptyForest = Forest.create(true);
	const oneNodeForest = emptyForest.add([parentNode]);
	const parentForest = oneNodeForest.add([childNode]).attachRangeOfChildren(parentId, mainTraitLabel, 0, [childId]);
	const grandparentForest = parentForest
		.add([makeForestNodeWithChildren(secondChildId)])
		.attachRangeOfChildren(childId, mainTraitLabel, 0, [secondChildId]);

	const threeLeafForest = parentForest
		.add([makeForestNodeWithChildren(secondChildId), makeForestNodeWithChildren(thirdChildId)])
		.attachRangeOfChildren(parentId, mainTraitLabel, 1, [secondChildId, thirdChildId]);

	it('test forests are consistent', () => {
		emptyForest.assertConsistent();
		parentForest.assertConsistent();
		expect(emptyForest.size).equals(0);
		expect(parentForest.size).equals(2);
	});

	it('fails on multiparenting', () => {
		expect(() => oneNodeForest.add([makeForestNodeWithChildren(parentId, childId, childId)])).to.throw();
	});

	it('cannot add a node with a duplicate ID', () => {
		expect(() => oneNodeForest.add([makeForestNodeWithChildren(parentId)])).to.throw();
	});

	it('can get nodes in the forest', () => {
		expect(compareForestNodes(parentForest.get(childId), childNode));
		expect(compareForestNodes(parentForest.get(parentId), parentNode));
	});

	it('can get parents in the forest', () => {
		expect(parentForest.tryGetParent(parentId)).to.be.undefined;
		expect(parentForest.tryGetParent(childId)?.parentId).to.equal(parentId);
	});

	it('can add nodes', () => {
		let forestA = emptyForest;
		const children: ForestNode[] = [];
		const numToAdd = 10;
		for (let i = 0; i < numToAdd; i++) {
			const node = makeForestNodeWithChildren(i.toString() as NodeId);
			children.push(node);
			forestA = forestA.add([node]);
		}
		const forestB = emptyForest.add(children);
		forestA.assertConsistent();
		forestB.assertConsistent();
		expect(forestA.size).to.equal(10);
		expect(forestA.equals(forestB)).to.be.true;
	});

	it('can replace payloads', () => {
		expectSuccessfulReplace(oneNodeForest, parentId, 0); // Set a payload when there was none
		expectSuccessfulReplace(oneNodeForest, parentId, 1); // Change a payload
	});

	it('can correctly attach a range to an empty trait on a root', () => {
		const moreChildrenForest = oneNodeForest.add([
			makeForestNodeWithChildren(childId),
			makeForestNodeWithChildren(secondChildId),
		]);

		expectSuccessfulAttach(moreChildrenForest, parentId, mainTraitLabel, 0, [childId, secondChildId]);
	});

	it('can correctly attach ranges to a populated trait on a root', () => {
		const twoLeafForest = parentForest.add([
			makeForestNodeWithChildren(secondChildId),
			makeForestNodeWithChildren(thirdChildId),
		]);

		expectSuccessfulAttach(twoLeafForest, parentId, mainTraitLabel, 1, [secondChildId]);
		expectSuccessfulAttach(twoLeafForest, parentId, mainTraitLabel, 1, [thirdChildId]);
	});

	it('can correctly attach ranges under a leaf', () => {
		const threeNodeForest = parentForest.add([makeForestNodeWithChildren(secondChildId)]);
		expectSuccessfulAttach(threeNodeForest, childId, mainTraitLabel, 0, [secondChildId]);
	});

	it('only accepts valid indices for attaches', () => {
		const twoNodeForest = oneNodeForest.add([makeForestNodeWithChildren(childId)]);
		expect(() => twoNodeForest.attachRangeOfChildren(parentId, mainTraitLabel, -1, [childId])).to.throw(
			'invalid attach index'
		);
		expect(() => twoNodeForest.attachRangeOfChildren(parentId, mainTraitLabel, 1, [childId])).to.throw(
			'invalid attach index'
		);
	});

	it('does not add trait when attaching empty range to empty trait', () => {
		const forestWithAttach = oneNodeForest.attachRangeOfChildren(parentId, mainTraitLabel, 0, []);
		const newParent = forestWithAttach.get(parentId);
		expect(newParent.traits.get(mainTraitLabel)).equals(undefined);
	});

	it('can correctly detach a range on a root node', () => {
		expectSuccessfulDetach(threeLeafForest, parentId, mainTraitLabel, 1, 2);
	});

	it('can correctly detach a range on a leaf node', () => {
		expectSuccessfulDetach(grandparentForest, childId, mainTraitLabel, 0, 1);
	});

	it('can correctly detach an entire trait', () => {
		expectSuccessfulDetach(threeLeafForest, parentId, mainTraitLabel, 0, 2);
	});

	it('only accepts valid indices for detaches', () => {
		expect(() => parentForest.detachRangeOfChildren(parentId, mainTraitLabel, -1, -1)).to.throw(
			'invalid detach index range'
		);
		expect(() => parentForest.detachRangeOfChildren(parentId, mainTraitLabel, -1, 0)).to.throw(
			'invalid detach index range'
		);
		expect(() => parentForest.detachRangeOfChildren(parentId, mainTraitLabel, 1, 0)).to.throw(
			'invalid detach index range'
		);
		expect(() => parentForest.detachRangeOfChildren(parentId, mainTraitLabel, 0, 2)).to.throw(
			'invalid detach index range'
		);
		expect(() => parentForest.detachRangeOfChildren(parentId, mainTraitLabel, 1, 2)).to.throw(
			'invalid detach index range'
		);
	});

	it('cannot delete parented nodes', () => {
		expect(() => parentForest.delete([childId], false)).throws('deleted nodes must be unparented');
	});

	it('can delete a root', () => {
		const deleteRoot = parentForest.delete([parentId], false);
		deleteRoot.assertConsistent();
		expect(deleteRoot.size).to.equal(1);
		expect(deleteRoot.tryGet(childId)).to.not.be.undefined;
	});

	it('can delete a subtree', () => {
		const deleteLeaf = parentForest.delete([parentId], true);
		deleteLeaf.assertConsistent();
		expect(deleteLeaf.size).to.equal(0);
	});

	it('calculates deltas correctly', () => {
		const add = emptyForest.delta(oneNodeForest);
		const remove = oneNodeForest.delta(emptyForest);
		const same = parentForest.delta(parentForest);
		const modified = parentForest.setValue(childId, -1);
		const modify = parentForest.delta(modified);

		expect(remove).deep.equals({ changed: [], added: [], removed: [parentId] });
		expect(add).deep.equals({ changed: [], added: [parentId], removed: [] });
		expect(same).deep.equals({ changed: [], added: [], removed: [] });
		expect(modify).deep.equals({ changed: [childId], added: [], removed: [] });
	});

	it('calculates equality correctly', () => {
		const modified = parentForest.setValue(parentId, -1);

		expect(oneNodeForest.equals(emptyForest)).false;
		expect(emptyForest.equals(oneNodeForest)).false;
		expect(parentForest.equals(parentForest)).true;
		expect(parentForest.equals(modified)).false;
	});

	function expectSuccessfulAttach(
		forest: Forest,
		parentId: NodeId,
		label: TraitLabel,
		index: number,
		childIds: NodeId[]
	): void {
		const parent = forest.get(parentId);
		const expectedTrait = [...(parent.traits.get(label) ?? [])];
		expectedTrait.splice(index, 0, ...childIds);
		const forestWithAttach = forest.attachRangeOfChildren(parentId, label, index, childIds);
		const newParent = forestWithAttach.get(parentId);
		expect(newParent.traits.get(label)).deep.equals(expectedTrait);
		for (const childId of childIds) {
			const parentData = forestWithAttach.tryGetParent(childId);
			expect(parentData?.traitParent).to.equal(label);
			expect(parentData?.parentId).to.equal(parentId);
		}
	}

	function expectSuccessfulDetach(
		forest: Forest,
		parentId: NodeId,
		label: TraitLabel,
		startIndex: number,
		endIndex: number
	): void {
		const parent = forest.get(parentId);
		const expectedTrait = [...(parent.traits.get(label) ?? [])];
		const spliced = expectedTrait.splice(startIndex, endIndex - startIndex);
		const { forest: forestWithDetach, detached } = forest.detachRangeOfChildren(
			parentId,
			label,
			startIndex,
			endIndex
		);

		const newParent = forestWithDetach.get(parentId);
		const trait = newParent.traits.get(label);
		if (expectedTrait.length === 0) {
			expect(trait).to.be.undefined;
		} else {
			expect(trait).deep.equals(expectedTrait);
		}

		expect(detached).deep.equals(spliced);
		for (const detachedId of detached) {
			expect(forestWithDetach.tryGetParent(detachedId)).to.be.undefined;
		}
	}

	function expectSuccessfulReplace(forest: Forest, nodeId: NodeId, payload: Payload | null): void {
		const forestWithReplace = forest.setValue(nodeId, payload);
		const newNode = forestWithReplace.get(nodeId);
		expect(newNode.payload).equals(payload);
	}
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { compareForestNodes, Forest, ForestNode } from '../Forest';
import { NodeId, TraitLabel } from '../Identifiers';
import { Payload } from '../persisted-types';
import { TestTree } from './utilities/TestNode';
import { refreshTestTree } from './utilities/TestUtilities';

const mainTraitLabel = 'main' as TraitLabel;

function makeForestNodeWithChildren(testTree: TestTree, id: NodeId, ...children: NodeId[]): ForestNode {
	return {
		...testTree.buildLeaf(id),
		traits: new Map(children.length > 0 ? [[mainTraitLabel, [...children]]] : []),
	};
}

describe('Forest', () => {
	let parentId: NodeId;
	let childId: NodeId;
	let secondChildId: NodeId;
	let thirdChildId: NodeId;

	let childNode: ForestNode;
	let parentNode: ForestNode;
	let emptyForest: Forest;
	let oneNodeForest: Forest;
	let parentForest: Forest;
	let grandparentForest: Forest;
	let threeLeafForest: Forest;

	const testTree = refreshTestTree(undefined, (t) => {
		parentId = t.generateNodeId();
		childId = t.generateNodeId();
		secondChildId = t.generateNodeId();
		thirdChildId = t.generateNodeId();

		childNode = makeForestNodeWithChildren(t, childId);
		parentNode = makeForestNodeWithChildren(t, parentId);
		emptyForest = Forest.create(true);
		oneNodeForest = emptyForest.add([parentNode]);
		parentForest = oneNodeForest.add([childNode]).attachRangeOfChildren(parentId, mainTraitLabel, 0, [childId]);
		grandparentForest = parentForest
			.add([makeForestNodeWithChildren(t, secondChildId)])
			.attachRangeOfChildren(childId, mainTraitLabel, 0, [secondChildId]);

		threeLeafForest = parentForest
			.add([makeForestNodeWithChildren(t, secondChildId), makeForestNodeWithChildren(t, thirdChildId)])
			.attachRangeOfChildren(parentId, mainTraitLabel, 1, [secondChildId, thirdChildId]);
	});

	it('test forests are consistent', () => {
		emptyForest.assertConsistent();
		parentForest.assertConsistent();
		expect(emptyForest.size).equals(0);
		expect(parentForest.size).equals(2);
	});

	it('fails on multiparenting', () => {
		expect(() => oneNodeForest.add([makeForestNodeWithChildren(testTree, parentId, childId, childId)])).to.throw();
	});

	it('cannot add a node with a duplicate ID', () => {
		expect(() => oneNodeForest.add([makeForestNodeWithChildren(testTree, parentId)])).to.throw();
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
			const node = makeForestNodeWithChildren(testTree, testTree.generateNodeId());
			children.push(node);
			forestA = forestA.add([node]);
		}
		const forestB = emptyForest.add(children);
		forestA.assertConsistent();
		forestB.assertConsistent();
		expect(forestA.size).to.equal(10);
		expect(forestA.equals(forestB)).to.be.true;
	});

	// Test that Forest.add() adds descendants and ancestors correctly regardless of the order in which they are supplied
	it('can add nodes in any order', () => {
		const childId = testTree.generateNodeId();
		const parentId = testTree.generateNodeId();
		const child = makeForestNodeWithChildren(testTree, childId);
		const parent = makeForestNodeWithChildren(testTree, parentId, childId);
		const grandparent = makeForestNodeWithChildren(testTree, testTree.generateNodeId(), parentId);
		const forestA = emptyForest.add([child, parent, grandparent]);
		const forestB = emptyForest.add([grandparent, parent, child]);
		forestA.assertConsistent();
		forestB.assertConsistent();
		expect(forestA.size).to.equal(3);
		expect(forestA.equals(forestB)).to.be.true;
	});

	it('can replace payloads', () => {
		expectSuccessfulReplace(oneNodeForest, parentId, 0); // Set a payload when there was none
		expectSuccessfulReplace(oneNodeForest, parentId, 1); // Change a payload
	});

	it('can correctly attach a range to an empty trait on a root', () => {
		const moreChildrenForest = oneNodeForest.add([
			makeForestNodeWithChildren(testTree, childId),
			makeForestNodeWithChildren(testTree, secondChildId),
		]);

		expectSuccessfulAttach(moreChildrenForest, parentId, mainTraitLabel, 0, [childId, secondChildId]);
	});

	it('can correctly attach ranges to a populated trait on a root', () => {
		const twoLeafForest = parentForest.add([
			makeForestNodeWithChildren(testTree, secondChildId),
			makeForestNodeWithChildren(testTree, thirdChildId),
		]);

		expectSuccessfulAttach(twoLeafForest, parentId, mainTraitLabel, 1, [secondChildId]);
		expectSuccessfulAttach(twoLeafForest, parentId, mainTraitLabel, 1, [thirdChildId]);
	});

	it('can correctly attach ranges under a leaf', () => {
		const threeNodeForest = parentForest.add([makeForestNodeWithChildren(testTree, secondChildId)]);
		expectSuccessfulAttach(threeNodeForest, childId, mainTraitLabel, 0, [secondChildId]);
	});

	it('only accepts valid indices for attaches', () => {
		const twoNodeForest = oneNodeForest.add([makeForestNodeWithChildren(testTree, childId)]);
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

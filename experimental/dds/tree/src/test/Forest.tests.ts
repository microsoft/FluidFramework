/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { compareArrays } from '../Common';
import { createForest } from '../Forest';
import { compareFiniteNumbers } from '../SnapshotUtilities';

describe('Forest', () => {
	const emptyForest = createForest<number, number[], number>(
		(a) => a.map((child, index) => [child, index]),
		compareFiniteNumbers,
		true /* expensive validation */
	);
	const root = 1;
	const leaf = 0;
	const oneNode = emptyForest.add([[leaf, []]]);
	const twoNode = oneNode.add([[root, [leaf]]]);

	it('test forests are consistent', () => {
		emptyForest.assertConsistent();
		twoNode.assertConsistent();
		expect(emptyForest.size).equals(0);
		expect(twoNode.size).equals(2);
	});

	it('fails on multiparenting', () => {
		expect(() => oneNode.add([[root, [leaf, leaf]]])).to.throw();
	});

	it('cannot add a node with a duplicate ID', () => {
		expect(() => oneNode.add([[leaf, []]])).to.throw();
	});

	it('can get nodes in the forest', () => {
		expect(twoNode.get(leaf)).deep.equals([]);
		expect(twoNode.get(root)).deep.equals([leaf]);
	});

	it('can get parents in the forest', () => {
		expect(twoNode.tryGetParent(root)).to.be.undefined;
		expect(twoNode.tryGetParent(leaf)?.parentNode).to.equal(root);
	});

	it('can add nodes', () => {
		let forestA = emptyForest;
		const children: [number, number[]][] = [];
		const numToAdd = 10;
		for (let i = 0; i < numToAdd; i++) {
			const node: number[] = [];
			children.push([i, node]);
			forestA = forestA.add([[i, node]]);
		}
		const forestB = emptyForest.add(children);
		forestA.assertConsistent();
		forestB.assertConsistent();
		expect(forestA.size).to.equal(10);
		expect(forestA.equals(forestB)).to.be.true;
	});

	[root, leaf].forEach((id) => {
		const isLeaf = id === leaf;
		it(`can replace a${isLeaf ? ' leaf' : 'n interior'} node`, () => {
			const nodeReplace: number[] = isLeaf ? [] : [leaf];
			const replaced = twoNode.replace(id, nodeReplace);
			expect(replaced.size).to.equal(twoNode.size);
			expect(replaced.get(id) === nodeReplace).to.be.true;
		});
	});

	it('can add children during a replace operation', () => {
		const newNode = 3;
		let replaced = twoNode.add([[3, []]]);
		replaced = replaced.replace(leaf, [newNode], [[newNode, leaf]]);
		expect(replaced.size).to.equal(3);
		expect(replaced.getParent(newNode).parentNode).to.equal(leaf);
	});

	it('can remove children during a replace operation', () => {
		const replaced = twoNode.replace(root, [], undefined, [leaf]);
		expect(replaced.size).to.equal(2);
		expect(replaced.tryGetParent(leaf)).to.be.undefined;
	});

	it('fails when a replacement changes children without specifying adds or removes', () => {
		expect(() => twoNode.replace(root, [])).throws();
	});

	it('cannot delete parented nodes', () => {
		expect(() => twoNode.delete([leaf], false)).throws(); // deleting a parented node should assert.
	});

	it('can delete a root', () => {
		const deleteRoot = twoNode.delete([root], false);
		deleteRoot.assertConsistent();
		expect(deleteRoot.size).to.equal(1);
		expect(deleteRoot.tryGet(leaf)).to.not.be.undefined;
	});

	it('can deletes a subtree', () => {
		const deleteLeaf = twoNode.delete([root], true);
		deleteLeaf.assertConsistent();
		expect(deleteLeaf.size).to.equal(0);
	});

	it('calculates deltas correctly', () => {
		const add = emptyForest.delta(oneNode);
		const remove = oneNode.delta(emptyForest);
		const same = twoNode.delta(twoNode);
		const modified = twoNode.replace(leaf, []);
		const modify = twoNode.delta(modified);
		const sameDeep = twoNode.delta(modified, compareArrays);

		expect(remove).deep.equals({ changed: [], added: [], removed: [leaf] });
		expect(add).deep.equals({ changed: [], added: [leaf], removed: [] });
		expect(same).deep.equals({ changed: [], added: [], removed: [] });
		expect(modify).deep.equals({ changed: [leaf], added: [], removed: [] });
		expect(sameDeep).deep.equals({ changed: [], added: [], removed: [] });
	});

	it('calculates equality correctly', () => {
		const modified = twoNode.replace(leaf, []);

		expect(oneNode.equals(emptyForest)).false;
		expect(emptyForest.equals(oneNode)).false;
		expect(twoNode.equals(twoNode)).true;
		expect(twoNode.equals(modified)).false;
		expect(twoNode.equals(modified, compareArrays)).true;
	});
});

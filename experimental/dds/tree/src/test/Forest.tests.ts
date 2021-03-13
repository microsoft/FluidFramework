/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { compareArrays, fail } from '../Common';
import { createForest } from '../Forest';

describe('Forest', () => {
	const emptyForest = createForest<number, number[], number>((a) => a.map((child, index) => [child, index]));
	const root = 1;
	const leaf = 0;
	const oneNode = emptyForest.add(leaf, []);
	const twoNode = oneNode.add(root, [leaf]);

	it('test forests are consistent', () => {
		emptyForest.assertConsistent();
		twoNode.assertConsistent();
		expect(emptyForest.size).equals(0);
		expect(twoNode.size).equals(2);
	});

	it('cannot delete parented node', () => {
		expect(() => twoNode.delete(leaf, false)).throws(); // deleting a parented node should assert.
	});

	it('deletes root', () => {
		const deleteRoot = twoNode.delete(root, false);
		deleteRoot.assertConsistent();
		expect([...deleteRoot]).deep.equals([[leaf, []]]); // Only empty leaf node
	});

	it('deletes subtree', () => {
		const deleteLeaf = twoNode.delete(root, true);
		deleteLeaf.assertConsistent();
		expect([...deleteLeaf]).deep.equals([]); // Empty forest
	});

	it('deltas are correct', () => {
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

	it('equality is correct', () => {
		const modified = twoNode.replace(leaf, []);

		expect(oneNode.equals(emptyForest)).false;
		expect(emptyForest.equals(oneNode)).false;
		expect(twoNode.equals(twoNode)).true;
		expect(twoNode.equals(modified)).false;
		expect(twoNode.equals(modified, compareArrays)).true;
	});

	it('merge with empty works', () => {
		const merge1 = emptyForest.mergeWith(twoNode, () => fail());
		const merge2 = twoNode.mergeWith(emptyForest, () => fail());
		const delta1 = merge1.delta(twoNode);
		const delta2 = merge2.delta(twoNode);
		expect(delta1).deep.equals({ changed: [], added: [], removed: [] });
		expect(delta2).deep.equals({ changed: [], added: [], removed: [] });
	});

	it('merge with self', () => {
		const merge = twoNode.mergeWith(twoNode, (a) => a);
		expect(merge.delta(twoNode)).deep.equals({ changed: [], added: [], removed: [] });
	});
});

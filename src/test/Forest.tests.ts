/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { createForest } from '../Forest';

describe('Forest', () => {
	const emptyForest = createForest<number, number[], number>((a) => a.map((child, index) => [child, index]));
	const root = 1;
	const leaf = 0;
	const twoNode = emptyForest.add(leaf, []).add(root, [leaf]);

	it('test forests are consistent', () => {
		emptyForest.assertConsistent();
		twoNode.assertConsistent();
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
});

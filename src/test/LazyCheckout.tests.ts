/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { Delete, StableRange } from '../default-edits';
import { LazyCheckout } from '../LazyCheckout';
import { checkoutTests } from './Checkout.tests';
import { setUpTestSharedTree, setUpTestTree } from './utilities/TestUtilities';

checkoutTests(
	'LazyCheckout',
	async (tree) => Promise.resolve(new LazyCheckout(tree)),
	() => {
		it('updates lazily', async () => {
			const { tree } = setUpTestSharedTree();
			const testTree = setUpTestTree(tree);
			const checkout = new LazyCheckout(tree);
			expect(tree.currentView.equals(checkout.currentView)).to.be.true;
			tree.applyEdit(Delete.create(StableRange.only(testTree.left)));
			expect(tree.currentView.equals(checkout.currentView)).to.be.false;
			await checkout.waitForPendingUpdates();
			expect(tree.currentView.equals(checkout.currentView)).to.be.true;
		});
	}
);

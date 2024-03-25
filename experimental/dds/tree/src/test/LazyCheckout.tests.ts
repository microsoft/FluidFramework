/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { Change, StableRange } from '../ChangeTypes.js';
import { LazyCheckout } from '../LazyCheckout.js';
import { checkoutTests } from './Checkout.tests.js';
import { setUpTestSharedTree, setUpTestTree } from './utilities/TestUtilities.js';

checkoutTests(
	'LazyCheckout',
	async (tree) => Promise.resolve(new LazyCheckout(tree)),
	() => {
		it('updates lazily', async () => {
			const { tree } = setUpTestSharedTree();
			const testTree = setUpTestTree(tree);
			const checkout = new LazyCheckout(tree);
			expect(tree.currentView.equals(checkout.currentView)).to.be.true;
			tree.applyEdit(Change.delete(StableRange.only(testTree.left)));
			expect(tree.currentView.equals(checkout.currentView)).to.be.false;
			await checkout.waitForPendingUpdates();
			expect(tree.currentView.equals(checkout.currentView)).to.be.true;
		});
	}
);

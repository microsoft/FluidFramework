/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { Change, StableRange } from '../ChangeTypes.js';
import { EagerCheckout } from '../EagerCheckout.js';
import { checkoutTests } from './Checkout.tests.js';
import { setUpTestSharedTree, setUpTestTree } from './utilities/TestUtilities.js';

checkoutTests(
	'EagerCheckout',
	async (tree) => Promise.resolve(new EagerCheckout(tree)),
	() => {
		it('updates eagerly', () => {
			const { tree } = setUpTestSharedTree();
			const testTree = setUpTestTree(tree);
			const checkout = new EagerCheckout(tree);

			expect(tree.currentView.equals(checkout.currentView)).to.be.true;
			tree.applyEdit(Change.delete(StableRange.only(testTree.left)));
			expect(tree.currentView.equals(checkout.currentView)).to.be.true;
		});
	}
);

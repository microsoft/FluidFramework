/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { Delete, StableRange } from '../default-edits';
import { EagerCheckout } from '../EagerCheckout';
import { checkoutTests } from './Checkout.tests';
import { left, setUpTestSharedTree, simpleTestTree } from './utilities/TestUtilities';

checkoutTests(
	'EagerCheckout',
	async (tree) => Promise.resolve(new EagerCheckout(tree)),
	() => {
		it('updates eagerly', () => {
			const { tree } = setUpTestSharedTree({ initialTree: simpleTestTree });
			const checkout = new EagerCheckout(tree);
			expect(tree.currentView.equals(checkout.currentView)).to.be.true;
			tree.applyEdit(Delete.create(StableRange.only(left)));
			expect(tree.currentView.equals(checkout.currentView)).to.be.true;
		});
	}
);

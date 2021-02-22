/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import {
	setTrait,
	Delete,
	EditResult,
	Insert,
	Move,
	StableRange,
	StablePlace,
	Side,
	EditValidationResult,
	SharedTree,
	SharedTreeEvent,
	Checkout,
	CheckoutEvent,
} from '../index';
import {
	left,
	leftTraitLocation,
	makeEmptyNode,
	right,
	rightTraitLocation,
	setUpTestSharedTree,
	SharedTreeTestingOptions,
	simpleTestTree,
} from './utilities/TestUtilities';

/**
 * Checkout test suite
 */
export function checkoutTests(
	suiteName: string,
	checkoutFactory: (tree: SharedTree) => Promise<Checkout>
): Mocha.Suite {
	async function setUpTestCheckout(
		options: SharedTreeTestingOptions = { localMode: true }
	): Promise<{ checkout: Checkout; tree: SharedTree }> {
		const { tree } = setUpTestSharedTree(options);
		return { checkout: await checkoutFactory(tree), tree };
	}

	/**
	 * Counts the number of times invalidation occurs while performing `action`.
	 * @param action Action to perform
	 * @param options Options object used to construct the initial SharedTree
	 */
	async function countInvalidations(
		action: (checkout: Checkout) => void,
		options: SharedTreeTestingOptions = { localMode: true }
	): Promise<number> {
		const { checkout } = await setUpTestCheckout(options);

		let invalidations = 0;
		checkout.on(CheckoutEvent.ViewChange, () => {
			invalidations++;
		});

		action(checkout);
		return invalidations;
	}

	return describe(suiteName, () => {
		it('can only have one edit open at a time', async () => {
			const { checkout } = await setUpTestCheckout();
			checkout.openEdit();
			expect(() => checkout.openEdit()).throws();
		});

		it('can only close an edit if one is open', async () => {
			const { checkout } = await setUpTestCheckout();
			expect(() => checkout.closeEdit()).throws();
		});

		it('can only apply changes if an edit is open', async () => {
			const { checkout } = await setUpTestCheckout();
			expect(() => checkout.applyChanges(Delete.create(StableRange.only(left)))).throws();
		});

		it('cannot abort an edit if no edit is open', async () => {
			const { checkout } = await setUpTestCheckout();
			expect(() => checkout.abortEdit()).throws();
		});

		it('can abort valid edits', async () => {
			const { checkout } = await setUpTestCheckout({ initialTree: simpleTestTree });

			checkout.openEdit();
			// Is still valid after a valid edit
			checkout.applyChanges(Delete.create(StableRange.only(left)));
			expect(checkout.getEditStatus()).equals(EditResult.Applied);
			checkout.abortEdit();

			// The left node should still be there
			expect(checkout.currentView.getSnapshotNode(left.identifier).identifier).not.undefined;
		});

		it('can abort invalid edits', async () => {
			const { checkout } = await setUpTestCheckout({ initialTree: simpleTestTree });

			checkout.openEdit();
			// Starts as valid
			expect(checkout.getEditStatus()).equals(EditResult.Applied);

			// Is invalid after an invalid edit
			expect(() => checkout.applyChanges(...Insert.create([left], StablePlace.after(left)))).throws(
				'Locally constructed edits must be well-formed and valid.'
			);
			expect(checkout.getEditStatus()).equals(EditResult.Invalid);
			checkout.abortEdit();

			// Next edit is unaffected
			checkout.openEdit();
			expect(checkout.getEditStatus()).equals(EditResult.Applied);
			checkout.closeEdit();
		});

		it('can abort malformed edits', async () => {
			const { checkout } = await setUpTestCheckout({ initialTree: simpleTestTree });

			checkout.openEdit();
			// Starts as valid
			expect(checkout.getEditStatus()).equals(EditResult.Applied);

			// Is malformed after a malformed edit
			const malformedMove = Move.create(
				{
					start: { side: Side.Before },
					end: { side: Side.After },
				},
				{ side: Side.After }
			);
			expect(() => checkout.applyChanges(...malformedMove)).throws(
				'Locally constructed edits must be well-formed and valid.'
			);
			expect(checkout.getEditStatus()).equals(EditResult.Malformed);

			// Is still malformed after a subsequent valid edit
			expect(() => checkout.applyChanges(Delete.create(StableRange.only(left)))).throws(
				'Cannot apply change to an edit unless all previous changes have applied'
			);
			expect(checkout.getEditStatus()).equals(EditResult.Malformed);

			checkout.abortEdit();

			// Next edit is unaffected
			checkout.openEdit();
			expect(checkout.getEditStatus()).equals(EditResult.Applied);
			checkout.closeEdit();
		});

		it('cannot get the edit status if no edit is open', async () => {
			const { checkout } = await setUpTestCheckout();
			expect(() => checkout.getEditStatus()).throws();
		});

		it('Surfaces error events to SharedTree', async () => {
			const { checkout, tree } = await setUpTestCheckout();
			const message = 'Simulated unexpected error in ViewChange event handler';
			checkout.on(CheckoutEvent.ViewChange, () => {
				throw Error(message);
			});
			let treeErrorHandlerWasCalled = false;
			tree.on('error', (error) => {
				treeErrorHandlerWasCalled = true;
				expect(error).to.have.property('message').that.equals(message);
			});

			// This could alternatively actually cause a ViewChange via application of an edit.
			checkout.emit(CheckoutEvent.ViewChange, { changed: [], added: [], removed: [] });
			expect(treeErrorHandlerWasCalled).equals(true);
		});

		it('exposes the current edit status in the face of valid edits', async () => {
			const { checkout } = await setUpTestCheckout({ initialTree: simpleTestTree });

			checkout.openEdit();
			// Starts as valid
			expect(checkout.getEditStatus()).equals(EditResult.Applied);

			// Is still valid after a valid edit
			checkout.applyChanges(Delete.create(StableRange.only(left)));
			expect(checkout.getEditStatus()).equals(EditResult.Applied);

			checkout.closeEdit();
		});

		it('exposes the current edit status in the face of invalid edits', async () => {
			const { checkout } = await setUpTestCheckout({ initialTree: simpleTestTree });

			checkout.openEdit();
			// Starts as valid
			expect(checkout.getEditStatus()).equals(EditResult.Applied);

			// Is invalid after an invalid edit
			expect(() => checkout.applyChanges(...Insert.create([left], StablePlace.after(left)))).throws(
				'Locally constructed edits must be well-formed and valid.'
			);
			expect(checkout.getEditStatus()).equals(EditResult.Invalid);

			// Is still invalid after a subsequent valid edit
			expect(() => checkout.applyChanges(Delete.create(StableRange.only(left)))).throws(
				'Cannot apply change to an edit unless all previous changes have applied'
			);
			expect(checkout.getEditStatus()).equals(EditResult.Invalid);

			expect(() => checkout.closeEdit()).throws('Locally constructed edits must be well-formed and valid');

			// Next edit is unaffected
			checkout.openEdit();
			expect(checkout.getEditStatus()).equals(EditResult.Applied);
			checkout.closeEdit();
		});

		it('exposes the current edit status in the face of malformed edits', async () => {
			const { checkout } = await setUpTestCheckout({ initialTree: simpleTestTree });

			checkout.openEdit();
			// Starts as valid
			expect(checkout.getEditStatus()).equals(EditResult.Applied);

			// Is malformed after a malformed edit
			const malformedMove = Move.create(
				{
					start: { side: Side.Before },
					end: { side: Side.After },
				},
				{ side: Side.After }
			);
			expect(() => checkout.applyChanges(...malformedMove)).throws(
				'Locally constructed edits must be well-formed and valid.'
			);
			expect(checkout.getEditStatus()).equals(EditResult.Malformed);

			// Is still malformed after a subsequent valid edit
			expect(() => checkout.applyChanges(Delete.create(StableRange.only(left)))).throws(
				'Cannot apply change to an edit unless all previous changes have applied'
			);
			expect(checkout.getEditStatus()).equals(EditResult.Malformed);

			expect(() => checkout.closeEdit()).throws('Locally constructed edits must be well-formed and valid');

			// Next edit is unaffected
			checkout.openEdit();
			expect(checkout.getEditStatus()).equals(EditResult.Applied);
			checkout.closeEdit();
		});

		it('does not invalidate in response to an empty edit', async () => {
			const invalidations = await countInvalidations((checkout) => {
				checkout.openEdit();
				checkout.closeEdit();
			});
			expect(invalidations).equals(0);
		});

		it('records empty edits', async () => {
			const { checkout, tree } = await setUpTestCheckout();
			checkout.openEdit();
			const editId = checkout.closeEdit();
			await checkout.waitForPendingUpdates();
			expect(tree.edits.length).equals(1);
			expect(tree.edits.tryGetEdit(editId)).is.not.undefined;
		});

		it('will emit invalidation messages in response to changes', async () => {
			const invalidations = await countInvalidations(
				(checkout) => {
					checkout.applyEdit(Delete.create(StableRange.only(left)));
				},
				{ initialTree: simpleTestTree }
			);
			expect(invalidations).equals(1);
		});

		it('emits a change event for each batch of changes in a local edit', async () => {
			const { checkout } = await setUpTestCheckout({ initialTree: simpleTestTree });
			let changeCount = 0;
			checkout.on(CheckoutEvent.ViewChange, () => {
				const leftTrait = checkout.currentView.getTrait(leftTraitLocation);
				const rightTrait = checkout.currentView.getTrait(rightTraitLocation);

				if (changeCount === 0) {
					expect(leftTrait.length).to.equal(0); // "left" child is deleted...
					expect(rightTrait.length).to.equal(1); // ...but "right" child is not
				} else if (changeCount === 1) {
					expect(leftTrait.length).to.equal(0); // "left" child is deleted...
					expect(rightTrait.length).to.equal(0); // ...and so is "right" child
				}

				changeCount += 1;
			});

			checkout.openEdit();
			checkout.applyChanges(Delete.create(StableRange.only(left)));
			checkout.applyChanges(Delete.create(StableRange.only(right)));
			checkout.closeEdit();
			await checkout.waitForPendingUpdates();
			expect(changeCount).equals(2);
		});

		const treeOptions = { initialTree: simpleTestTree, localMode: false };
		const secondTreeOptions = {
			id: 'secondTestSharedTree',
			localMode: false,
		};

		it('connected state with a remote SharedTree equates correctly during edits', async () => {
			// Invalid edits are allowed here because this test creates edits concurrently in two trees,
			// which after syncing, end up with one being invalid.
			const { tree, containerRuntimeFactory } = setUpTestSharedTree({ ...treeOptions });
			const { tree: secondTree } = setUpTestSharedTree({
				containerRuntimeFactory,
				...secondTreeOptions,
			});

			containerRuntimeFactory.processAllMessages();
			const checkout = await checkoutFactory(tree);
			const secondCheckout = await checkoutFactory(tree);

			checkout.openEdit();
			expect(checkout.currentView.equals(secondCheckout.currentView)).to.be.true;
			expect(tree.equals(secondTree)).to.be.true;
			secondCheckout.openEdit();
			expect(checkout.currentView.equals(secondCheckout.currentView)).to.be.true;
			expect(tree.equals(secondTree)).to.be.true;
			checkout.applyChanges(Delete.create(StableRange.only(left)));
			expect(checkout.currentView.equals(secondCheckout.currentView)).to.be.false;
			secondCheckout.applyChanges(Delete.create(StableRange.only(left)));
			expect(checkout.currentView.equals(secondCheckout.currentView)).to.be.true;
			expect(tree.equals(secondTree)).to.be.true;
			checkout.closeEdit();
			secondCheckout.closeEdit();
			await checkout.waitForPendingUpdates();
			await secondCheckout.waitForPendingUpdates();
			containerRuntimeFactory.processAllMessages();
			expect(tree.equals(secondTree)).to.be.true;
			await checkout.waitForPendingUpdates();
			await secondCheckout.waitForPendingUpdates();
			expect(checkout.currentView.equals(secondCheckout.currentView)).to.be.true;
		});

		it('can successfully rebase an ongoing local edit', async () => {
			const { tree, containerRuntimeFactory } = setUpTestSharedTree(treeOptions);
			const { tree: secondTree } = setUpTestSharedTree({ containerRuntimeFactory, ...secondTreeOptions });

			// Sync initial tree
			containerRuntimeFactory.processAllMessages();

			const checkout = await checkoutFactory(tree);
			const secondCheckout = await checkoutFactory(secondTree);

			const newLeftNode = makeEmptyNode();
			checkout.openEdit();
			checkout.applyChanges(...setTrait(leftTraitLocation, [newLeftNode]));

			// Concurrently, the second client deletes the right node. This will not conflict with the operation performed
			// on the left trait on the first client.
			secondCheckout.applyEdit(Delete.create(StableRange.only(right)));
			await secondCheckout.waitForPendingUpdates();

			// Deliver the remote change. Since there will not be any conflicts, the result should merge locally and both trait
			// modifications should be reflected in the current view.
			containerRuntimeFactory.processAllMessages();

			await checkout.waitForPendingUpdates();
			await secondCheckout.waitForPendingUpdates();

			let leftTrait = checkout.currentView.getTrait(leftTraitLocation);
			let rightTrait = checkout.currentView.getTrait(rightTraitLocation);
			expect(leftTrait).deep.equals([newLeftNode.identifier]);
			// The remote deletion of the right node, while delivered, will not be reflected in the view yet.
			expect(rightTrait).deep.equals([right.identifier]);

			const secondLeftTrait = secondCheckout.currentView.getTrait(leftTraitLocation);
			const secondRightTrait = secondCheckout.currentView.getTrait(rightTraitLocation);
			expect(secondLeftTrait).deep.equals([left.identifier]);
			expect(secondRightTrait.length).equals(0);

			// Merge in the latest changes.
			const rebaseResult = checkout.rebaseCurrentEdit();
			expect(rebaseResult).equals(EditValidationResult.Valid);
			leftTrait = checkout.currentView.getTrait(leftTraitLocation);
			rightTrait = checkout.currentView.getTrait(rightTraitLocation);
			expect(leftTrait).deep.equals([newLeftNode.identifier]);
			expect(rightTrait.length).equals(0);

			checkout.closeEdit();
			await checkout.waitForPendingUpdates();
			containerRuntimeFactory.processAllMessages();

			expect(tree.equals(secondTree)).to.be.true;
		});

		it('can handle a failed rebase of an ongoing local edit', async () => {
			const { tree, containerRuntimeFactory } = setUpTestSharedTree(treeOptions);
			const { tree: secondTree } = setUpTestSharedTree({ containerRuntimeFactory, ...secondTreeOptions });

			// Sync initial tree
			containerRuntimeFactory.processAllMessages();

			const checkout = await checkoutFactory(tree);
			const secondCheckout = await checkoutFactory(secondTree);

			checkout.openEdit();
			// Move the left node to after the right node
			checkout.applyChanges(...Move.create(StableRange.only(left), StablePlace.after(right)));

			// Concurrently, the second client deletes the right node. This will conflict with the move operation by the first client.
			secondCheckout.applyEdit(Delete.create(StableRange.only(right)));
			await secondCheckout.waitForPendingUpdates();

			containerRuntimeFactory.processAllMessages();
			await checkout.waitForPendingUpdates();
			await secondCheckout.waitForPendingUpdates();

			// Before rebasing, the first client should still see the right node and will have moved the left node after it.
			const leftTrait = checkout.currentView.getTrait(leftTraitLocation);
			const rightTrait = checkout.currentView.getTrait(rightTraitLocation);
			expect(leftTrait).deep.equals([]);
			expect(rightTrait).deep.equals([right.identifier, left.identifier]);

			// Merge in the latest changes.
			const rebaseResult = checkout.rebaseCurrentEdit();
			expect(rebaseResult).equals(EditValidationResult.Invalid);
			expect(checkout.currentView.equals(secondCheckout.currentView)).to.be.true;
		});

		it('can dispose and remove listeners', async () => {
			// Arrange
			const { checkout } = await setUpTestCheckout();

			// Assert
			expect(checkout.tree.listenerCount(SharedTreeEvent.EditCommitted)).to.equal(1);

			// Act
			checkout.dispose();

			// Assert
			expect(checkout.tree.listenerCount(SharedTreeEvent.EditCommitted)).to.equal(0);
		});
	});
}

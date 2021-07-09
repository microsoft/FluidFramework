/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import {
	setTrait,
	Delete,
	EditStatus,
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
	Change,
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
	checkoutFactory: (tree: SharedTree) => Promise<Checkout<Change>>
): Mocha.Suite {
	async function setUpTestCheckout(
		options: SharedTreeTestingOptions = { localMode: true, noFailOnError: true }
	): Promise<{ checkout: Checkout<Change>; tree: SharedTree }> {
		const { tree } = setUpTestSharedTree(options);
		return { checkout: await checkoutFactory(tree), tree };
	}

	/**
	 * Counts the number of times ViewChange occurs while performing `action`.
	 * Checks arguments to ViewChange are correct as well.
	 * @param action Action to perform
	 * @param options Options object used to construct the initial SharedTree
	 */
	async function countViewChange(
		action: (checkout: Checkout<Change>, data: { changeCount: number }) => void | Promise<void>,
		options: SharedTreeTestingOptions = { localMode: true }
	): Promise<number> {
		const { checkout } = await setUpTestCheckout(options);
		let lastView = checkout.currentView;
		const data = { changeCount: 0 };
		checkout.on(CheckoutEvent.ViewChange, (before, after) => {
			expect(after).equals(checkout.currentView);
			expect(before).equals(lastView);
			lastView = after;
			data.changeCount++;
		});
		// Prevent errors from errors (like failed expects) from being hidden.
		const errors: Error[] = [];
		checkout.on('error', (error) => {
			errors.push(error);
		});

		await action(checkout, data);
		expect(errors).deep.equal([]);
		return data.changeCount;
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
			expect(checkout.getEditStatus()).equals(EditStatus.Applied);
			checkout.abortEdit();

			// The left node should still be there
			expect(checkout.currentView.getSnapshotNode(left.identifier).identifier).not.undefined;
		});

		it('can abort invalid edits', async () => {
			const { checkout } = await setUpTestCheckout({ initialTree: simpleTestTree });

			checkout.openEdit();
			// Starts as valid
			expect(checkout.getEditStatus()).equals(EditStatus.Applied);

			// Is invalid after an invalid edit
			expect(() => checkout.applyChanges(...Insert.create([left], StablePlace.after(left)))).throws(
				'Locally constructed edits must be well-formed and valid.'
			);
			expect(checkout.getEditStatus()).equals(EditStatus.Invalid);
			checkout.abortEdit();

			// Next edit is unaffected
			checkout.openEdit();
			expect(checkout.getEditStatus()).equals(EditStatus.Applied);
			checkout.closeEdit();
		});

		it('can abort malformed edits', async () => {
			const { checkout } = await setUpTestCheckout({ initialTree: simpleTestTree });

			checkout.openEdit();
			// Starts as valid
			expect(checkout.getEditStatus()).equals(EditStatus.Applied);

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
			expect(checkout.getEditStatus()).equals(EditStatus.Malformed);

			// Is still malformed after a subsequent valid edit
			expect(() => checkout.applyChanges(Delete.create(StableRange.only(left)))).throws(
				'Cannot apply change to an edit unless all previous changes have applied'
			);
			expect(checkout.getEditStatus()).equals(EditStatus.Malformed);

			checkout.abortEdit();

			// Next edit is unaffected
			checkout.openEdit();
			expect(checkout.getEditStatus()).equals(EditStatus.Applied);
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
			checkout.emit(CheckoutEvent.ViewChange, checkout.currentView, checkout.currentView);
			expect(treeErrorHandlerWasCalled).equals(true);
		});

		it('exposes the current edit status in the face of valid edits', async () => {
			const { checkout } = await setUpTestCheckout({ initialTree: simpleTestTree });

			checkout.openEdit();
			// Starts as valid
			expect(checkout.getEditStatus()).equals(EditStatus.Applied);

			// Is still valid after a valid edit
			checkout.applyChanges(Delete.create(StableRange.only(left)));
			expect(checkout.getEditStatus()).equals(EditStatus.Applied);

			checkout.closeEdit();
		});

		it('exposes the current edit status in the face of invalid edits', async () => {
			const { checkout } = await setUpTestCheckout({ initialTree: simpleTestTree });

			checkout.openEdit();
			// Starts as valid
			expect(checkout.getEditStatus()).equals(EditStatus.Applied);

			// Is invalid after an invalid edit
			expect(() => checkout.applyChanges(...Insert.create([left], StablePlace.after(left)))).throws(
				'Locally constructed edits must be well-formed and valid.'
			);
			expect(checkout.getEditStatus()).equals(EditStatus.Invalid);

			// Is still invalid after a subsequent valid edit
			expect(() => checkout.applyChanges(Delete.create(StableRange.only(left)))).throws(
				'Cannot apply change to an edit unless all previous changes have applied'
			);
			expect(checkout.getEditStatus()).equals(EditStatus.Invalid);

			expect(() => checkout.closeEdit()).throws('Locally constructed edits must be well-formed and valid');

			// Next edit is unaffected
			checkout.openEdit();
			expect(checkout.getEditStatus()).equals(EditStatus.Applied);
			checkout.closeEdit();
		});

		it('exposes the current edit status in the face of malformed edits', async () => {
			const { checkout } = await setUpTestCheckout({ initialTree: simpleTestTree });

			checkout.openEdit();
			// Starts as valid
			expect(checkout.getEditStatus()).equals(EditStatus.Applied);

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
			expect(checkout.getEditStatus()).equals(EditStatus.Malformed);

			// Is still malformed after a subsequent valid edit
			expect(() => checkout.applyChanges(Delete.create(StableRange.only(left)))).throws(
				'Cannot apply change to an edit unless all previous changes have applied'
			);
			expect(checkout.getEditStatus()).equals(EditStatus.Malformed);

			expect(() => checkout.closeEdit()).throws('Locally constructed edits must be well-formed and valid');

			// Next edit is unaffected
			checkout.openEdit();
			expect(checkout.getEditStatus()).equals(EditStatus.Applied);
			checkout.closeEdit();
		});

		it('does not invalidate in response to an empty edit', async () => {
			const invalidations = await countViewChange((checkout) => {
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
			const invalidations = await countViewChange(
				(checkout) => {
					checkout.applyEdit(Delete.create(StableRange.only(left)));
				},
				{ initialTree: simpleTestTree }
			);
			expect(invalidations).equals(1);
		});

		it('will emit invalidation messages in response to payload change', async () => {
			const invalidations = await countViewChange(
				(checkout) => {
					checkout.applyEdit(Change.setPayload(left.identifier, 5));
				},
				{ initialTree: simpleTestTree }
			);
			expect(invalidations).equals(1);
		});

		it('emits a change event for each batch of changes in a local edit', async () => {
			const changes = await countViewChange(
				async (checkout, data) => {
					checkout.on(CheckoutEvent.ViewChange, () => {
						const leftTrait = checkout.currentView.getTrait(leftTraitLocation);
						const rightTrait = checkout.currentView.getTrait(rightTraitLocation);

						if (data.changeCount === 1) {
							expect(leftTrait.length).to.equal(0); // "left" child is deleted...
							expect(rightTrait.length).to.equal(1); // ...but "right" child is not
						} else if (data.changeCount === 2) {
							expect(leftTrait.length).to.equal(0); // "left" child is deleted...
							expect(rightTrait.length).to.equal(0); // ...and so is "right" child
						}
					});

					checkout.openEdit();
					expect(data.changeCount).equals(0);
					checkout.applyChanges(Delete.create(StableRange.only(left)));
					expect(data.changeCount).equals(1);
					checkout.applyChanges(Delete.create(StableRange.only(right)));
					expect(data.changeCount).equals(2);
					checkout.closeEdit();
					await checkout.waitForPendingUpdates();
				},
				{ initialTree: simpleTestTree }
			);

			// Checkout's use of LogViewer.setKnownEditingResult should enable CachingLogViewer
			// to return the exact same SnapShot object, allowing checkout to so skip an extra change event from closeEdit.
			expect(changes).equals(2);
		});

		it('emits ViewChange events for edits directly on tree', async () => {
			const { checkout } = await setUpTestCheckout({ initialTree: simpleTestTree });
			let changeCount = 0;
			checkout.on(CheckoutEvent.ViewChange, () => {
				changeCount += 1;
			});
			expect(changeCount).equals(0);
			checkout.tree.applyEdit(Delete.create(StableRange.only(left)));
			// Wait for edit to be included in checkout.
			await checkout.waitForPendingUpdates();
			expect(changeCount).equals(1);
		});

		const treeOptions = { initialTree: simpleTestTree, localMode: false };
		const secondTreeOptions = {
			id: 'secondTestSharedTree',
			localMode: false,
			allowInvalid: true,
		};

		it('emits ViewChange events for remote edits', async () => {
			const { containerRuntimeFactory, tree } = setUpTestSharedTree({ ...treeOptions });

			const { tree: secondTree } = setUpTestSharedTree({
				containerRuntimeFactory,
				...secondTreeOptions,
			});

			containerRuntimeFactory.processAllMessages();
			const checkout = await checkoutFactory(tree);

			let changeCount = 0;
			checkout.on(CheckoutEvent.ViewChange, () => {
				changeCount += 1;
			});

			secondTree.applyEdit(Delete.create(StableRange.only(left)));
			expect(changeCount).equals(0);
			containerRuntimeFactory.processAllMessages();
			// Wait for edit to be included in checkout.
			await checkout.waitForPendingUpdates();
			expect(changeCount).equals(1);
		});

		it('connected state with a remote SharedTree equates correctly during edits', async () => {
			// Invalid edits are allowed here because this test creates edits concurrently in two trees,
			// which after syncing, end up with one being invalid.
			const { tree, containerRuntimeFactory } = setUpTestSharedTree({ ...treeOptions, allowInvalid: true });
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

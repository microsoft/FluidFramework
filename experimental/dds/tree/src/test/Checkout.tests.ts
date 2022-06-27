/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import {
	setTrait,
	EditStatus,
	StableRange,
	StablePlace,
	EditValidationResult,
	SharedTree,
	SharedTreeEvent,
	Checkout,
	CheckoutEvent,
	Change,
	Side,
	areRevisionViewsSemanticallyEqual,
} from '../index';
import { TestTree } from './utilities/TestNode';
import { setUpTestSharedTree, SharedTreeTestingOptions, setUpTestTree } from './utilities/TestUtilities';

/**
 * Checkout test suite
 */
export function checkoutTests(
	checkoutName: string,
	checkoutFactory: (tree: SharedTree) => Promise<Checkout>,
	additionalTests?: () => void
): void {
	async function setUpTestCheckout(
		options: SharedTreeTestingOptions = { localMode: true, noFailOnError: true }
	): Promise<{ checkout: Checkout; tree: SharedTree }> {
		const { tree } = setUpTestSharedTree(options);
		return { checkout: await checkoutFactory(tree), tree };
	}

	/**
	 * Counts the number of times ViewChange occurs while performing `action`.
	 * Checks arguments to ViewChange are correct as well.
	 * @param action - Action to perform
	 * @param options - Options object used to construct the initial SharedTree
	 */
	async function countViewChange(
		action: (checkout: Checkout, simpleTestTree: TestTree, data: { changeCount: number }) => void | Promise<void>,
		options: SharedTreeTestingOptions = { localMode: true }
	): Promise<number> {
		const { checkout, tree } = await setUpTestCheckout(options);
		const simpleTestTree = setUpTestTree(tree);
		await checkout.waitForPendingUpdates();
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

		await action(checkout, simpleTestTree, data);
		expect(errors).deep.equal([]);
		return data.changeCount;
	}

	async function setUpTestTreeCheckout(): Promise<{
		checkout: Checkout;
		sharedTree: SharedTree;
		testTree: TestTree;
	}> {
		const { checkout, tree } = await setUpTestCheckout();
		const testTree = setUpTestTree(tree);
		await checkout.waitForPendingUpdates();
		return { checkout, sharedTree: tree, testTree };
	}

	describe(checkoutName, () => {
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
			const { checkout, testTree } = await setUpTestTreeCheckout();
			expect(() => checkout.applyChanges(Change.delete(StableRange.only(testTree.left)))).throws();
		});

		it('cannot abort an edit if no edit is open', async () => {
			const { checkout } = await setUpTestCheckout();
			expect(() => checkout.abortEdit()).throws();
		});

		it('can abort valid edits', async () => {
			const { checkout, testTree } = await setUpTestTreeCheckout();
			checkout.openEdit();
			// Is still valid after a valid edit
			checkout.applyChanges(Change.delete(StableRange.only(testTree.left.identifier)));
			expect(checkout.getEditStatus()).equals(EditStatus.Applied);
			checkout.abortEdit();

			// The left node should still be there
			expect(checkout.currentView.getViewNode(testTree.left.identifier).identifier).not.undefined;
		});

		it('can abort invalid edits', async () => {
			const { checkout, testTree } = await setUpTestTreeCheckout();
			checkout.openEdit();
			// Starts as valid
			expect(checkout.getEditStatus()).equals(EditStatus.Applied);

			// Is invalid after an invalid edit
			expect(() =>
				checkout.applyChanges(...Change.insertTree(testTree.left, StablePlace.after(testTree.left)))
			).throws('Locally constructed edits must be well-formed and valid.');
			expect(checkout.getEditStatus()).equals(EditStatus.Invalid);
			checkout.abortEdit();

			// Next edit is unaffected
			checkout.openEdit();
			expect(checkout.getEditStatus()).equals(EditStatus.Applied);
			checkout.closeEdit();
		});

		it('can abort malformed edits', async () => {
			const { checkout, testTree } = await setUpTestTreeCheckout();
			checkout.openEdit();
			// Starts as valid
			expect(checkout.getEditStatus()).equals(EditStatus.Applied);

			// Is malformed after a malformed edit
			const malformedMove = Change.move(
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
			expect(() => checkout.applyChanges(Change.delete(StableRange.only(testTree.left)))).throws(
				'Cannot apply change to an edit unless all previous changes have applied'
			);
			expect(checkout.getEditStatus()).equals(EditStatus.Malformed);

			checkout.abortEdit();

			// Next edit is unaffected
			checkout.openEdit();
			expect(checkout.getEditStatus()).equals(EditStatus.Applied);
			checkout.closeEdit();
		});

		it('can try to apply an invalid edit and abort without causing an error', async () => {
			const { checkout, tree } = await setUpTestCheckout();
			const simpleTestTree = setUpTestTree(tree);

			// tryApplyEdit aborts when applying an invalid edit and returns undefined
			expect(
				checkout.tryApplyEdit(...Change.insertTree(simpleTestTree.left, StablePlace.after(simpleTestTree.left)))
			).to.be.undefined;

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
			const { checkout, testTree } = await setUpTestTreeCheckout();
			checkout.openEdit();
			// Starts as valid
			expect(checkout.getEditStatus()).equals(EditStatus.Applied);

			// Is still valid after a valid edit
			checkout.applyChanges(Change.delete(StableRange.only(testTree.left)));
			expect(checkout.getEditStatus()).equals(EditStatus.Applied);

			checkout.closeEdit();
		});

		it('exposes the current edit status in the face of invalid edits', async () => {
			const { checkout, testTree } = await setUpTestTreeCheckout();
			checkout.openEdit();
			// Starts as valid
			expect(checkout.getEditStatus()).equals(EditStatus.Applied);

			// Is invalid after an invalid edit
			expect(() =>
				checkout.applyChanges(...Change.insertTree(testTree.left, StablePlace.after(testTree.left)))
			).throws('Locally constructed edits must be well-formed and valid.');
			expect(checkout.getEditStatus()).equals(EditStatus.Invalid);

			// Is still invalid after a subsequent valid edit
			expect(() => checkout.applyChanges(Change.delete(StableRange.only(testTree.left)))).throws(
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
			const { checkout, testTree } = await setUpTestTreeCheckout();
			checkout.openEdit();
			// Starts as valid
			expect(checkout.getEditStatus()).equals(EditStatus.Applied);

			// Is malformed after a malformed edit
			const malformedMove = Change.move(
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
			expect(() => checkout.applyChanges(Change.delete(StableRange.only(testTree.left)))).throws(
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
			const invalidations = await countViewChange((checkout, simpleTestTree) => {
				checkout.applyEdit(Change.delete(StableRange.only(simpleTestTree.left)));
			});
			expect(invalidations).equals(1);
		});

		it('will emit invalidation messages in response to payload change', async () => {
			const invalidations = await countViewChange((checkout, simpleTestTree) => {
				checkout.applyEdit(Change.setPayload(simpleTestTree.left.identifier, 5));
			});
			expect(invalidations).equals(1);
		});

		it('emits a change event for each batch of changes in a local edit', async () => {
			const changes = await countViewChange(async (checkout, simpleTestTree, data) => {
				checkout.on(CheckoutEvent.ViewChange, () => {
					const leftTrait = checkout.currentView.getTrait(simpleTestTree.left.traitLocation);
					const rightTrait = checkout.currentView.getTrait(simpleTestTree.right.traitLocation);

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
				checkout.applyChanges(Change.delete(StableRange.only(simpleTestTree.left)));
				expect(data.changeCount).equals(1);
				checkout.applyChanges(Change.delete(StableRange.only(simpleTestTree.right)));
				expect(data.changeCount).equals(2);
				checkout.closeEdit();
				await checkout.waitForPendingUpdates();
			});

			// Checkout's use of LogViewer.setKnownEditingResult should enable CachingLogViewer
			// to return the exact same revision view object, allowing checkout to skip an extra change event from closeEdit.
			expect(changes).equals(2);
		});

		it('emits ViewChange events for edits directly on tree', async () => {
			const { checkout, testTree } = await setUpTestTreeCheckout();
			let changeCount = 0;
			checkout.on(CheckoutEvent.ViewChange, () => {
				changeCount += 1;
			});
			expect(changeCount).equals(0);
			checkout.tree.applyEdit(Change.delete(StableRange.only(testTree.left)));
			// Wait for edit to be included in checkout.
			await checkout.waitForPendingUpdates();
			expect(changeCount).equals(1);
		});

		it('automatically loads views from edits committed directly on it', async () => {
			const { checkout, testTree } = await setUpTestTreeCheckout();
			const viewBefore = checkout.currentView;
			let changeCount = 0;
			checkout.on(CheckoutEvent.ViewChange, () => {
				changeCount += 1;
			});
			checkout.applyEdit(Change.delete(StableRange.only(testTree.left)));
			expect(changeCount).equals(1);
			expect(viewBefore.equals(checkout.currentView)).to.be.false;
		});

		const secondTreeOptions = {
			id: 'secondTestSharedTree',
			localMode: false,
			allowInvalid: true,
		};

		it('can wait on edits to be submitted', async () => {
			const { checkout, testTree } = await setUpTestTreeCheckout();
			let committedEditsCount = 0;
			checkout.tree.on(SharedTreeEvent.EditCommitted, () => {
				committedEditsCount += 1;
			});
			expect(committedEditsCount).equals(0);
			checkout.tree.applyEdit(Change.delete(StableRange.only(testTree.left)));
			await checkout.waitForEditsToSubmit();
			expect(committedEditsCount).equals(1);
		});

		it('emits ViewChange events for remote edits', async () => {
			const { containerRuntimeFactory, tree } = setUpTestSharedTree({ localMode: false });
			const simpleTestTree = setUpTestTree(tree);

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

			secondTree.applyEdit(Change.delete(StableRange.only(simpleTestTree.left.translateId(secondTree))));
			expect(changeCount).equals(0);
			containerRuntimeFactory.processAllMessages();
			// Wait for edit to be included in checkout.
			await checkout.waitForPendingUpdates();
			expect(changeCount).equals(1);
			expect(secondTree.equals(tree));
		});

		it('connected state with a remote SharedTree equates correctly during edits', async () => {
			// Invalid edits are allowed here because this test creates edits concurrently in two trees,
			// which after syncing, end up with one being invalid.
			const { tree, containerRuntimeFactory } = setUpTestSharedTree({ localMode: false, allowInvalid: true });
			const simpleTestTree = setUpTestTree(tree);
			const { tree: secondTree } = setUpTestSharedTree({
				containerRuntimeFactory,
				...secondTreeOptions,
			});

			containerRuntimeFactory.processAllMessages();
			const checkout = await checkoutFactory(tree);
			const secondCheckout = await checkoutFactory(tree);

			expect(checkout.currentView.equals(secondCheckout.currentView)).to.be.true;
			expect(checkout.currentView.hasEqualForest(secondCheckout.currentView)).to.be.true;
			checkout.openEdit();
			expect(checkout.currentView.equals(secondCheckout.currentView)).to.be.false;
			expect(checkout.currentView.hasEqualForest(secondCheckout.currentView)).to.be.true;
			expect(tree.equals(secondTree)).to.be.true;
			secondCheckout.openEdit();
			expect(checkout.currentView.equals(secondCheckout.currentView)).to.be.true;
			expect(checkout.currentView.hasEqualForest(secondCheckout.currentView)).to.be.true;
			expect(tree.equals(secondTree)).to.be.true;
			checkout.applyChanges(Change.delete(StableRange.only(simpleTestTree.left)));
			expect(checkout.currentView.equals(secondCheckout.currentView)).to.be.false;
			expect(checkout.currentView.hasEqualForest(secondCheckout.currentView)).to.be.false;
			secondCheckout.applyChanges(Change.delete(StableRange.only(simpleTestTree.left)));
			expect(checkout.currentView.equals(secondCheckout.currentView)).to.be.true;
			expect(checkout.currentView.hasEqualForest(secondCheckout.currentView)).to.be.true;
			expect(tree.equals(secondTree)).to.be.true;
			checkout.closeEdit();
			await checkout.waitForPendingUpdates();
			expect(checkout.currentView.equals(secondCheckout.currentView)).to.be.false;
			expect(checkout.currentView.hasEqualForest(secondCheckout.currentView)).to.be.true;
			secondCheckout.closeEdit();
			await secondCheckout.waitForPendingUpdates();
			expect(checkout.currentView.equals(secondCheckout.currentView)).to.be.true;
			expect(checkout.currentView.hasEqualForest(secondCheckout.currentView)).to.be.true;
			await checkout.waitForPendingUpdates();
			await secondCheckout.waitForPendingUpdates();
			containerRuntimeFactory.processAllMessages();
			expect(tree.equals(secondTree)).to.be.true;
			await checkout.waitForPendingUpdates();
			await secondCheckout.waitForPendingUpdates();
			expect(checkout.currentView.equals(secondCheckout.currentView)).to.be.true;
			expect(checkout.currentView.hasEqualForest(secondCheckout.currentView)).to.be.true;
		});

		it('can successfully rebase an ongoing local edit', async () => {
			const { tree, containerRuntimeFactory } = setUpTestSharedTree({ localMode: false });
			const simpleTestTree = setUpTestTree(tree);
			const { tree: secondTree } = setUpTestSharedTree({ containerRuntimeFactory, ...secondTreeOptions });

			// Sync initial tree
			containerRuntimeFactory.processAllMessages();

			const checkout = await checkoutFactory(tree);
			const secondCheckout = await checkoutFactory(secondTree);

			const newLeftNode = simpleTestTree.buildLeaf(simpleTestTree.generateNodeId());
			checkout.openEdit();
			checkout.applyChanges(...setTrait(simpleTestTree.left.traitLocation, [newLeftNode]));

			// Concurrently, the second client deletes the right node. This will not conflict with the operation performed
			// on the left trait on the first client.
			secondCheckout.applyEdit(Change.delete(StableRange.only(simpleTestTree.right.translateId(secondTree))));
			await secondCheckout.waitForPendingUpdates();

			// Deliver the remote change. Since there will not be any conflicts, the result should merge locally and both trait
			// modifications should be reflected in the current view.
			containerRuntimeFactory.processAllMessages();

			await checkout.waitForPendingUpdates();
			await secondCheckout.waitForPendingUpdates();

			let leftTrait = checkout.currentView.getTrait(simpleTestTree.left.traitLocation);
			let rightTrait = checkout.currentView.getTrait(simpleTestTree.right.traitLocation);
			expect(leftTrait).deep.equals([newLeftNode.identifier]);
			// The remote deletion of the right node, while delivered, will not be reflected in the view yet.
			expect(rightTrait).deep.equals([simpleTestTree.right.identifier]);

			const secondLeftTrait = secondCheckout.currentView.getTrait(
				simpleTestTree.left.traitLocation.translate(secondTree)
			);
			const secondRightTrait = secondCheckout.currentView.getTrait(
				simpleTestTree.right.traitLocation.translate(secondTree)
			);
			expect(secondLeftTrait).deep.equals([simpleTestTree.left.translateId(secondTree)]);
			expect(secondRightTrait.length).equals(0);

			// Merge in the latest changes.
			await checkout.waitForPendingUpdates();
			const rebaseResult = checkout.rebaseCurrentEdit();
			expect(rebaseResult).equals(EditValidationResult.Valid);
			leftTrait = checkout.currentView.getTrait(simpleTestTree.left.traitLocation);
			rightTrait = checkout.currentView.getTrait(simpleTestTree.right.traitLocation);
			expect(leftTrait).deep.equals([newLeftNode.identifier]);
			expect(rightTrait.length).equals(0);

			checkout.closeEdit();
			// Again, call this prior to processing ops to accommodate PrefetchingCheckout
			await checkout.waitForPendingUpdates();
			containerRuntimeFactory.processAllMessages();
			await secondCheckout.waitForPendingUpdates();
			expect(tree.equals(secondTree)).to.be.true;
		});

		it('can handle a failed rebase of an ongoing local edit', async () => {
			const { tree, containerRuntimeFactory } = setUpTestSharedTree({ localMode: false });
			const simpleTestTree = setUpTestTree(tree);
			const { tree: secondTree } = setUpTestSharedTree({ containerRuntimeFactory, ...secondTreeOptions });

			// Sync initial tree
			containerRuntimeFactory.processAllMessages();

			const checkout = await checkoutFactory(tree);
			const secondCheckout = await checkoutFactory(secondTree);

			checkout.openEdit();
			// Move the left node to after the right node
			checkout.applyChanges(
				...Change.move(StableRange.only(simpleTestTree.left), StablePlace.after(simpleTestTree.right))
			);

			// Concurrently, the second client deletes the right node. This will conflict with the move operation by the first client.
			secondCheckout.applyEdit(Change.delete(StableRange.only(simpleTestTree.right.translateId(secondTree))));
			await secondCheckout.waitForPendingUpdates();

			containerRuntimeFactory.processAllMessages();
			await checkout.waitForPendingUpdates();
			await secondCheckout.waitForPendingUpdates();

			// Before rebasing, the first client should still see the right node and will have moved the left node after it.
			const leftTrait = checkout.currentView.getTrait(simpleTestTree.left.traitLocation);
			const rightTrait = checkout.currentView.getTrait(simpleTestTree.right.traitLocation);
			expect(leftTrait).deep.equals([]);
			expect(rightTrait).deep.equals([simpleTestTree.right.identifier, simpleTestTree.left.identifier]);

			// Merge in the latest changes.
			const rebaseResult = checkout.rebaseCurrentEdit();
			expect(rebaseResult).equals(EditValidationResult.Invalid);
			expect(
				areRevisionViewsSemanticallyEqual(checkout.currentView, tree, secondCheckout.currentView, secondTree)
			).to.be.true;
		});

		it('can dispose and remove listeners', async () => {
			const { checkout } = await setUpTestCheckout();
			expect(checkout.tree.listenerCount(SharedTreeEvent.EditCommitted)).to.equal(1);
			checkout.dispose();
			expect(checkout.tree.listenerCount(SharedTreeEvent.EditCommitted)).to.equal(0);
		});

		additionalTests?.();
	});
}

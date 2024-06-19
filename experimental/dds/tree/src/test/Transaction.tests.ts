/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';

import { Change, StablePlace, StableRange } from '../ChangeTypes.js';
import { SharedTree } from '../SharedTree.js';
import { Transaction, TransactionEvent } from '../Transaction.js';
import { TreeView } from '../TreeView.js';
import { EditStatus, WriteFormat } from '../persisted-types/index.js';

import { expectDefined } from './utilities/TestCommon.js';
import { TestTree } from './utilities/TestNode.js';
import { setUpTestSharedTree, setUpTestTree } from './utilities/TestUtilities.js';

describe('Transaction', () => {
	function createTestTransaction(): {
		tree: SharedTree;
		testTree: TestTree;
		transaction: Transaction;
	} {
		const { tree } = setUpTestSharedTree({ writeFormat: WriteFormat.v0_1_1 });
		const testTree = setUpTestTree(tree);
		return { tree, testTree, transaction: new Transaction(tree) };
	}

	function createValidChange(testTree: TestTree): Change {
		return Change.delete(StableRange.only(testTree.left));
	}

	function createValidChanges(testTree: TestTree): Change[] {
		return Change.move(StableRange.only(testTree.left), StablePlace.after(testTree.right));
	}

	function createInvalidChange(testTree: TestTree): Change {
		return Change.delete(StableRange.only(testTree.generateNodeId()));
	}

	function createMalformedChange(testTree: TestTree): Change {
		return Change.insert(Number.NaN, StablePlace.after(testTree.left));
	}

	it('can apply an edit to the tree', () => {
		const { tree, testTree, transaction } = createTestTransaction();
		const editCountBefore = tree.edits.length;
		transaction.apply(createValidChange(testTree));
		transaction.closeAndCommit();
		expect(tree.edits.length).to.equal(editCountBefore + 1);
		expect(tree.currentView.getTrait(testTree.left.traitLocation).length).to.equal(0);
	});

	it('has correct edit status when applied', () => {
		const { testTree, transaction } = createTestTransaction();
		expect(transaction.apply(createValidChange(testTree))).to.equal(EditStatus.Applied);
		expect(transaction.status).to.equal(EditStatus.Applied);
		transaction.closeAndCommit();
	});

	it('has correct edit status when invalid', () => {
		const { testTree, transaction } = createTestTransaction();
		expect(transaction.apply(createInvalidChange(testTree))).to.equal(EditStatus.Invalid);
		expect(transaction.status).to.equal(EditStatus.Invalid);
		transaction.closeAndCommit();
	});

	it('has correct edit status when malformed', () => {
		const { testTree, transaction } = createTestTransaction();
		expect(transaction.apply(createMalformedChange(testTree))).to.equal(EditStatus.Malformed);
		expect(transaction.status).to.equal(EditStatus.Malformed);
		transaction.closeAndCommit();
	});

	it('can apply multiple changes at once', () => {
		const { tree, testTree, transaction } = createTestTransaction();
		transaction.apply(createValidChanges(testTree));
		transaction.closeAndCommit();
		expect(tree.currentView.getTrait(testTree.left.traitLocation).length).to.equal(0);
		expect(tree.currentView.getTrait(testTree.right.traitLocation).length).to.equal(2);
	});

	it('does not apply empty edits', () => {
		const { tree, transaction } = createTestTransaction();
		const editCountBefore = tree.edits.length;
		transaction.apply([]);
		transaction.closeAndCommit();
		expect(tree.edits.length).to.equal(editCountBefore);
	});

	it('does not apply a batch of changes if any of them fail', () => {
		const { testTree, transaction } = createTestTransaction();
		const change = createValidChange(testTree);
		expect(transaction.apply(change, change)).to.equal(EditStatus.Invalid); // Second change is invalid
		expect(transaction.status).to.equal(EditStatus.Invalid);
		transaction.closeAndCommit();
	});

	it('is open when created', () => {
		const { transaction } = createTestTransaction();
		expect(transaction.isOpen).to.be.true;
	});

	it('closes when a change fails to apply', () => {
		const { testTree, transaction } = createTestTransaction();
		transaction.apply(createInvalidChange(testTree));
		expect(transaction.isOpen).to.be.false;
	});

	it('closes when an edit is applied', () => {
		const { testTree, transaction } = createTestTransaction();
		expect(transaction.isOpen).to.be.true;
		transaction.apply(createValidChange(testTree));
		expect(transaction.isOpen).to.be.true;
		transaction.closeAndCommit();
		expect(transaction.isOpen).to.be.false;
	});

	it('emits view change events', () => {
		const { testTree, transaction } = createTestTransaction();
		let beforeView: TreeView | undefined;
		let afterView: TreeView | undefined;
		transaction.addListener(TransactionEvent.ViewChange, (before, after) => {
			beforeView = before;
			afterView = after;
		});
		const beforeViewExpected = transaction.currentView;
		transaction.apply(createValidChange(testTree));
		const afterViewExpected = transaction.currentView;
		expect(expectDefined(beforeView).equals(beforeViewExpected)).to.be.true;
		expect(expectDefined(afterView).equals(afterViewExpected)).to.be.true;
	});

	it('emits only one view change event per apply', () => {
		const { testTree, transaction } = createTestTransaction();
		let eventCount = 0;
		transaction.addListener(TransactionEvent.ViewChange, () => {
			eventCount += 1;
		});
		transaction.apply(createValidChanges(testTree));
		expect(eventCount).to.equal(1);
	});

	it('does not emit view change events when there are no changes', () => {
		const { transaction } = createTestTransaction();
		transaction.on(TransactionEvent.ViewChange, () => {
			expect.fail();
		});
		transaction.apply([]);
	});
});

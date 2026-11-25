/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from 'node:assert';

import type { IFluidHandle } from '@fluidframework/core-interfaces';
import { MockFluidDataStoreRuntime } from '@fluidframework/test-runtime-utils/internal';

import { newEditId } from '../EditUtilities.js';
import { SharedTree as SharedTreeImplementation } from '../SharedTree.js';
import type { EditCommittedEventArguments, ISharedTree } from '../index.js';
import {
	Change,
	CheckoutEvent,
	EagerCheckout,
	SharedTree,
	SharedTreeAttributes,
	SharedTreeEvent,
	SharedTreeFactory,
	SharedTreeFactoryType,
	SharedTreeUndoRedoHandler,
	Transaction,
	WriteFormat,
} from '../index.js';

import { setUpTestSharedTree } from './utilities/TestUtilities.js';

describe('ISharedTree', () => {
	it('preserves the creation APIs, factory identity, and configured options', () => {
		assert.equal(typeof SharedTree, 'object');
		assert.deepEqual(Object.keys(SharedTree).sort(), ['create', 'getFactory']);
		assert.equal(SharedTree.create, SharedTreeImplementation.create);
		assert.equal(SharedTree.getFactory, SharedTreeImplementation.getFactory);
		const defaultFactory = SharedTree.getFactory();
		assert(defaultFactory instanceof SharedTreeFactory);
		assert.notEqual(SharedTree.getFactory(), defaultFactory);
		assert.equal(defaultFactory.type, SharedTreeFactoryType);
		assert.equal(defaultFactory.attributes, SharedTreeFactory.Attributes);
		assert.equal(defaultFactory.attributes, SharedTreeAttributes);
		const runtime = new MockFluidDataStoreRuntime({ registry: [defaultFactory] });
		const created: SharedTree = SharedTree.create(runtime, 'created');
		assert.equal(created.id, 'created');
		assert.equal(created.getWriteFormat(), WriteFormat.v0_1_1);
		assert.equal(SharedTree.create(runtime).attributes, SharedTreeAttributes);

		const attributionId = created.attributionId;
		const configured = SharedTree.getFactory(WriteFormat.v0_1_1, { attributionId });
		assert.equal(configured.create(runtime, 'configured').attributionId, attributionId);
		assert.equal(
			SharedTree.getFactory(WriteFormat.v0_0_2).create(runtime, 'old-format').getWriteFormat(),
			WriteFormat.v0_0_2
		);
	});

	it('compares semantic views and ordered edit IDs without dependence on edit locality', () => {
		const firstId = newEditId();
		const secondId = newEditId();
		const { tree: sequenced, containerRuntimeFactory } = setUpTestSharedTree({ localMode: false });
		const { tree: localImplementation } = setUpTestSharedTree();
		const local: ISharedTree = localImplementation;
		for (const id of [firstId, secondId]) {
			sequenced.applyEditInternal({ id, changes: [] });
			local.applyEditInternal({ id, changes: [] });
		}
		containerRuntimeFactory.processAllMessages();
		assert.equal(Array.from(sequenced.edits.getLocalEdits()).length, 0);
		assert.equal(Array.from(local.edits.getLocalEdits()).length, 2);
		assert(sequenced.equals(local));
		assert(local.equals(sequenced));

		const { tree: reordered } = setUpTestSharedTree();
		for (const id of [secondId, firstId]) {
			reordered.applyEditInternal({ id, changes: [] });
		}
		assert(!local.equals(reordered));

		const { tree: differentIds } = setUpTestSharedTree();
		differentIds.applyEditInternal([]);
		differentIds.applyEditInternal([]);
		assert(!local.equals(differentIds));

		const { tree: differentView } = setUpTestSharedTree();
		differentView.applyEditInternal({
			id: firstId,
			changes: [differentView.internalizeChange(Change.setPayload(differentView.currentView.root, 'different'))],
		});
		differentView.applyEditInternal({ id: secondId, changes: [] });
		assert(!local.equals(differentView));
	});

	for (const writeFormat of [WriteFormat.v0_0_2, WriteFormat.v0_1_1]) {
		it(`preserves views, edit indexes, and handles for ${writeFormat}`, async () => {
			const { tree: implementation } = setUpTestSharedTree({ writeFormat });
			const tree: ISharedTree = implementation;
			const handle: IFluidHandle<ISharedTree> = tree.handle;
			assert.equal(await handle.get(), tree);
			const before = tree.currentView;
			let eventObserved = false;
			const listener = ({ tree: eventTree, editId, local }: EditCommittedEventArguments): void => {
				assert.equal(eventTree, tree);
				assert.equal(local, true);
				assert.equal(tree.edits.getIndexOfId(editId), 0);
				assert.equal(tree.currentView.getViewNode(tree.currentView.root).payload, 'value');
				eventObserved = true;
			};
			tree.on(SharedTreeEvent.EditCommitted, listener);
			const edit = tree.applyEdit(Change.setPayload(tree.currentView.root, 'value'));
			tree.off(SharedTreeEvent.EditCommitted, listener);
			assert(eventObserved);
			assert.equal(tree.edits.getIndexOfId(edit.id), 0);
			assert.equal(tree.logViewer.getRevisionViewInMemory(0), before);
			// eslint-disable-next-line import-x/no-deprecated -- Preserve the partner compatibility path.
			assert.equal(tree.logViewer.getRevisionViewInSession(1), tree.currentView);
		});

		it(`preserves Checkout, transactions, error forwarding, and undo for ${writeFormat}`, () => {
			const { tree: implementation } = setUpTestSharedTree({ writeFormat, noFailOnError: true });
			const tree: ISharedTree = implementation;
			const checkout = new EagerCheckout(tree);
			const transaction = new Transaction(tree);
			assert.equal(transaction.startingView, tree.currentView);
			transaction.apply(Change.setPayload(tree.currentView.root, 'transaction'));
			transaction.closeAndCommit();
			assert.equal(checkout.currentView.getViewNode(tree.currentView.root).payload, 'transaction');
			let revertible: { revert(): void } | undefined;
			const undo = new SharedTreeUndoRedoHandler({
				pushToCurrentOperation: (entry) => {
					revertible = entry;
				},
			});
			undo.attachTree(tree);
			tree.applyEdit(Change.setPayload(tree.currentView.root, 'next'));
			assert(revertible !== undefined);
			undo.detachTree(tree);
			revertible.revert();
			assert.equal(tree.currentView.getViewNode(tree.currentView.root).payload, 'transaction');

			const expectedError = new Error('Checkout listener failed');
			let actualError: unknown;
			tree.on('error', (error: unknown) => {
				actualError = error;
			});
			checkout.on(CheckoutEvent.ViewChange, () => {
				throw expectedError;
			});
			checkout.applyEdit(Change.setPayload(tree.currentView.root, 'error'));
			assert.equal(actualError, expectedError);
			checkout.dispose();
		});
	}
});

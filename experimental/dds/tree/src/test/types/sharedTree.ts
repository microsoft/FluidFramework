/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from '@fluidframework/core-interfaces';
import type {
	IChannel,
	IChannelFactory,
	IChannelServices,
	IFluidDataStoreRuntime,
} from '@fluidframework/datastore-definitions/internal';
import type { ISharedObject, ISharedObjectKind, SharedObject } from '@fluidframework/shared-object-base/internal';

import type { SharedTree as SharedTreeImplementation } from '../../SharedTree.js';

import {
	Change,
	EagerCheckout,
	type EditCommittedEventArguments,
	type ISharedTree,
	type NodeId,
	type RevisionView,
	type SequencedEditAppliedEventArguments,
	SharedTree,
	SharedTreeEvent,
	SharedTreeFactory,
	SharedTreeUndoRedoHandler,
	Transaction,
	WriteFormat,
} from '../../index.js';

declare function use<T>(value: T): void;

type MissingTreeMembers = Exclude<keyof SharedTreeImplementation, keyof SharedObject | keyof ISharedTree>;

/**
 * Checks package-root creation, handles, events, and the partner contract.
 */
export async function checkSharedTreeContract(
	runtime: IFluidDataStoreRuntime,
	services: IChannelServices,
	tree: ISharedTree,
	undo: SharedTreeUndoRedoHandler,
	committed: EditCommittedEventArguments,
	sequenced: SequencedEditAppliedEventArguments
): Promise<void> {
	use<MissingTreeMembers extends never ? true : false>(true);
	use<ISharedObjectKind<SharedTree>>(SharedTree);
	use<ISharedObject>(tree);
	use<IChannel>(tree);
	use<SharedTree>(tree);
	use<ISharedTree>(SharedTree.create(runtime));
	use<ISharedTree>(SharedTree.create(runtime, 'tree'));
	use<SharedTreeFactory>(SharedTree.getFactory());
	use<SharedTreeFactory>(SharedTree.getFactory(WriteFormat.v0_0_2));
	use<SharedTreeFactory>(SharedTree.getFactory(WriteFormat.v0_1_1, undefined));
	use<SharedTreeFactory>(
		SharedTree.getFactory(WriteFormat.v0_1_1, {
			attributionId: tree.attributionId,
			inMemoryHistorySize: 10,
			editEvictionFrequency: 2,
		})
	);
	use<IChannelFactory<ISharedTree>>(new SharedTreeFactory(WriteFormat.v0_1_1));
	const factory = SharedTree.getFactory();
	use<ISharedTree>(factory.create(runtime, 'tree'));
	use<ISharedTree>(await factory.load(runtime, 'tree', services, factory.attributes));
	use<IFluidHandle<SharedTree>>(tree.handle);
	use<ISharedTree>(await tree.handle.get());
	use<ISharedTree>(committed.tree);
	use<ISharedTree>(sequenced.tree);
	const checkout = new EagerCheckout(tree);
	use<ISharedTree>(checkout.tree);
	const transaction = new Transaction(tree);
	use<ISharedTree>(transaction.tree);
	use<RevisionView>(tree.currentView);
	const nodeId: NodeId = tree.generateNodeId();
	use<NodeId>(tree.convertToNodeId(tree.convertToStableNodeId(nodeId)));
	tree.applyEdit(Change.setPayload(tree.currentView.root, 'value'));
	const edit = tree.applyEdit([Change.setPayload(tree.currentView.root, 'other')]);
	use<number>(tree.edits.getIndexOfId(edit.id));
	use<RevisionView>(tree.logViewer.getRevisionViewInMemory(0));
	// eslint-disable-next-line import-x/no-deprecated -- Preserve the partner compatibility path.
	use<RevisionView>(tree.logViewer.getRevisionViewInSession(0));
	tree.revert(edit.id);
	tree.equals(tree);
	tree.mergeEditsFrom(tree, tree.edits.getLocalEdits());
	undo.attachTree(tree);
	undo.detachTree(tree);
	tree.on(SharedTreeEvent.EditCommitted, ({ tree: eventTree }) => {
		use<ISharedTree>(eventTree);
	});

	// @ts-expect-error SharedTree is a creation value, not a constructor.
	new SharedTree(runtime, 'tree', WriteFormat.v0_1_1);
	// @ts-expect-error SharedTree does not expose a class for inheritance.
	class UnsupportedTree extends SharedTree {}
	// @ts-expect-error The public contract does not expose general event emission.
	tree.emit;
	// @ts-expect-error The tree does not expose its edit log implementation.
	tree.editLog;
	// @ts-expect-error Write format 0.0.2 does not accept attribution options.
	SharedTree.getFactory(WriteFormat.v0_0_2, { attributionId: tree.attributionId });
	// @ts-expect-error The optional no-argument overload does not accept an undefined write format.
	SharedTree.getFactory(undefined);
}

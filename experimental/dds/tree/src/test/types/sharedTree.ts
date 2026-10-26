/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { EventEmitter } from 'events';

import type { IFluidHandle } from '@fluidframework/core-interfaces';
import type {
	IChannel,
	IChannelFactory,
	IChannelServices,
	IFluidDataStoreRuntime,
} from '@fluidframework/datastore-definitions/internal';
import type { ISharedObject, ISharedObjectKind } from '@fluidframework/shared-object-base/internal';

import type { SharedTree as SharedTreeImplementation } from '../../SharedTree.js';

import {
	Change,
	createSharedTree,
	EagerCheckout,
	type EditCommittedEventArguments,
	type EditId,
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

type AssertAssignable<Expected, Actual extends Expected> = Actual;

type Factory = ReturnType<typeof SharedTree.getFactory>;

/**
 * These tests check the instance interface and the package-root creation APIs.
 * Because the package tsconfig includes this file, TypeScript checks these requirements during compilation.
 * Each property names one requirement and uses AssertAssignable to check it.
 * For example, interfaceConnectionState checks that ISharedTree.connected remains assignable to boolean.
 * If connected changes to string, that check fails because string does not satisfy the boolean constraint.
 * These checks need no function calls or tree instances.
 */
export interface SharedTreeCompatibilityChecks {
	classImplementsInterface: AssertAssignable<ISharedTree, SharedTreeImplementation>;
	creationWithoutClass: AssertAssignable<
		(runtime: IFluidDataStoreRuntime, id?: string) => ISharedTree,
		typeof createSharedTree
	>;
	interfaceConnectionState: AssertAssignable<boolean, ISharedTree['connected']>;
	interfaceLocalInitialization: AssertAssignable<() => void, ISharedTree['initializeLocal']>;
	interfaceLoad: AssertAssignable<(services: IChannelServices) => Promise<void>, ISharedTree['load']>;
	// EventEmitter utilities are outside the shared-object contract, which exposes event subscriptions only.
	interfaceCoversClassMembers: AssertAssignable<
		Record<Exclude<keyof SharedTreeImplementation, keyof EventEmitter>, unknown>,
		ISharedTree
	>;
	interfacePreservesLifecycleSignatures: AssertAssignable<
		Pick<SharedTreeImplementation, 'connected' | 'initializeLocal' | 'load'>,
		ISharedTree
	>;
	typedHandle: AssertAssignable<IFluidHandle<ISharedTree>, ISharedTree['handle']>;
	staticCreationReturnsInterface: AssertAssignable<
		(runtime: IFluidDataStoreRuntime, id?: string) => ISharedTree,
		typeof SharedTree.create
	>;
	committedEventUsesInterface: AssertAssignable<ISharedTree, EditCommittedEventArguments['tree']>;
	sequencedEventUsesInterface: AssertAssignable<ISharedTree, SequencedEditAppliedEventArguments['tree']>;
	factoryCreationReturnsInterface: AssertAssignable<
		(runtime: IFluidDataStoreRuntime, id: string) => ISharedTree,
		Factory['create']
	>;
	factoryLoadReturnsInterface: AssertAssignable<
		(
			runtime: IFluidDataStoreRuntime,
			id: string,
			services: IChannelServices,
			attributes: Factory['attributes']
		) => Promise<ISharedTree>,
		Factory['load']
	>;
	eagerCheckoutUsesInterface: AssertAssignable<ISharedTree, EagerCheckout['tree']>;
	transactionUsesInterface: AssertAssignable<ISharedTree, Transaction['tree']>;
}

declare function use<T>(value: T): void;

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
	use<ISharedObjectKind<SharedTree>>(SharedTree);
	use<ISharedObject>(tree);
	use<IChannel>(tree);
	use<SharedTree>(tree);
	use<ISharedTree>(SharedTree.create(runtime));
	use<ISharedTree>(SharedTree.create(runtime, 'tree'));
	use<ISharedTree>(createSharedTree(runtime));
	use<ISharedTree>(createSharedTree(runtime, 'tree'));
	use<boolean>(tree.connected);
	tree.initializeLocal();
	await tree.load(services);
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
	use<EditId>(edit.id);
	use<number>(tree.edits.getIndexOfId(edit.id));
	use<RevisionView>(tree.logViewer.getRevisionViewInMemory(0));
	// eslint-disable-next-line import-x/no-deprecated -- Preserve the partner compatibility path.
	use<RevisionView>(tree.logViewer.getRevisionViewInSession(0));
	use<EditId | undefined>(tree.revert(edit.id));
	tree.equals(tree);
	tree.mergeEditsFrom(tree, tree.edits.getLocalEdits());
	undo.attachTree(tree);
	undo.detachTree(tree);
	const listener = ({ tree: eventTree }: EditCommittedEventArguments): void => {
		use<ISharedTree>(eventTree);
	};
	tree.on(SharedTreeEvent.EditCommitted, listener);
	tree.off(SharedTreeEvent.EditCommitted, listener);

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

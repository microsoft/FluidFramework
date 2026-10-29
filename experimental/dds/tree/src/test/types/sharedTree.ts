/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { EventEmitter } from 'events';

import type { IFluidHandle } from '@fluidframework/core-interfaces';
import type { IFluidHandleInternal } from '@fluidframework/core-interfaces/internal';
import type { IChannelServices, IFluidDataStoreRuntime } from '@fluidframework/datastore-definitions/internal';

import type {
	createSharedTree,
	EagerCheckout,
	EditCommittedEventArguments,
	ISharedTree,
	SharedTree,
	Transaction,
	WriteFormat,
} from '../../index.js';

type AssertAssignable<Expected, Actual extends Expected> = Actual;

type Factory = ReturnType<typeof SharedTree.getFactory>;

declare class CompatibleTree extends SharedTree {
	public readonly handle: IFluidHandleInternal;
}

/**
 * These tests check that ISharedTree exposes the expected members and that existing SharedTree APIs retain their types.
 * Because the package tsconfig includes this file, TypeScript checks these requirements during compilation.
 * Each property names one requirement and uses AssertAssignable to check it.
 * For example, interfaceConnectionState checks that ISharedTree.connected remains assignable to boolean.
 * If connected changes to string, that check fails because string does not satisfy the boolean constraint.
 * These checks need no function calls, so they protect the types without a runtime test or a tree instance.
 */
export interface SharedTreeCompatibilityChecks {
	classImplementsInterface: AssertAssignable<ISharedTree, SharedTree>;
	creationWithoutClass: AssertAssignable<
		(runtime: IFluidDataStoreRuntime, id?: string) => ISharedTree,
		typeof createSharedTree
	>;
	interfaceConnectionState: AssertAssignable<boolean, ISharedTree['connected']>;
	interfaceLocalInitialization: AssertAssignable<() => void, ISharedTree['initializeLocal']>;
	interfaceLoad: AssertAssignable<(services: IChannelServices) => Promise<void>, ISharedTree['load']>;
	// EventEmitter utilities are outside the shared-object contract, which exposes event subscriptions only.
	interfaceCoversClassMembers: AssertAssignable<
		Record<Exclude<keyof SharedTree, keyof EventEmitter>, unknown>,
		ISharedTree
	>;
	interfacePreservesLifecycleSignatures: AssertAssignable<
		Pick<SharedTree, 'connected' | 'initializeLocal' | 'load'>,
		ISharedTree
	>;
	classHandleRemainsCompatible: AssertAssignable<IFluidHandle, SharedTree['handle']>;
	staticCreationReturnsClass: AssertAssignable<
		(runtime: IFluidDataStoreRuntime) => SharedTree,
		typeof SharedTree.create
	>;
	committedEventRetainsClass: AssertAssignable<SharedTree, EditCommittedEventArguments['tree']>;
	factoryCreationReturnsClass: AssertAssignable<
		(runtime: IFluidDataStoreRuntime, id: string) => SharedTree,
		Factory['create']
	>;
	factoryLoadReturnsClass: AssertAssignable<
		(
			runtime: IFluidDataStoreRuntime,
			id: string,
			services: IChannelServices,
			attributes: Factory['attributes']
		) => Promise<SharedTree>,
		Factory['load']
	>;
	eagerCheckoutRetainsClass: AssertAssignable<SharedTree, EagerCheckout['tree']>;
	transactionRetainsClass: AssertAssignable<SharedTree, Transaction['tree']>;
	constructorReturnsClass: AssertAssignable<
		new (
			runtime: IFluidDataStoreRuntime,
			id: string,
			writeFormat: WriteFormat.v0_1_1
		) => SharedTree,
		typeof SharedTree
	>;
	subclassHandleRemainsCompatible: AssertAssignable<typeof SharedTree, typeof CompatibleTree>;
}

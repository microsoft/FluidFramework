/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { EventEmitter } from 'events';

import type { IFluidHandle } from '@fluidframework/core-interfaces';
import type { IFluidHandleInternal } from '@fluidframework/core-interfaces/internal';
import type { IChannelServices, IFluidDataStoreRuntime } from '@fluidframework/datastore-definitions/internal';

import {
	createSharedTree,
	EagerCheckout,
	type EditCommittedEventArguments,
	type ISharedTree,
	SharedTree,
	Transaction,
	WriteFormat,
} from '../../index.js';

declare function use<T>(value: T): void;

/**
 * Checks the additive interface and the existing class contracts.
 */
export async function checkSharedTreePreparation(
	runtime: IFluidDataStoreRuntime,
	services: IChannelServices,
	committed: EditCommittedEventArguments
): Promise<void> {
	const tree = SharedTree.create(runtime);
	use<ISharedTree>(tree);
	const instance = createSharedTree(runtime);
	use<ISharedTree>(instance);
	use<ISharedTree>(createSharedTree(runtime, 'tree'));
	use<boolean>(instance.connected);
	use<void>(instance.initializeLocal());
	use<Promise<void>>(instance.load(services));
	// EventEmitter utilities are outside the shared-object contract, which exposes event subscriptions only.
	use<Record<Exclude<keyof SharedTree, keyof EventEmitter>, unknown>>(instance);
	use<Pick<SharedTree, 'connected' | 'initializeLocal' | 'load'>>(instance);
	use<IFluidHandle>(tree.handle);
	use<SharedTree>(tree);
	use<SharedTree>(committed.tree);
	const factory = SharedTree.getFactory(WriteFormat.v0_1_1, undefined);
	use<SharedTree>(factory.create(runtime, 'tree'));
	use<SharedTree>(await factory.load(runtime, 'tree', services, factory.attributes));
	use<SharedTree>(new EagerCheckout(tree).tree);
	use<SharedTree>(new Transaction(tree).tree);
	use<SharedTree>(new SharedTree(runtime, 'tree', WriteFormat.v0_1_1));

	class CompatibleTree extends SharedTree {
		public declare readonly handle: IFluidHandleInternal;
	}
	use<typeof SharedTree>(CompatibleTree);
}

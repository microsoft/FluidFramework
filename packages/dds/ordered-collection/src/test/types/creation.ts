/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions/legacy";
import type { ISharedObjectKind } from "@fluidframework/shared-object-base/legacy";

import {
	ConsensusQueue,
	type IConsensusOrderedCollection,
} from "@fluidframework/ordered-collection/legacy";

// @ts-expect-error The ordered implementation class is not a supported export.
export type { ConsensusOrderedCollection } from "@fluidframework/ordered-collection/legacy";
// @ts-expect-error The queue implementation class is not a supported export.
export type { ConsensusQueueClass } from "@fluidframework/ordered-collection/legacy";

import { ConsensusQueueFactory } from "../../consensusOrderedCollectionFactory.js";

declare function use(value: unknown): void;

/**
 * Checks the supported creation APIs, generic factory, and interface alias.
 */
export function checkCreation(
	runtime: IFluidDataStoreRuntime,
	queue: IConsensusOrderedCollection<string>,
): void {
	const kind: ISharedObjectKind<IConsensusOrderedCollection> = ConsensusQueue;
	const fromKind: IConsensusOrderedCollection = kind.create(runtime);
	const fromSingleton: IConsensusOrderedCollection = ConsensusQueue.create(runtime);
	// eslint-disable-next-line import-x/no-deprecated -- Verify the preserved compatibility alias.
	const alias: ConsensusQueue<string> = queue;
	const fromAlias: IConsensusOrderedCollection<string> = alias;
	const fromFactory: IConsensusOrderedCollection<string> =
		new ConsensusQueueFactory<string>().create(runtime, "queue");
	const factory = ConsensusQueue.getFactory();
	use([fromKind, fromSingleton, fromAlias, fromFactory, factory]);
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IChannelAttributes,
	IChannelFactory,
	IChannelServices,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import type { SharedObjectCore } from "@fluidframework/shared-object-base/internal";
import { createSharedObjectKind } from "@fluidframework/shared-object-base/internal";

// eslint-disable-next-line import-x/no-deprecated -- Internal usage of deprecated class in factory
import { ConsensusQueueClass } from "./consensusQueue.js";
import type {
	IConsensusOrderedCollection,
	IConsensusOrderedCollectionEvents,
} from "./interfaces.js";
import { pkgVersion } from "./packageVersion.js";

/**
 * The factory that defines the consensus queue
 *
 * @internal
 */
export class ConsensusQueueFactory<T>
	implements IChannelFactory<IConsensusOrderedCollection<T>>
{
	// New type string, to be activated once the migration has been fully shipped dark and is safe to flip.
	// See LegacyTypeAwareRegistry in packages/runtime/datastore/src/dataStoreRuntime.ts.
	// public static Type = "consensus-queue";
	public static Type = "https://graph.microsoft.com/types/consensus-queue";

	public static readonly Attributes: IChannelAttributes = {
		type: ConsensusQueueFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};

	public get type(): string {
		return ConsensusQueueFactory.Type;
	}

	public get attributes(): IChannelAttributes {
		return ConsensusQueueFactory.Attributes;
	}

	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<
		IConsensusOrderedCollection<T> & SharedObjectCore<IConsensusOrderedCollectionEvents<T>>
	> {
		// eslint-disable-next-line import-x/no-deprecated -- Internal usage of deprecated class
		const collection = new ConsensusQueueClass<T>(id, runtime, attributes);
		await collection.load(services);
		return collection;
	}

	public create(
		document: IFluidDataStoreRuntime,
		id: string,
	): IConsensusOrderedCollection<T> & SharedObjectCore<IConsensusOrderedCollectionEvents<T>> {
		// eslint-disable-next-line import-x/no-deprecated -- Internal usage of deprecated class
		const collection = new ConsensusQueueClass<T>(id, document, this.attributes);
		collection.initializeLocal();
		return collection;
	}
}

/**
 * {@inheritDoc ConsensusQueueClass}
 * @legacy @beta
 */
export const ConsensusQueue = createSharedObjectKind<IConsensusOrderedCollection>(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: #22835 Use unknown instead of any (breaking change)
	ConsensusQueueFactory<any>,
);

// For #22835, consider exposing a helper to produce type specific ConsensusQueue.
// One problem, with doing so is that nothing inside ConsensusQueue validates the shape of T.
// A DDS load might find content that is not the same, expected type.
// But that is not any worse than the `any` that exists currently.
// /**
//  * Factory for shared object kind for queue-shaped ordered collections of specific type.
//  * @legacy @beta
//  */
// export function TypedConsensusQueue<T>(): ISharedObjectKind<IConsensusOrderedCollection<T>> &
// 	SharedObjectKind<IConsensusOrderedCollection<T>> {
// 	return ConsensusQueue;
// }

/**
 * {@inheritDoc ConsensusQueueClass}
 * @deprecated Use {@link IConsensusOrderedCollection} for typing instead. This type alias will be removed in a future release.
 * @legacy @beta
 */
// TODO: #22835 Use undefined instead of any (breaking change)
// eslint-disable-next-line @typescript-eslint/no-explicit-any, import-x/no-deprecated
export type ConsensusQueue<T = any> = ConsensusQueueClass<T>;

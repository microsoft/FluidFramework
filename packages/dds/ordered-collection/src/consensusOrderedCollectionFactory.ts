/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IChannelAttributes,
	IFluidDataStoreRuntime,
	IChannelServices,
} from "@fluidframework/datastore-definitions/internal";
import { createSharedObjectKind } from "@fluidframework/shared-object-base/internal";

// eslint-disable-next-line import-x/no-deprecated -- Internal usage of deprecated class in factory
import { ConsensusQueueClass } from "./consensusQueue.js";
import type {
	IConsensusOrderedCollection,
	IConsensusOrderedCollectionFactory,
} from "./interfaces.js";
import { pkgVersion } from "./packageVersion.js";

/**
 * The factory that defines the consensus queue
 *
 * @internal
 */
export class ConsensusQueueFactory implements IConsensusOrderedCollectionFactory {
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

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<IConsensusOrderedCollection> {
		// eslint-disable-next-line import-x/no-deprecated -- Internal usage of deprecated class
		const collection = new ConsensusQueueClass(id, runtime, attributes);
		await collection.load(services);
		return collection;
	}

	public create(document: IFluidDataStoreRuntime, id: string): IConsensusOrderedCollection {
		// eslint-disable-next-line import-x/no-deprecated -- Internal usage of deprecated class
		const collection = new ConsensusQueueClass(id, document, this.attributes);
		collection.initializeLocal();
		return collection;
	}
}

/**
 * {@inheritDoc ConsensusQueueClass}
 * @legacy @beta
 */
export const ConsensusQueue = createSharedObjectKind(ConsensusQueueFactory);

/**
 * {@inheritDoc ConsensusQueueClass}
 * @legacy @beta
 */
// TODO: #22835 Use undefined instead of any (breaking change)
// eslint-disable-next-line @typescript-eslint/no-explicit-any, import-x/no-deprecated
export type ConsensusQueue<T = any> = ConsensusQueueClass<T>;

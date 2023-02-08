/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IChannelAttributes,
	IFluidDataStoreRuntime,
	IChannelServices,
} from "@fluidframework/datastore-definitions";
import { ConsensusQueue } from "./consensusQueue";
import { IConsensusOrderedCollection, IConsensusOrderedCollectionFactory } from "./interfaces";
import { pkgVersion } from "./packageVersion";

/**
 * The factory that defines the consensus queue
 */
export class ConsensusQueueFactory implements IConsensusOrderedCollectionFactory {
	public static Type = "https://graph.microsoft.com/types/consensus-queue";

	public static readonly Attributes: IChannelAttributes = {
		type: ConsensusQueueFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};

	public get type() {
		return ConsensusQueueFactory.Type;
	}

	public get attributes() {
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
		const collection = new ConsensusQueue(id, runtime, attributes);
		await collection.load(services);
		return collection;
	}

	public create(document: IFluidDataStoreRuntime, id: string): IConsensusOrderedCollection {
		const collection = new ConsensusQueue(id, document, this.attributes);
		collection.initializeLocal();
		return collection;
	}
}

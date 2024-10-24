/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IChannelAttributes,
	IFluidDataStoreRuntime,
	type IChannelFactory,
	IChannelServices,
} from "@fluidframework/datastore-definitions/internal";
import { createSharedObjectKind } from "@fluidframework/shared-object-base/internal";

import { ConsensusRegisterCollection as ConsensusRegisterCollectionClass } from "./consensusRegisterCollection.js";
import { IConsensusRegisterCollection } from "./interfaces.js";
import { pkgVersion } from "./packageVersion.js";

/**
 * The factory that defines the consensus queue.
 * @legacy
 * @alpha
 */
export class ConsensusRegisterCollectionFactory
	implements IChannelFactory<IConsensusRegisterCollection>
{
	public static Type = "https://graph.microsoft.com/types/consensus-register-collection";

	public static readonly Attributes: IChannelAttributes = {
		type: ConsensusRegisterCollectionFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};

	public get type() {
		return ConsensusRegisterCollectionFactory.Type;
	}

	public get attributes() {
		return ConsensusRegisterCollectionFactory.Attributes;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<IConsensusRegisterCollection> {
		const collection = new ConsensusRegisterCollectionClass(id, runtime, attributes);
		await collection.load(services);
		return collection;
	}

	public create(document: IFluidDataStoreRuntime, id: string): IConsensusRegisterCollection {
		const collection = new ConsensusRegisterCollectionClass(
			id,
			document,
			ConsensusRegisterCollectionFactory.Attributes,
		);
		collection.initializeLocal();
		return collection;
	}
}

/**
 * {@inheritDoc IConsensusRegisterCollection}
 * @legacy
 * @alpha
 */
export const ConsensusRegisterCollection = createSharedObjectKind(
	ConsensusRegisterCollectionFactory,
);
/**
 * Compatibility alias for {@link IConsensusRegisterCollection}.
 * @legacy
 * @alpha
 */
export type ConsensusRegisterCollection<T> = IConsensusRegisterCollection<T>;

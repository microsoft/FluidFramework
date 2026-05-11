/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IChannelAttributes,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";

// eslint-disable-next-line import-x/no-deprecated -- Subclass of deprecated class
import { ConsensusOrderedCollection } from "./consensusOrderedCollection.js";
import type { IOrderedCollection } from "./interfaces.js";
import { SnapshotableArray } from "./snapshotableArray.js";

/**
 * An JS array based queue implementation that is the backing data structure for ConsensusQueue
 */
class SnapshotableQueue<T> extends SnapshotableArray<T> implements IOrderedCollection<T> {
	public add(value: T): void {
		this.data.push(value);
	}

	public remove(): T {
		if (this.size() === 0) {
			throw new Error("SnapshotableQueue is empty");
		}
		return this.data.shift() as T;
	}
}

/**
 * Implementation of a consensus stack
 *
 * An derived type of ConsensusOrderedCollection with a queue as the backing data and order.
 * @deprecated Use the `ConsensusQueue` singleton and {@link IConsensusOrderedCollection} for typing. This implementation class will be removed in a future release.
 * @legacy @beta
 */
// TODO: #22835 Use undefined instead of any (breaking change)
// eslint-disable-next-line @typescript-eslint/no-explicit-any, import-x/no-deprecated
export class ConsensusQueueClass<T = any> extends ConsensusOrderedCollection<T> {
	/**
	 * Constructs a new consensus queue. If the object is non-local an id and service interfaces will
	 * be provided
	 */
	public constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
	) {
		super(id, runtime, attributes, new SnapshotableQueue<T>());
	}
}

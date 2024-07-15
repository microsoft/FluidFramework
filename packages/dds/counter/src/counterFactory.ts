/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
	IChannelServices,
} from "@fluidframework/datastore-definitions/internal";
import { createSharedObjectKind } from "@fluidframework/shared-object-base/internal";

import { SharedCounter as SharedCounterClass } from "./counter.js";
import type { ISharedCounter } from "./interfaces.js";
import { pkgVersion } from "./packageVersion.js";

/**
 * {@link @fluidframework/datastore-definitions#IChannelFactory} for {@link SharedCounter}.
 *
 * @sealed
 */
export class CounterFactory implements IChannelFactory<ISharedCounter> {
	/**
	 * Static value for {@link CounterFactory."type"}.
	 */
	public static readonly Type = "https://graph.microsoft.com/types/counter";

	/**
	 * Static value for {@link CounterFactory.attributes}.
	 */
	public static readonly Attributes: IChannelAttributes = {
		type: CounterFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory."type"}
	 */
	public get type(): string {
		return CounterFactory.Type;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.attributes}
	 */
	public get attributes(): IChannelAttributes {
		return CounterFactory.Attributes;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<ISharedCounter> {
		const counter = new SharedCounterClass(id, runtime, attributes);
		await counter.load(services);
		return counter;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.create}
	 */
	public create(document: IFluidDataStoreRuntime, id: string): ISharedCounter {
		const counter = new SharedCounterClass(id, document, this.attributes);
		counter.initializeLocal();
		return counter;
	}
}

/**
 * Entrypoint for {@link ISharedCounter} creation.
 * @legacy
 * @alpha
 */
export const SharedCounter = createSharedObjectKind<ISharedCounter>(CounterFactory);

/**
 * Alias for {@link ISharedCounter} for compatibility.
 * @legacy
 * @alpha
 */
export type SharedCounter = ISharedCounter;

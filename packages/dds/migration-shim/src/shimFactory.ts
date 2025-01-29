/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
	IChannelServices,
	IChannel,
} from "@fluidframework/datastore-definitions/internal";

import type { MigrationOptions, MigrationSet, MigrationShim } from "./shim.js";

/**
 *
 */
export class ShimFactory<in out TFrom> implements IChannelFactory<MigrationShim> {
	#fromFactory: IChannelFactory<TFrom>;
	public constructor(public readonly options: MigrationSet<TFrom>) {
		this.#fromFactory = options.from.getFactory();
	}

	public get type(): string {
		return this.#fromFactory.type;
	}

	public get attributes(): IChannelAttributes {
		// TODO: is this good? MAybe it should do something here which will prevent non adapter factories from opening it later?
		return this.#fromFactory.attributes;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
	 */
	public async load<Id extends string>(
		runtime: IFluidDataStoreRuntime,
		id: Id,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<MigrationShim & IChannel> {
		// TODO: support new format
		const old = await this.#fromFactory.load(runtime, id, services, attributes);

		const adapted = this.options.selector(id).beforeAdapter(old) as MigrationShim & IChannel;
		return adapted;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.create}
	 */
	public create<Id extends string>(
		runtime: IFluidDataStoreRuntime,
		id: Id,
	): MigrationShim & IChannel {
		// TODO: support new format
		const old = this.#fromFactory.create(runtime, id);
		const adapted = this.options.selector(id).beforeAdapter(old) as MigrationShim & IChannel;
		return adapted;
	}
}

/**
 *
 */
export type GetCommon<
	TMigrationSelector extends (id: ID) => MigrationOptions<never, unknown, unknown>,
	ID = string,
> = ReturnType<ReturnType<TMigrationSelector>["beforeAdapter" | "afterAdapter"]>;

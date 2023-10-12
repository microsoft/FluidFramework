/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type IChannelAttributes,
	type IFluidDataStoreRuntime,
	type IChannelServices,
	type IChannelFactory,
} from "@fluidframework/datastore-definitions";
import {
	type SharedTreeFactory as LegacySharedTreeFactory,
	type SharedTree as LegacySharedTree,
} from "@fluid-experimental/tree";
import { type SharedTreeFactory, type ISharedTree } from "@fluid-experimental/tree2";
import { Shim } from "./shim";

/**
 * {@link @fluidframework/datastore-definitions#IChannelFactory} for {@link Shim}.
 *
 * Creates the migration shim that allows a migration from legacy shared tree to shared tree.
 * Its only concern is creating a pre-migration shim that can hot swap from one DDS to a new DDS.
 * 1. pre-migration
 *
 * @sealed
 */
export class ShimFactory implements IChannelFactory {
	public constructor(
		private readonly oldFactory: LegacySharedTreeFactory,
		private readonly newFactory: SharedTreeFactory,
		private readonly populateNewChannelFn: (
			oldChannel: LegacySharedTree,
			newChannel: ISharedTree,
		) => void,
	) {}

	/**
	 * Can only load the LegacySharedTree
	 *
	 * {@link @fluidframework/datastore-definitions#IChannelFactory."type"}
	 */
	public get type(): string {
		return this.oldFactory.type;
	}

	/**
	 * Should be the LegacySharedTree attributes
	 *
	 * {@link @fluidframework/datastore-definitions#IChannelFactory.attributes}
	 */
	public get attributes(): IChannelAttributes {
		return this.oldFactory.attributes;
	}

	/**
	 * {@link @fluidframework/datastore-definitions#IChannelFactory.load}
	 *
	 * Should be loading the Shim
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		_attributes: IChannelAttributes,
	): Promise<Shim> {
		const shim = new Shim(
			id,
			runtime,
			this.oldFactory,
			this.newFactory,
			this.populateNewChannelFn,
		);
		// If we make the decision here, that means that we need to also make sure that shim summarizes properly.
		await shim.load(services);
		return shim;
	}

	/**
	 * {@link @fluidframework/datastore-definitions#IChannelFactory.create}
	 *
	 * Create Shim that can hot swap from one DDS to a new DDS.
	 */
	public create(runtime: IFluidDataStoreRuntime, id: string): Shim {
		const shim = new Shim(
			id,
			runtime,
			this.oldFactory,
			this.newFactory,
			this.populateNewChannelFn,
		);
		shim.create();
		return shim;
	}
}

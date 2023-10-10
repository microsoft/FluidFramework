/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
	type IChannelAttributes,
	type IFluidDataStoreRuntime,
	type IChannelServices,
	type IChannelFactory,
} from "@fluidframework/datastore-definitions";

import { type SharedTreeFactory } from "@fluid-experimental/tree2";
import { SharedTreeShim } from "./sharedTreeShim";
import { attributesMatch } from "./utils";

/**
 * {@link @fluidframework/datastore-definitions#IChannelFactory} for {@link SharedTreeShim}.
 *
 * Creates the migration shim that allows a migration from legacy shared tree to shared tree.
 * Note: There may be a need for 3 different factories for different parts of the migration.
 * That or three different shims. Potentially we can just do 2 as 2 and 3 can be combined.
 * 1. pre-migration
 * 2. after a summary has been generated but there may still be potential v1 ops
 * 3. post-migration after a summary has been generated and the msn has moved far enough forward for only v2 ops
 *
 * @sealed
 */
export class SharedTreeShimFactory implements IChannelFactory {
	public constructor(private readonly factory: SharedTreeFactory) {}

	/**
	 * Can only load the new SharedTree
	 *
	 * {@link @fluidframework/datastore-definitions#IChannelFactory."type"}
	 */
	public get type(): string {
		return this.factory.type;
	}

	/**
	 * Should be the new SharedTree attributes
	 *
	 * {@link @fluidframework/datastore-definitions#IChannelFactory.attributes}
	 */
	public get attributes(): IChannelAttributes {
		return this.factory.attributes;
	}

	/**
	 * {@link @fluidframework/datastore-definitions#IChannelFactory.load}
	 *
	 * Should be loading the SharedTreeShim from a new SharedTree snapshot only
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<SharedTreeShim> {
		assert(attributesMatch(attributes, this.factory.attributes), "Attributes do not match");
		const sharedTree = await this.factory.load(runtime, id, services, attributes);
		const sharedTreeShim = new SharedTreeShim(id, sharedTree);
		// TODO: sharedTreeShim.load so we know to process v1 ops?
		return sharedTreeShim;
	}

	/**
	 * {@link @fluidframework/datastore-definitions#IChannelFactory.create}
	 *
	 * Should be only creating the SharedTreeShim
	 */
	public create(runtime: IFluidDataStoreRuntime, id: string): SharedTreeShim {
		const sharedTree = this.factory.create(runtime, id);
		const sharedTreeShim = new SharedTreeShim(id, sharedTree);
		return sharedTreeShim;
	}
}

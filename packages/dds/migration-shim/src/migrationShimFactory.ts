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
import {
	type SharedTreeFactory as LegacySharedTreeFactory,
	type SharedTree as LegacySharedTree,
} from "@fluid-experimental/tree";
import { type SharedTreeFactory, type ISharedTree } from "@fluid-experimental/tree2";
import { MigrationShim } from "./migrationShim";
import { attributesMatch } from "./utils";

/**
 * {@link @fluidframework/datastore-definitions#IChannelFactory} for {@link MigrationShim}.
 *
 * Creates the migration shim that allows a migration from legacy shared tree to shared tree.
 * Its only concern is creating a pre-migration shim that can hot swap from one DDS to a new DDS.
 * 1. pre-migration
 *
 * @sealed
 * @internal
 */
export class MigrationShimFactory implements IChannelFactory {
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
	 * Should be loading the MigrationShim - it should just load the old tree as this makes the factory's
	 * responsibility simple. Trying to follow the Single Responsibility Principle here.
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<MigrationShim> {
		assert(attributesMatch(attributes, this.oldFactory.attributes), "Attributes do not match");
		const migrationShim = new MigrationShim(
			id,
			runtime,
			this.oldFactory,
			this.newFactory,
			this.populateNewChannelFn,
		);
		await migrationShim.load(services);
		return migrationShim;
	}

	/**
	 * {@link @fluidframework/datastore-definitions#IChannelFactory.create}
	 *
	 * Create MigrationShim that can hot swap from one DDS to a new DDS. We want the capability of creating an old tree
	 * as when this code rolls out, there may be clients on the v1 version of the code, and we may want to have a dark
	 * rollout capability.
	 */
	public create(runtime: IFluidDataStoreRuntime, id: string): MigrationShim {
		const migrationShim = new MigrationShim(
			id,
			runtime,
			this.oldFactory,
			this.newFactory,
			this.populateNewChannelFn,
		);
		migrationShim.create();
		return migrationShim;
	}
}

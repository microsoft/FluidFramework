/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type IChannelAttributes,
	type IChannelFactory,
	type IChannelServices,
	type IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import { readAndParse } from "@fluidframework/driver-utils";
import {
	type TraitLabel,
	type BuildNode,
	type SharedTree as LegacySharedTree,
	Change,
	StablePlace,
} from "@fluid-experimental/tree";
import { type MigrationShimFactory } from "../migrationShimFactory";
import { type SharedTreeShimFactory } from "../sharedTreeShimFactory";
import { type MigrationShim } from "../migrationShim";
import { type SharedTreeShim } from "../sharedTreeShim";
const attributesBlobKey = ".attributes";

/**
 * Legacy Shared Tree Node Id
 */
export const someNodeId = "someNodeId" as TraitLabel;

/**
 * This factory will pretend to act as a regular channelContext registry. This is for testing purposes only.
 */
export class MigrationRegistryFactory implements IChannelFactory {
	private currentFactory: MigrationShimFactory | SharedTreeShimFactory;
	public constructor(
		private readonly migrationFactory: MigrationShimFactory,
		private readonly sharedTreeFactory: SharedTreeShimFactory,
	) {
		this.currentFactory = migrationFactory;
	}

	public get type(): string {
		return this.currentFactory.type;
	}
	public get attributes(): IChannelAttributes {
		return this.currentFactory.attributes;
	}
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		channelAttributes: Readonly<IChannelAttributes>,
	): Promise<MigrationShim | SharedTreeShim> {
		if (await services.objectStorage.contains(attributesBlobKey)) {
			const attributes = await readAndParse<IChannelAttributes | undefined>(
				services.objectStorage,
				attributesBlobKey,
			);
			if (attributes !== undefined && attributes.type === this.sharedTreeFactory.type) {
				this.currentFactory = this.sharedTreeFactory;
				return this.sharedTreeFactory.load(runtime, id, services, attributes);
			}
		}
		return this.migrationFactory.load(runtime, id, services, channelAttributes);
	}
	public create(runtime: IFluidDataStoreRuntime, id: string): MigrationShim | SharedTreeShim {
		this.currentFactory = this.migrationFactory;
		const shim = this.migrationFactory.create(runtime, id);
		const tree = shim.currentTree as LegacySharedTree;

		// Create node if it does not exist
		const quantityNode: BuildNode = {
			definition: someNodeId,
			traits: {
				quantity: {
					definition: "quantity",
					payload: 0,
				},
			},
		};
		tree.applyEdit(
			Change.insertTree(
				quantityNode,
				StablePlace.atStartOf({
					parent: tree.currentView.root,
					label: someNodeId,
				}),
			),
		);
		return shim;
	}
}

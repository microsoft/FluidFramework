/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidDataStoreRuntime } from "@fluidframework/datastore/internal";
import type { IChannelFactory } from "@fluidframework/datastore-definitions/internal";
import type { NamedFluidDataStoreRegistryEntries } from "@fluidframework/runtime-definitions/internal";
import type { FluidObjectSymbolProvider } from "@fluidframework/synthesize/internal";
import {
	SharedTree,
	SharedTreeFactoryType,
	type ImplicitFieldSchema,
} from "@fluidframework/tree/internal";

import type {
	DataObjectTypes,
	IDataObjectProps,
	TreeDataObject,
} from "../data-objects/index.js";

import { PureDataObjectFactory } from "./pureDataObjectFactory.js";

/**
 * {@link PureDataObjectFactory} for creating {@link TreeDataObject}s.
 *
 * @remarks
 * Facilitates {@link TreeDataObject}'s features (such as its {@link @fluidframework/tree#SharedTree}) by
 * ensuring relevant shared objects etc are available to the factory.
 *
 * @typeParam TSchema - The tree schema for the {@link TreeDataObject}.
 * @typeParam TDataObject - The concrete {@link TreeDataObject} type.
 *
 * @internal
 */
export class TreeDataObjectFactory<
	TSchema extends ImplicitFieldSchema,
	TDataObject extends TreeDataObject<TSchema>,
> extends PureDataObjectFactory<TDataObject> {
	public constructor(
		type: string,
		ctor: new (props: IDataObjectProps) => TDataObject,
		sharedObjects: readonly IChannelFactory[] = [],
		optionalProviders: FluidObjectSymbolProvider<DataObjectTypes["OptionalProviders"]>,
		registryEntries?: NamedFluidDataStoreRegistryEntries,
		runtimeFactory: typeof FluidDataStoreRuntime = FluidDataStoreRuntime,
	) {
		const mergedObjects = [...sharedObjects];

		if (!sharedObjects.some((factory) => factory.type === SharedTreeFactoryType)) {
			mergedObjects.push(SharedTree.getFactory());
		}

		super(type, ctor, mergedObjects, optionalProviders, registryEntries, runtimeFactory);
	}
}

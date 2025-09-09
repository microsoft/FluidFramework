/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FluidDataStoreRuntime } from "@fluidframework/datastore/internal";
import type { IChannelFactory } from "@fluidframework/datastore-definitions/internal";
import type { NamedFluidDataStoreRegistryEntries } from "@fluidframework/runtime-definitions/internal";
import type { FluidObjectSymbolProvider } from "@fluidframework/synthesize/internal";

import type {
	DataObject,
	DataObjectTypes,
	IDataObjectProps,
	ModelDescriptor,
	RootDirectoryView,
} from "../data-objects/index.js";
import { MigrationDataObjectFactory } from "../index.js";

import type { DataObjectFactoryProps } from "./pureDataObjectFactory.js";

/**
 * DataObjectFactory is the IFluidDataStoreFactory for use with DataObjects.
 * It facilitates DataObject's features (such as its shared directory) by
 * ensuring relevant shared objects etc are available to the factory.
 *
 * @typeParam TObj - DataObject (concrete type)
 * @typeParam I - The input types for the DataObject
 * @legacy
 * @beta
 */
export class DataObjectFactory<
	TObj extends DataObject<I>,
	I extends DataObjectTypes = DataObjectTypes,
> extends MigrationDataObjectFactory<TObj, RootDirectoryView, I> {
	/**
	 * @remarks Use the props object based constructor instead.
	 * No new features will be added to this constructor,
	 * and it will eventually be deprecated and removed.
	 */
	public constructor(
		type: string,
		ctor: new (props: IDataObjectProps<I>) => TObj,
		sharedObjects?: readonly IChannelFactory[],
		optionalProviders?: FluidObjectSymbolProvider<I["OptionalProviders"]>,
		registryEntries?: NamedFluidDataStoreRegistryEntries,
		runtimeFactory?: typeof FluidDataStoreRuntime,
	);
	public constructor(props: DataObjectFactoryProps<TObj, I>);
	public constructor(
		propsOrType: DataObjectFactoryProps<TObj, I> | string,
		maybeCtor?: new (doProps: IDataObjectProps<I>) => TObj,
		maybeSharedObjects?: readonly IChannelFactory[],
		maybeOptionalProviders?: FluidObjectSymbolProvider<I["OptionalProviders"]>,
		maybeRegistryEntries?: NamedFluidDataStoreRegistryEntries,
		maybeRuntimeFactory?: typeof FluidDataStoreRuntime,
	) {
		const newProps =
			typeof propsOrType === "string"
				? {
						type: propsOrType,
						// both the arg and props base constructor require this param
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						ctor: maybeCtor!,
						sharedObjects: maybeSharedObjects,
						optionalProviders: maybeOptionalProviders,
						registryEntries: maybeRegistryEntries,
						runtimeClass: maybeRuntimeFactory,
					}
				: { ...propsOrType };

		super({
			...newProps,
			// This cast is safe because TObj extends DataObject, which has static modelDescriptors
			ctor: newProps.ctor as (new (
				doProps: IDataObjectProps<I>,
			) => TObj) & {
				modelDescriptors: readonly [
					ModelDescriptor<RootDirectoryView>,
					...ModelDescriptor<RootDirectoryView>[],
				];
			}, //* TODO: Can we do something to avoid needing this cast?
			asyncGetDataForMigration: async () => {
				throw new Error("No migration supported");
			},
			canPerformMigration: async () => false,
			migrateDataObject: () => {
				throw new Error("No migration supported");
			},
		});
	}
}

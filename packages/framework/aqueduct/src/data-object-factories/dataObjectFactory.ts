/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FluidDataStoreRuntime } from "@fluidframework/datastore/internal";
import type { IChannelFactory } from "@fluidframework/datastore-definitions/internal";
import {
	SharedMap,
	DirectoryFactory,
	MapFactory,
	SharedDirectory,
} from "@fluidframework/map/internal";
import type { NamedFluidDataStoreRegistryEntries } from "@fluidframework/runtime-definitions/internal";
import type { FluidObjectSymbolProvider } from "@fluidframework/synthesize/internal";

import type { DataObject, DataObjectTypes, IDataObjectProps } from "../data-objects/index.js";

import {
	PureDataObjectFactory,
	type DataObjectFactoryProps,
} from "./pureDataObjectFactory.js";

/**
 * Alters the props used for PureDataObjectFactory to ensure the resulting factory will support DataObject features.
 * @param props - Props to be passed to the PureDataObjectFactory constructor which need to be altered for the resulting factory to work for DataObjects
 * @returns The altered props (shallow copy) with the necessary alterations made
 */
export function getAlteredPropsSupportingDataObject<
	TObj extends DataObject<I>,
	I extends DataObjectTypes = DataObjectTypes,
>(props: DataObjectFactoryProps<TObj, I>): DataObjectFactoryProps<TObj, I> {
	const sharedObjects = [...(props.sharedObjects ?? [])];

	if (!sharedObjects.some((factory) => factory.type === DirectoryFactory.Type)) {
		// User did not register for directory
		sharedObjects.push(SharedDirectory.getFactory());
	}

	// TODO: Remove SharedMap factory when compatibility with SharedMap DataObject is no longer needed in 0.10
	if (!sharedObjects.some((factory) => factory.type === MapFactory.Type)) {
		// User did not register for map
		sharedObjects.push(SharedMap.getFactory());
	}

	return { ...props, sharedObjects };
}

/**
 * DataObjectFactory is the IFluidDataStoreFactory for use with DataObjects.
 * It facilitates DataObject's features (such as its shared directory) by
 * ensuring relevant shared objects etc are available to the factory.
 *
 * @remarks - Will be deprecated. Use PureDataObjectFactory with getAlteredPropsSupportingDataObject instead.
 *
 * @typeParam TObj - DataObject (concrete type)
 * @typeParam I - The input types for the DataObject
 * @legacy
 * @beta
 */
export class DataObjectFactory<
	TObj extends DataObject<I>,
	I extends DataObjectTypes = DataObjectTypes,
> extends PureDataObjectFactory<TObj, I> {
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

		super(getAlteredPropsSupportingDataObject(newProps));
	}
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IChannelServices,
	IChannelAttributes,
	IFluidDataStoreRuntime,
	// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
	IChannelFactory,
} from "@fluidframework/datastore-definitions/internal";
import {
	// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
	createSharedObjectKind,
	// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
	type ISharedObjectKind,
	type SharedObjectKind,
} from "@fluidframework/shared-object-base/internal";

import { pkgVersion } from "../packageVersion.js";

import type { ISharedArray, SerializableTypeForSharedArray } from "./interfaces.js";
import { SharedArrayClass } from "./sharedArray.js";

/**
 * @internal
 */
export class SharedArrayFactory<T extends SerializableTypeForSharedArray>
	// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
	implements IChannelFactory
{
	public static readonly Type = "https://graph.microsoft.com/types/SharedArray";

	public static readonly Attributes: IChannelAttributes = {
		type: SharedArrayFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};

	public get type(): string {
		return SharedArrayFactory.Type;
	}

	public get attributes(): IChannelAttributes {
		return SharedArrayFactory.Attributes;
	}

	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<ISharedArray<T>> {
		/**
		 * * The SharedArray
		 */
		const sharedArray = new SharedArrayClass<T>(id, runtime, attributes);
		await sharedArray.load(services);
		return sharedArray;
	}

	public create(document: IFluidDataStoreRuntime, id: string): ISharedArray<T> {
		/**
		 * * The SharedArray
		 */
		const sharedArray = new SharedArrayClass<T>(id, document, this.attributes);
		sharedArray.initializeLocal();
		return sharedArray;
	}
}

/**
 * Entrypoint for {@link ISharedArray} creation.
 * @legacy @beta
 */
// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
export const SharedArray: ISharedObjectKind<ISharedArray<SerializableTypeForSharedArray>> &
	SharedObjectKind<ISharedArray<SerializableTypeForSharedArray>> =
	// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
	createSharedObjectKind<ISharedArray<SerializableTypeForSharedArray>>(SharedArrayFactory);

/**
 * Entrypoint for {@link ISharedArray} creation.
 * @legacy @beta
 */
export const SharedArrayBuilder = <
	T extends SerializableTypeForSharedArray,
	// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
>(): ISharedObjectKind<ISharedArray<T>> & SharedObjectKind<ISharedArray<T>> => {
	const factory = SharedArrayFactory<T>;
	// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
	return createSharedObjectKind<ISharedArray<T>>(factory);
};

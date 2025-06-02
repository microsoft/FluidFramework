/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IChannelServices,
	IChannelAttributes,
	IFluidDataStoreRuntime,
	IChannelFactory,
} from "@fluidframework/datastore-definitions/internal";
import {
	createSharedObjectKind,
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
 * @legacy
 * @alpha
 */
export const SharedArray: ISharedObjectKind<ISharedArray<SerializableTypeForSharedArray>> &
	SharedObjectKind<ISharedArray<SerializableTypeForSharedArray>> =
	createSharedObjectKind<ISharedArray<SerializableTypeForSharedArray>>(SharedArrayFactory);

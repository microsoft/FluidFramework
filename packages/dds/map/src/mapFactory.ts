/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
	IChannelServices,
} from "@fluidframework/datastore-definitions/internal";
import { createSharedObjectKind } from "@fluidframework/shared-object-base/internal";

import type { ISharedMap } from "./interfaces.js";
import { SharedMap as SharedMapInternal } from "./map.js";
import { pkgVersion } from "./packageVersion.js";

/**
 * {@link @fluidframework/datastore-definitions#IChannelFactory} for {@link ISharedMap}.
 * @privateRemarks
 * TODO: AB#35245: Deprecate and stop exporting this class.
 * @sealed
 * @legacy
 * @alpha
 */
export class MapFactory implements IChannelFactory<ISharedMap> {
	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory."type"}
	 */
	public static readonly Type = "https://graph.microsoft.com/types/map";

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.attributes}
	 */
	public static readonly Attributes: IChannelAttributes = {
		type: MapFactory.Type,
		snapshotFormatVersion: "0.2",
		packageVersion: pkgVersion,
	};

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory."type"}
	 */
	public get type(): string {
		return MapFactory.Type;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.attributes}
	 */
	public get attributes(): IChannelAttributes {
		return MapFactory.Attributes;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<ISharedMap> {
		const map = new SharedMapInternal(id, runtime, attributes);
		await map.load(services);

		return map;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.create}
	 */
	public create(runtime: IFluidDataStoreRuntime, id: string): ISharedMap {
		const map = new SharedMapInternal(id, runtime, MapFactory.Attributes);
		map.initializeLocal();

		return map;
	}
}

/**
 * Entrypoint for {@link ISharedMap} creation.
 * @legacy
 * @alpha
 */
export const SharedMap = createSharedObjectKind<ISharedMap>(MapFactory);

/**
 * Entrypoint for {@link ISharedMap} creation.
 * @legacy
 * @alpha
 * @privateRemarks
 * This alias is for legacy compat from when the SharedMap class was exported as public.
 */
export type SharedMap = ISharedMap;

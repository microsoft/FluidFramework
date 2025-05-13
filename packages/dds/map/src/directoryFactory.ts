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

import { SharedDirectory as SharedDirectoryInternal } from "./directory.js";
import type { ISharedDirectory } from "./interfaces.js";
import { pkgVersion } from "./packageVersion.js";

/**
 * {@link @fluidframework/datastore-definitions#IChannelFactory} for {@link ISharedDirectory}.
 * @privateRemarks
 * TODO: AB#35245: Deprecate and stop exporting this class.
 * @sealed
 * @legacy
 * @alpha
 */
export class DirectoryFactory implements IChannelFactory<ISharedDirectory> {
	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory."type"}
	 */
	public static readonly Type = "https://graph.microsoft.com/types/directory";

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.attributes}
	 */
	public static readonly Attributes: IChannelAttributes = {
		type: DirectoryFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory."type"}
	 */
	public get type(): string {
		return DirectoryFactory.Type;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.attributes}
	 */
	public get attributes(): IChannelAttributes {
		return DirectoryFactory.Attributes;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<ISharedDirectory> {
		const directory = new SharedDirectoryInternal(id, runtime, attributes);
		await directory.load(services);

		return directory;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.create}
	 */
	public create(runtime: IFluidDataStoreRuntime, id: string): ISharedDirectory {
		const directory = new SharedDirectoryInternal(id, runtime, DirectoryFactory.Attributes);
		directory.initializeLocal();

		return directory;
	}
}

/**
 * Entrypoint for {@link ISharedDirectory} creation.
 * @legacy
 * @alpha
 */
export const SharedDirectory = createSharedObjectKind<ISharedDirectory>(DirectoryFactory);

/**
 * Entrypoint for {@link ISharedDirectory} creation.
 * @legacy
 * @alpha
 * @privateRemarks
 * This alias is for legacy compat from when the SharedDirectory class was exported as public.
 */
export type SharedDirectory = ISharedDirectory;

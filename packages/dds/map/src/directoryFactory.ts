/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IChannelAttributes,
	IChannelFactory,
	IChannelServices,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import type { ISharedObjectKind } from "@fluidframework/shared-object-base";

import { SharedDirectory as SharedDirectoryInternal } from "./directory.js";
import type { ISharedDirectory } from "./interfaces.js";
import { pkgVersion } from "./packageVersion.js";

/**
 * {@link @fluidframework/datastore-definitions#IChannelFactory} for {@link ISharedDirectory}.
 *
 * @sealed
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
 * @sealed
 * @alpha
 */
export const SharedDirectory: ISharedObjectKind<ISharedDirectory> = {
	/**
	 * Create a new shared directory
	 *
	 * @param runtime - Data store runtime the new shared directory belongs to
	 * @param id - Optional name of the shared directory
	 * @returns Newly create shared directory (but not attached yet)
	 *
	 * @example
	 * To create a `SharedDirectory`, call the static create method:
	 *
	 * ```typescript
	 * const myDirectory = SharedDirectory.create(this.runtime, id);
	 * ```
	 */
	create(runtime: IFluidDataStoreRuntime, id?: string): ISharedDirectory {
		return runtime.createChannel(id, DirectoryFactory.Type) as ISharedDirectory;
	},

	/**
	 * Get a factory for SharedDirectory to register with the data store.
	 *
	 * @returns A factory that creates and load SharedDirectory
	 */
	getFactory(): IChannelFactory<ISharedDirectory> {
		return new DirectoryFactory();
	},
};

/**
 * Entrypoint for {@link ISharedDirectory} creation.
 * @alpha
 * @deprecated Use ISharedDirectory instead.
 * @privateRemarks
 * This alias is for legacy compat from when the SharedDirectory class was exported as public.
 */
export type SharedDirectory = ISharedDirectory;

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IChannelAttributes,
	IFluidDataStoreRuntime,
	IChannelServices,
	IChannelFactory,
} from "@fluidframework/datastore-definitions";
import { ISharedObject } from "@fluidframework/shared-object-base";
import { Ink } from "./ink.js";
import { pkgVersion } from "./packageVersion.js";

/**
 * Factory for Ink.
 * @sealed
 * @internal
 */
export class InkFactory implements IChannelFactory {
	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory."type"}
	 */
	public static Type = "https://graph.microsoft.com/types/ink";

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.attributes}
	 */
	public static readonly Attributes: IChannelAttributes = {
		type: InkFactory.Type,
		snapshotFormatVersion: "0.2",
		packageVersion: pkgVersion,
	};

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory."type"}
	 */
	public get type() {
		return InkFactory.Type;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.attributes}
	 */
	public get attributes() {
		return InkFactory.Attributes;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<ISharedObject> {
		const ink = new Ink(runtime, id, attributes);
		await ink.load(services);

		return ink;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.create}
	 */
	public create(runtime: IFluidDataStoreRuntime, id: string): ISharedObject {
		const ink = new Ink(runtime, id, InkFactory.Attributes);
		ink.initializeLocal();

		return ink;
	}
}

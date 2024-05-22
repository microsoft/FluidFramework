/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IChannel,
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
	IChannelServices,
} from "@fluidframework/datastore-definitions/internal";

import { SharedJson1 } from "./json1.js";
import { pkgVersion } from "./packageVersion.js";

/**
 * @internal
 */
export class Json1Factory implements IChannelFactory {
	public static Type = "https://graph.microsoft.com/types/sharedjson1";

	public static readonly Attributes: IChannelAttributes = {
		type: Json1Factory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};

	public get type() {
		return Json1Factory.Type;
	}
	public get attributes() {
		return Json1Factory.Attributes;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<IChannel> {
		const instance = new SharedJson1(id, runtime, attributes);
		await instance.load(services);
		return instance;
	}

	public create(runtime: IFluidDataStoreRuntime, id: string): IChannel {
		const instance = new SharedJson1(id, runtime, this.attributes);
		instance.initializeLocal();
		return instance;
	}
}

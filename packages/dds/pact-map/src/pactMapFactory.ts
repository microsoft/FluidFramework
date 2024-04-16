/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type IChannelAttributes,
	type IChannelFactory,
	type IChannelServices,
	type IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";

import { type IPactMap } from "./interfaces.js";
import { pkgVersion } from "./packageVersion.js";
import { PactMap } from "./pactMap.js";

/**
 * The factory that produces the PactMap
 */
export class PactMapFactory implements IChannelFactory {
	public static readonly Type = "https://graph.microsoft.com/types/pact-map";

	public static readonly Attributes: IChannelAttributes = {
		type: PactMapFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};

	public get type(): string {
		return PactMapFactory.Type;
	}

	public get attributes(): IChannelAttributes {
		return PactMapFactory.Attributes;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<IPactMap> {
		const pactMap = new PactMap(id, runtime, attributes);
		await pactMap.load(services);
		return pactMap;
	}

	public create(document: IFluidDataStoreRuntime, id: string): IPactMap {
		const pactMap = new PactMap(id, document, this.attributes);
		pactMap.initializeLocal();
		return pactMap;
	}
}

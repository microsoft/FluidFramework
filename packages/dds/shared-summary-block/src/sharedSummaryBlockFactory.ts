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
import { pkgVersion } from "./packageVersion.js";
import { SharedSummaryBlock } from "./sharedSummaryBlock.js";

/**
 * The factory that defines the shared summary block.
 *
 * @sealed
 * @internal
 */
export class SharedSummaryBlockFactory implements IChannelFactory {
	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory."type"}
	 */
	public static readonly Type = "https://graph.microsoft.com/types/shared-summary-block";

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.attributes}
	 */
	public static readonly Attributes: IChannelAttributes = {
		type: SharedSummaryBlockFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory."type"}
	 */
	public get type() {
		return SharedSummaryBlockFactory.Type;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.attributes}
	 */
	public get attributes() {
		return SharedSummaryBlockFactory.Attributes;
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
		const sharedSummaryBlock = new SharedSummaryBlock(id, runtime, attributes);
		await sharedSummaryBlock.load(services);

		return sharedSummaryBlock;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.create}
	 */
	public create(runtime: IFluidDataStoreRuntime, id: string): ISharedObject {
		const sharedSummaryBlock = new SharedSummaryBlock(
			id,
			runtime,
			SharedSummaryBlockFactory.Attributes,
		);
		sharedSummaryBlock.initializeLocal();

		return sharedSummaryBlock;
	}
}

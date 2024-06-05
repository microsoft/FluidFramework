/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
	IChannelServices,
} from "@fluidframework/datastore-definitions/internal";
import { createSharedObjectKind } from "@fluidframework/shared-object-base/internal";

import type { ISharedSummaryBlock } from "./interfaces.js";
import { pkgVersion } from "./packageVersion.js";
import { SharedSummaryBlockClass } from "./sharedSummaryBlock.js";

/**
 * The factory that defines the shared summary block.
 */
export class SharedSummaryBlockFactory implements IChannelFactory<ISharedSummaryBlock> {
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
	): Promise<ISharedSummaryBlock> {
		const sharedSummaryBlock = new SharedSummaryBlockClass(id, runtime, attributes);
		await sharedSummaryBlock.load(services);

		return sharedSummaryBlock;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.create}
	 */
	public create(runtime: IFluidDataStoreRuntime, id: string): ISharedSummaryBlock {
		const sharedSummaryBlock = new SharedSummaryBlockClass(
			id,
			runtime,
			SharedSummaryBlockFactory.Attributes,
		);
		sharedSummaryBlock.initializeLocal();

		return sharedSummaryBlock;
	}
}

/**
 * {@inheritDoc ISharedSummaryBlock}
 * @alpha
 */
export const SharedSummaryBlock = createSharedObjectKind(SharedSummaryBlockFactory);

/**
 * {@inheritDoc ISharedSummaryBlock}
 * @alpha
 */
export type SharedSummaryBlock = ISharedSummaryBlock;

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IChannelAttributes,
	IFluidDataStoreRuntime,
	IChannelServices,
	IChannel,
	IChannelFactory,
} from "@fluidframework/datastore-definitions";
import { pkgVersion } from "./packageVersion";
import { SharedMatrix } from "./matrix";

export class SharedMatrixFactory implements IChannelFactory {
	public static Type = "https://graph.microsoft.com/types/sharedmatrix";

	public static readonly Attributes: IChannelAttributes = {
		type: SharedMatrixFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};

	public get type() {
		return SharedMatrixFactory.Type;
	}

	public get attributes() {
		return SharedMatrixFactory.Attributes;
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
		const matrix = new SharedMatrix(runtime, id, attributes);
		await matrix.load(services);
		return matrix;
	}

	public create(document: IFluidDataStoreRuntime, id: string): IChannel {
		const matrix = new SharedMatrix(document, id, this.attributes);
		matrix.initializeLocal();
		return matrix;
	}
}

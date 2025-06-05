/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IChannelAttributes,
	IFluidDataStoreRuntime,
	IChannelFactory,
	IChannelServices,
} from "@fluidframework/datastore-definitions/internal";

import { pkgVersion } from "../packageVersion.js";

import type { ISharedSignal } from "./interfaces.js";
import { SharedSignal } from "./sharedSignal.js";

/**
 * @internal
 */
export class SharedSignalFactory implements IChannelFactory {
	public static readonly Type: string = "https://graph.microsoft.com/types/signal";

	public static readonly Attributes: IChannelAttributes = {
		type: SharedSignalFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};

	public get type(): string {
		return SharedSignalFactory.Type;
	}

	public get attributes(): IChannelAttributes {
		return SharedSignalFactory.Attributes;
	}

	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<ISharedSignal> {
		const signal = new SharedSignal(id, runtime, attributes);
		await signal.load(services);
		return signal;
	}

	public create(document: IFluidDataStoreRuntime, id: string): ISharedSignal {
		const signal = new SharedSignal(id, document, this.attributes);
		signal.initializeLocal();
		return signal;
	}
}

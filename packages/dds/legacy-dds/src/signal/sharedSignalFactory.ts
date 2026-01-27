/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IChannelAttributes,
	IFluidDataStoreRuntime,
	// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
	IChannelFactory,
	IChannelServices,
} from "@fluidframework/datastore-definitions/internal";
// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
import { createSharedObjectKind } from "@fluidframework/shared-object-base/internal";

import { pkgVersion } from "../packageVersion.js";

import type { ISharedSignal } from "./interfaces.js";
import { SharedSignalClass } from "./sharedSignal.js";

/**
 * @internal
 */
// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
export class SharedSignalFactory implements IChannelFactory<ISharedSignal> {
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
		const signal = new SharedSignalClass(id, runtime, attributes);
		await signal.load(services);
		return signal;
	}

	public create(document: IFluidDataStoreRuntime, id: string): ISharedSignal {
		const signal = new SharedSignalClass(id, document, this.attributes);
		signal.initializeLocal();
		return signal;
	}
}

/**
 * Entrypoint for {@link ISharedSignal} creation.
 * @legacy @beta
 */
// eslint-disable-next-line import-x/no-deprecated -- can be removed once 2.100.0 is released and this API becomes internal
export const SharedSignal = createSharedObjectKind<ISharedSignal>(SharedSignalFactory);

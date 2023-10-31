/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type IDeltaConnection,
	type IChannelServices,
	type IChannelStorageService,
} from "@fluidframework/datastore-definitions";
import { ShimDeltaConnection } from "./shimDeltaConnection.js";
import { type IShimDeltaHandler } from "./types.js";

/**
 * ShimChannelServices wraps an existing IChannelServices object and provides a new ShimDeltaConnection
 * object in place of the original deltaConnection object.
 *
 * ShimChannelServices allows us to encapsulate all the wrapping logic without having to modify the original services.
 *
 * At some point, in the SharedObject code we call this.services.deltaConnection.attach(this.handler). Therefore before
 * we call attach, we need to swap out the deltaConnection object for the ShimDeltaConnection object. This makes
 * it consistent as we will always be passing this shim
 */
export class ShimChannelServices implements IChannelServices {
	public constructor(channelServices: IChannelServices, shimDeltaHandler: IShimDeltaHandler) {
		this.deltaConnection = new ShimDeltaConnection(
			channelServices.deltaConnection,
			shimDeltaHandler,
		);
		this.objectStorage = channelServices.objectStorage;
	}
	public readonly deltaConnection: ShimDeltaConnection;
	public readonly objectStorage: IChannelStorageService;
}

/**
 * NoDeltasChannelServices wraps an existing IChannelServices object. During rehydration of a container, loading in a
 * detached state, we only want to connect to the deltaConnection once on attached. We also only want to set the
 * channel services once. This enables us to allow deltaHandler attach only once, even though there are flows that
 * call only load, only connect, and load and then connect.
 *
 * Steps:
 * 1. Rehydrate/load SharedObject in detached container runtime state
 * 2. Attach detached container runtime
 * 3. Connect SharedObject.
 *
 * Refer to SharedObject.load for the scenario.
 *
 * This potentially can be baked into the ShimChannelServices.
 *
 * TODO: convert this to a test and remove usage of this class
 */
export class NoDeltasChannelServices implements IChannelServices {
	public constructor(channelServices: IChannelServices) {
		this.objectStorage = channelServices.objectStorage;
	}

	public get deltaConnection(): IDeltaConnection {
		throw new Error("No deltaConnection available");
	}
	public readonly objectStorage: IChannelStorageService;
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type IDeltaConnection,
	type IChannelServices,
	type IChannelStorageService,
} from "@fluidframework/datastore-definitions";
import { SpannerDeltaConnection } from "./spannerDeltaConnection";

/**
 * SpannerChannelServices wraps an existing IChannelServices object and provides a new SpannerDeltaConnection
 * object in place of the original deltaConnection object.
 */
export class SpannerChannelServices implements IChannelServices {
	public constructor(channelServices: IChannelServices) {
		this.deltaConnection = new SpannerDeltaConnection(channelServices.deltaConnection);
		this.objectStorage = channelServices.objectStorage;
	}
	public readonly deltaConnection: SpannerDeltaConnection;
	public readonly objectStorage: IChannelStorageService;
}

/**
 * NoDeltasChannelServices wraps an existing IChannelServices object and provides a new objectStorage
 * object in place of the original deltaConnection object. During load, there's this detached state, we only want to
 * connect on attached. Thus this is here to catch us from making a mistake.
 *
 * This potentially can be baked into the SpannerChannelServices.
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

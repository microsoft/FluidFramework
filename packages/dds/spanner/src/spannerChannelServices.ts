/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
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

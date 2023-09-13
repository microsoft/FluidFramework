/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IChannelServices,
	IChannelStorageService,
	IDeltaConnection,
} from "@fluidframework/datastore-definitions";

export class LocalChannelServices implements IChannelServices {
	public get deltaConnection(): IDeltaConnection {
		throw new Error("Should not be retrieving delta storage when local");
	}
	constructor(public readonly objectStorage: IChannelStorageService) {}
}

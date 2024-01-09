/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils";
import { IChannel, IChannelFactory } from "@fluidframework/datastore-definitions";
import { IsoBuffer } from "@fluid-internal/client-utils";

const runtimeFactory = new MockContainerRuntimeFactory();

export function create(factory: IChannelFactory) {
	const dataStoreRuntime = new MockFluidDataStoreRuntime();
	const channel = factory.create(
		dataStoreRuntime,
		`${factory.type.replace(/\//g, "_")}-${Math.random().toString(36).slice(2)}`,
	);
	runtimeFactory.createContainerRuntime(dataStoreRuntime);
	channel.connect({
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	});
	return channel;
}

export function processAllMessages() {
	runtimeFactory.processAllMessages();
}

export function measureSummary(channel: IChannel) {
	processAllMessages();

	const { summary } = channel.getAttachSummary(true);
	const summaryString = JSON.stringify(summary);
	return IsoBuffer.from(summaryString).byteLength;
}

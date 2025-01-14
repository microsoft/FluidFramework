/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IsoBuffer } from "@fluid-internal/client-utils";
import { makeRandom } from "@fluid-private/stochastic-test-utils";
import { IChannel, IChannelFactory } from "@fluidframework/datastore-definitions/legacy";
import { SessionId } from "@fluidframework/id-compressor";
import { createIdCompressor } from "@fluidframework/id-compressor/legacy";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/legacy";

export function create<T>(factory: IChannelFactory<T>): {
	channel: T & IChannel;
	processAllMessages: () => void;
} {
	const runtimeFactory = new MockContainerRuntimeFactory();

	const sessionId = makeRandom().uuid4() as SessionId;

	const dataStoreRuntime = new MockFluidDataStoreRuntime({
		clientId: `test-client-${sessionId}`,
		id: "test",
		idCompressor: createIdCompressor(sessionId),
	});

	const channel = factory.create(
		dataStoreRuntime,
		`${factory.type.replace(/\//g, "_")}-${Math.random().toString(36).slice(2)}`,
	);

	runtimeFactory.createContainerRuntime(dataStoreRuntime);

	channel.connect({
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	});

	return { channel, processAllMessages: () => runtimeFactory.processAllMessages() };
}

export function measureAttachmentSummary(channel: IChannel) {
	const { summary } = channel.getAttachSummary(/* fullTree: */ true);
	return measureEncodedLength(JSON.stringify(summary));
}

export function measureEncodedLength(s: string) {
	return IsoBuffer.from(s).byteLength;
}

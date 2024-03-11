/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IIdCompressorCore,
	SerializedIdCompressorWithNoSession,
} from "@fluidframework/id-compressor";
import type {
	MockFluidDataStoreRuntime,
	MockContainerRuntimeForReconnection,
} from "@fluidframework/test-runtime-utils";
import type { IChannelFactory } from "@fluidframework/datastore-definitions";
import type { ISummaryTree } from "@fluidframework/protocol-definitions";

/**
 * @internal
 */
export interface Client<TChannelFactory extends IChannelFactory> {
	channel: ReturnType<TChannelFactory["create"]>;
	dataStoreRuntime: MockFluidDataStoreRuntime;
	containerRuntime: MockContainerRuntimeForReconnection;
}

/**
 * @internal
 */
export interface ClientLoadData {
	minimumSequenceNumber: number;
	summaries: {
		summary: ISummaryTree;
		idCompressorSummary: SerializedIdCompressorWithNoSession | undefined;
	};
}

/**
 * @internal
 */
export type ClientWithStashData<TChannelFactory extends IChannelFactory> = Client<TChannelFactory> &
	Partial<Record<"stashData", ClientLoadData>>;

export const hasStashData = <TChannelFactory extends IChannelFactory>(
	client?: Client<TChannelFactory>,
): client is Required<ClientWithStashData<TChannelFactory>> =>
	client !== undefined &&
	"stashData" in client &&
	client.stashData !== null &&
	typeof client.stashData == "object";

function finalizeAllocatedIds(compressor: IIdCompressorCore | undefined): void {
	if (compressor !== undefined) {
		const range = compressor.takeNextCreationRange();
		if (range.ids !== undefined) {
			compressor.finalizeCreationRange(range);
		}
	}
}

/**
 * Creates the load data from the client. The load data include everything needed to load a new client. It includes the summaries and the minimumSequenceNumber.
 * @internal
 */
export function createLoadData(client: Client<IChannelFactory>): ClientLoadData {
	finalizeAllocatedIds(client.dataStoreRuntime.idCompressor);
	return {
		minimumSequenceNumber: client.dataStoreRuntime.deltaManager.lastSequenceNumber,
		summaries: {
			summary: client.channel.getAttachSummary().summary,
			idCompressorSummary: client.dataStoreRuntime.idCompressor?.serialize(false),
		},
	};
}

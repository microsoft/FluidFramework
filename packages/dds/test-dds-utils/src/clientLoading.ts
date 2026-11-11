/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IChannelFactory } from "@fluidframework/datastore-definitions/internal";
import type { ISummaryTree } from "@fluidframework/driver-definitions";
import {
	serializeIdCompressor,
	type SerializedIdCompressorWithNoSession,
	type SerializedIdCompressorWithOngoingSession,
} from "@fluidframework/id-compressor/internal";
import type {
	MockContainerRuntimeForReconnection,
	MockFluidDataStoreRuntime,
} from "@fluidframework/test-runtime-utils/internal";

/**
 * @typeParam TClientConfiguration - Consumer-defined configuration recorded by the fuzz harness.
 * @internal
 */
export interface Client<
	TChannelFactory extends IChannelFactory,
	TClientConfiguration = unknown,
> {
	channel: ReturnType<TChannelFactory["create"]>;
	dataStoreRuntime: MockFluidDataStoreRuntime;
	containerRuntime: MockContainerRuntimeForReconnection;
	/**
	 * Recorded configuration used to construct this client.
	 * Absent when client configuration is not enabled.
	 */
	readonly clientConfiguration?: TClientConfiguration;
}

/**
 * @internal
 */
export interface ClientLoadData {
	minimumSequenceNumber: number;
	summaries: {
		summary: ISummaryTree;
		idCompressorSummary: FuzzSerializedIdCompressor | undefined;
	};
}

/**
 * @internal
 */
export type ClientStashData = Omit<ClientLoadData, "summaries"> & {
	summaries: Omit<ClientLoadData["summaries"], "idCompressorSummary">;
};

/**
 * @internal
 */
export type FuzzSerializedIdCompressor =
	| { withSession: false; serializedCompressor: SerializedIdCompressorWithNoSession }
	| { withSession: true; serializedCompressor: SerializedIdCompressorWithOngoingSession };

/**
 * @internal
 */
export type ClientWithStashData<
	TChannelFactory extends IChannelFactory,
	TClientConfiguration = unknown,
> = Client<TChannelFactory, TClientConfiguration> &
	Partial<Record<"stashData", ClientStashData>>;

export const hasStashData = <
	TChannelFactory extends IChannelFactory,
	TClientConfiguration = unknown,
>(
	client?: Client<TChannelFactory, TClientConfiguration>,
): client is Client<TChannelFactory, TClientConfiguration> & { stashData: ClientStashData } =>
	client !== undefined &&
	"stashData" in client &&
	client.stashData !== null &&
	typeof client.stashData == "object";

/**
 * Creates the load data from the client. The load data include everything needed to load a new client. It includes the summaries and the minimumSequenceNumber.
 * @internal
 */
export function createLoadData(
	client: Client<IChannelFactory>,
	withSession: boolean,
): ClientLoadData {
	const compressor = client.dataStoreRuntime.idCompressor;
	return {
		minimumSequenceNumber: client.dataStoreRuntime.deltaManagerInternal.lastSequenceNumber,
		summaries: {
			summary: client.channel.getAttachSummary().summary,
			idCompressorSummary:
				compressor === undefined
					? undefined
					: withSession
						? {
								withSession: true,
								serializedCompressor: serializeIdCompressor(compressor, true),
							}
						: {
								withSession: false,
								serializedCompressor: serializeIdCompressor(compressor, false),
							},
		},
	};
}

/**
 * Creates the load data from the supplied stash data.
 * This emulates the production behavior of always storing the tip state of the compressor in the stashed state,
 * rather than the state at the time the summary tree in the stashed state was created.
 * @internal
 */
export function createLoadDataFromStashData(
	client: Client<IChannelFactory>,
	stashData: ClientStashData,
): ClientLoadData {
	const compressor = client.dataStoreRuntime.idCompressor;
	return {
		minimumSequenceNumber: stashData.minimumSequenceNumber,
		summaries: {
			summary: stashData.summaries.summary,
			idCompressorSummary:
				compressor === undefined
					? undefined
					: {
							withSession: true,
							serializedCompressor: serializeIdCompressor(compressor, true),
						},
		},
	};
}

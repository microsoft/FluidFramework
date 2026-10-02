/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	IChannelAttributes,
	IChannelFactory,
} from "@fluidframework/datastore-definitions/internal";
import type { ISummaryTree } from "@fluidframework/driver-definitions";
import { SummaryType } from "@fluidframework/driver-definitions/internal";
import {
	serializeIdCompressor,
	type SerializedIdCompressorWithNoSession,
	type SerializedIdCompressorWithOngoingSession,
} from "@fluidframework/id-compressor/internal";
import { addBlobToSummary } from "@fluidframework/runtime-utils/internal";
import type {
	MockContainerRuntimeForReconnection,
	MockFluidDataStoreRuntime,
} from "@fluidframework/test-runtime-utils/internal";

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
export type ClientWithStashData<TChannelFactory extends IChannelFactory> =
	Client<TChannelFactory> & Partial<Record<"stashData", ClientStashData>>;

export const hasStashData = <TChannelFactory extends IChannelFactory>(
	client?: Client<TChannelFactory>,
): client is Required<ClientWithStashData<TChannelFactory>> =>
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
	const summary = client.channel.getAttachSummary();
	addBlobToSummary(summary, ".attributes", JSON.stringify(client.channel.attributes));
	return {
		minimumSequenceNumber: client.dataStoreRuntime.deltaManagerInternal.lastSequenceNumber,
		summaries: {
			summary: summary.summary,
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
 * Reads the channel attributes captured when the summary was generated.
 * @internal
 */
export function getSnapshotAttributes(summary: ISummaryTree): IChannelAttributes {
	const blob = summary.tree[".attributes"];
	assert(
		blob?.type === SummaryType.Blob && typeof blob.content === "string",
		"Expected serialized channel attributes in the summary",
	);
	const attributes: unknown = JSON.parse(blob.content);
	assert(
		typeof attributes === "object" &&
			attributes !== null &&
			"type" in attributes &&
			typeof attributes.type === "string" &&
			"snapshotFormatVersion" in attributes &&
			typeof attributes.snapshotFormatVersion === "string",
		"Expected valid channel attributes in the summary",
	);
	assert(
		!("packageVersion" in attributes) ||
			attributes.packageVersion === undefined ||
			typeof attributes.packageVersion === "string",
		"Expected a valid package version in the channel attributes",
	);
	return {
		...attributes,
		type: attributes.type,
		snapshotFormatVersion: attributes.snapshotFormatVersion,
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

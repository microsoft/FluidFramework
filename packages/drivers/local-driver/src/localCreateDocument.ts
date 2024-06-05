/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISummaryTree } from "@fluidframework/driver-definitions";
import { IResolvedUrl } from "@fluidframework/driver-definitions/internal";
import {
	getDocAttributesFromProtocolSummary,
	getQuorumValuesFromProtocolSummary,
	isCombinedAppAndProtocolSummary,
} from "@fluidframework/driver-utils/internal";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { defaultHash } from "@fluidframework/server-services-client";

export async function createDocument(
	localDeltaConnectionServer,
	resolvedUrl: IResolvedUrl,
	summary: ISummaryTree,
) {
	const pathName = new URL(resolvedUrl.url).pathname;
	const pathArr = pathName.split("/");
	const tenantId = pathArr[pathArr.length - 2];
	const id = pathArr[pathArr.length - 1];
	const documentStorage = (localDeltaConnectionServer as LocalDeltaConnectionServer)
		.documentStorage;
	if (!isCombinedAppAndProtocolSummary(summary)) {
		throw new Error("Protocol and App Summary required in the full summary");
	}
	const protocolSummary = summary.tree[".protocol"];
	const appSummary = summary.tree[".app"];
	const documentAttributes = getDocAttributesFromProtocolSummary(protocolSummary);
	const quorumValues = getQuorumValuesFromProtocolSummary(protocolSummary);
	const sequenceNumber = documentAttributes.sequenceNumber;
	await documentStorage.createDocument(
		tenantId,
		id,
		appSummary,
		sequenceNumber,
		defaultHash,
		resolvedUrl.endpoints.ordererUrl ?? "",
		resolvedUrl.endpoints.storageUrl ?? "",
		resolvedUrl.endpoints.deltaStorageUrl ?? "",
		quorumValues,
		false /* enableDiscovery */,
		false /* isEphemeralContainer */,
	);
}

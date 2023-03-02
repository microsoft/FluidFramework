/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ensureFluidResolvedUrl,
	getDocAttributesFromProtocolSummary,
	getQuorumValuesFromProtocolSummary,
} from "@fluidframework/driver-utils";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { defaultHash } from "@fluidframework/server-services-client";

export async function createDocument(
	localDeltaConnectionServer,
	resolvedUrl,
	summary: ISummaryTree,
) {
	ensureFluidResolvedUrl(resolvedUrl);
	const pathName = new URL(resolvedUrl.url).pathname;
	const pathArr = pathName.split("/");
	const tenantId = pathArr[pathArr.length - 2];
	const id = pathArr[pathArr.length - 1];
	const documentStorage = (localDeltaConnectionServer as LocalDeltaConnectionServer)
		.documentStorage;
	const protocolSummary = summary.tree[".protocol"] as ISummaryTree;
	const appSummary = summary.tree[".app"] as ISummaryTree;
	if (!(protocolSummary && appSummary)) {
		throw new Error("Protocol and App Summary required in the full summary");
	}
	const documentAttributes = getDocAttributesFromProtocolSummary(protocolSummary);
	const quorumValues = getQuorumValuesFromProtocolSummary(protocolSummary);
	const sequenceNumber = documentAttributes.sequenceNumber;
	await documentStorage.createDocument(
		tenantId,
		id,
		appSummary,
		sequenceNumber,
		documentAttributes.term ?? 1,
		defaultHash,
		resolvedUrl.endpoints.ordererUrl ?? "",
		resolvedUrl.endpoints.storageUrl ?? "",
		resolvedUrl.endpoints.deltaStorageUrl ?? "",
		quorumValues,
		false /* enableDiscovery */,
	);
}

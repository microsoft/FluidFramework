/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Uint8ArrayToString, stringToBuffer } from "@fluid-internal/client-utils";
import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import {
	ISummaryBlob,
	ISummaryTree,
	type SummaryObject,
	SummaryType,
} from "@fluidframework/driver-definitions";
import { ISnapshot, ISnapshotTree } from "@fluidframework/driver-definitions/internal";
import {
	getDocAttributesFromProtocolSummary,
	getGitType,
	isCombinedAppAndProtocolSummary,
} from "@fluidframework/driver-utils/internal";
import { InstrumentedStorageTokenFetcher } from "@fluidframework/odsp-driver-definitions/internal";
import {
	ITelemetryLoggerExt,
	PerformanceEvent,
} from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import {
	IOdspSummaryPayload,
	IOdspSummaryTree,
	OdspSummaryTreeEntry,
	OdspSummaryTreeValue,
} from "./../contracts.js";
import { EpochTracker, FetchType } from "./../epochTracker.js";
import { getHeadersWithAuth } from "./../getUrlAndHeadersWithAuth.js";
import { checkForKnownServerFarmType } from "./../odspUrlHelper.js";
import { getWithRetryForTokenRefresh, maxUmpPostBodySize } from "./../odspUtils.js";
import { runWithRetry } from "./../retryUtils.js";

/**
 * Converts a summary(ISummaryTree) taken in detached container to snapshot tree and blobs
 */
export function convertCreateNewSummaryTreeToTreeAndBlobs(
	summary: ISummaryTree,
	treeId: string,
): ISnapshot {
	const protocolSummary = summary.tree[".protocol"] as ISummaryTree;
	const documentAttributes = getDocAttributesFromProtocolSummary(protocolSummary);
	const sequenceNumber = documentAttributes.sequenceNumber;
	const blobContents = new Map<string, ArrayBuffer>();
	const snapshotTree = convertCreateNewSummaryTreeToTreeAndBlobsCore(summary, blobContents);
	snapshotTree.id = treeId;
	const snapshotTreeValue: ISnapshot = {
		snapshotTree,
		blobContents,
		ops: [],
		sequenceNumber,
		latestSequenceNumber: sequenceNumber,
		snapshotFormatV: 1,
	};

	return snapshotTreeValue;
}

function convertCreateNewSummaryTreeToTreeAndBlobsCore(
	summary: ISummaryTree,
	blobs: Map<string, ArrayBuffer>,
): ISnapshotTree {
	const treeNode: ISnapshotTree = {
		blobs: {},
		trees: {},
		unreferenced: summary.unreferenced,
		groupId: summary.groupId,
	};
	const keys = Object.keys(summary.tree);
	for (const key of keys) {
		const summaryObject = summary.tree[key];

		switch (summaryObject.type) {
			case SummaryType.Tree: {
				treeNode.trees[key] = convertCreateNewSummaryTreeToTreeAndBlobsCore(
					summaryObject,
					blobs,
				);
				break;
			}
			case SummaryType.Blob: {
				const contentBuffer =
					typeof summaryObject.content === "string"
						? stringToBuffer(summaryObject.content, "utf8")
						: summaryObject.content;
				const blobId = uuid();
				treeNode.blobs[key] = blobId;
				blobs.set(blobId, contentBuffer);
				break;
			}
			case SummaryType.Handle:
			case SummaryType.Attachment: {
				throw new Error(`No ${summaryObject.type} should be present for detached summary!`);
			}
			default: {
				unreachableCase(
					summaryObject,
					`Unknown tree type ${(summaryObject as SummaryObject).type}`,
				);
			}
		}
	}
	return treeNode;
}

export function convertSummaryIntoContainerSnapshot(
	createNewSummary: ISummaryTree,
): IOdspSummaryPayload {
	if (!isCombinedAppAndProtocolSummary(createNewSummary)) {
		throw new Error("App and protocol summary required for create new path!!");
	}
	const appSummary = createNewSummary.tree[".app"];
	const protocolSummary = createNewSummary.tree[".protocol"];
	const documentAttributes = getDocAttributesFromProtocolSummary(protocolSummary);
	const attributesSummaryBlob: ISummaryBlob = {
		type: SummaryType.Blob,
		content: JSON.stringify(documentAttributes),
	};
	protocolSummary.tree.attributes = attributesSummaryBlob;
	const convertedCreateNewSummary: ISummaryTree = {
		type: SummaryType.Tree,
		tree: {
			".protocol": protocolSummary,
			".app": appSummary,
		},
	};
	const snapshotTree = convertSummaryToSnapshotTreeForCreateNew(convertedCreateNewSummary);
	const snapshot: IOdspSummaryPayload = {
		entries: snapshotTree.entries ?? [],
		message: "app",
		sequenceNumber: documentAttributes.sequenceNumber,
		type: "container",
	};
	return snapshot;
}

/**
 * Converts a summary tree to ODSP tree
 */
function convertSummaryToSnapshotTreeForCreateNew(summary: ISummaryTree): IOdspSummaryTree {
	const snapshotTree: IOdspSummaryTree = {
		type: "tree",
		entries: [],
	};

	const keys = Object.keys(summary.tree);
	for (const key of keys) {
		assert(!key.includes("/"), 0x9cc /* id should not include slashes */);
		const summaryObject = summary.tree[key];

		let value: OdspSummaryTreeValue;
		// Tracks if an entry is unreferenced. Currently, only tree entries can be marked as unreferenced. If the
		// property is not present, the tree entry is considered referenced. If the property is present and is true,
		// the tree entry is considered unreferenced.
		let unreferenced: true | undefined;
		let groupId: string | undefined;

		switch (summaryObject.type) {
			case SummaryType.Tree: {
				value = convertSummaryToSnapshotTreeForCreateNew(summaryObject);
				unreferenced = summaryObject.unreferenced;
				groupId = summaryObject.groupId;
				break;
			}
			case SummaryType.Blob: {
				const content =
					typeof summaryObject.content === "string"
						? summaryObject.content
						: Uint8ArrayToString(summaryObject.content, "base64");
				const encoding = typeof summaryObject.content === "string" ? "utf-8" : "base64";

				value = {
					type: "blob",
					content,
					encoding,
				};
				break;
			}
			case SummaryType.Handle: {
				throw new Error("No handle should be present for first summary!!");
			}
			default: {
				throw new Error(`Unknown tree type ${summaryObject.type}`);
			}
		}

		const entry: OdspSummaryTreeEntry = {
			path: key,
			type: getGitType(summaryObject),
			value,
			unreferenced,
			groupId,
		};
		snapshotTree.entries?.push(entry);
	}

	return snapshotTree;
}

export async function createNewFluidContainerCore<T>(args: {
	containerSnapshot: IOdspSummaryPayload;
	getAuthHeader: InstrumentedStorageTokenFetcher;
	logger: ITelemetryLoggerExt;
	initialUrl: string;
	forceAccessTokenViaAuthorizationHeader: boolean;
	epochTracker: EpochTracker;
	telemetryName: string;
	fetchType: FetchType;
	validateResponseCallback?: (content: T) => void;
}): Promise<T> {
	const {
		containerSnapshot,
		getAuthHeader,
		logger,
		initialUrl,
		epochTracker,
		telemetryName,
		fetchType,
		validateResponseCallback,
	} = args;
	const internalFarmType = checkForKnownServerFarmType(initialUrl);

	return getWithRetryForTokenRefresh(async (options) => {
		return PerformanceEvent.timedExecAsync(
			logger,
			{ eventName: telemetryName, details: { internalFarmType } },
			async (event) => {
				const snapshotBody = JSON.stringify(containerSnapshot);
				let url: string;
				let headers: { [index: string]: string };
				let addInBody = false;
				const formBoundary = uuid();
				const urlObj = new URL(initialUrl);
				urlObj.searchParams.set("ump", "1");
				const authInBodyUrl = urlObj.href;
				const method = "POST";
				const authHeader = await getAuthHeader(
					{ ...options, request: { url: authInBodyUrl, method } },
					telemetryName,
				);
				const postBodyWithAuth =
					`--${formBoundary}\r\n` +
					`Authorization: ${authHeader}\r\n` +
					`X-HTTP-Method-Override: POST\r\n` +
					`Content-Type: application/json\r\n` +
					`_post: 1\r\n` +
					`\r\n${snapshotBody}\r\n` +
					`\r\n--${formBoundary}--`;

				let postBody = snapshotBody;
				// We use the byte length of the post body to determine if we should use the multipart/form-data or not. This helps
				// in cases where the body contains data with different language where 1 char could be multiple code points.
				if (
					new TextEncoder().encode(postBodyWithAuth).length <= maxUmpPostBodySize &&
					authHeader?.startsWith("Bearer")
				) {
					url = authInBodyUrl;
					headers = {
						"Content-Type": `multipart/form-data;boundary=${formBoundary}`,
					};
					addInBody = true;
					postBody = postBodyWithAuth;
				} else {
					url = initialUrl;
					const authHeaderNoUmp = await getAuthHeader(
						{ ...options, request: { url, method } },
						telemetryName,
					);
					headers = {
						...getHeadersWithAuth(authHeaderNoUmp),
						"Content-Type": "application/json",
					};
					postBody = snapshotBody;
				}

				const fetchResponse = await runWithRetry(
					async () =>
						epochTracker.fetchAndParseAsJSON<T>(
							url,
							{
								body: postBody,
								headers,
								method,
							},
							fetchType,
							addInBody,
						),
					telemetryName,
					logger,
				);

				validateResponseCallback?.(fetchResponse.content);

				event.end({
					attempts: options.refresh ? 2 : 1,
					...fetchResponse.propsToLog,
				});

				return fetchResponse.content;
			},
		);
	});
}

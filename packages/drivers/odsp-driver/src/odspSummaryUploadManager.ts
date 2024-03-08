/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Uint8ArrayToString } from "@fluid-internal/client-utils";
import { assert, unreachableCase } from "@fluidframework/core-utils";
import { ISummaryContext } from "@fluidframework/driver-definitions";
import { getGitType } from "@fluidframework/protocol-base";
import * as api from "@fluidframework/protocol-definitions";
import { InstrumentedStorageTokenFetcher } from "@fluidframework/odsp-driver-definitions";
import {
	ITelemetryLoggerExt,
	loggerToMonitoringContext,
	MonitoringContext,
	PerformanceEvent,
} from "@fluidframework/telemetry-utils";
import { isCombinedAppAndProtocolSummary } from "@fluidframework/driver-utils";
import {
	IOdspSummaryPayload,
	IWriteSummaryResponse,
	IOdspSummaryTree,
	IOdspSummaryTreeBaseEntry,
	OdspSummaryTreeEntry,
	OdspSummaryTreeValue,
} from "./contracts.js";
import { EpochTracker } from "./epochTracker.js";
import { getUrlAndHeadersWithAuth } from "./getUrlAndHeadersWithAuth.js";
import { getWithRetryForTokenRefresh } from "./odspUtils.js";

/**
 * This class manages a summary upload. When it receives a call to upload summary, it converts the summary tree into
 * a snapshot tree and then uploads that to the server.
 */
export class OdspSummaryUploadManager {
	// Last proposed handle of the uploaded app summary.
	private lastSummaryProposalHandle: string | undefined;
	private readonly mc: MonitoringContext;

	constructor(
		private readonly snapshotUrl: string,
		private readonly getStorageToken: InstrumentedStorageTokenFetcher,
		logger: ITelemetryLoggerExt,
		private readonly epochTracker: EpochTracker,
		private readonly forceAccessTokenViaAuthorizationHeader: boolean,
		private readonly relayServiceTenantAndSessionId: () => string | undefined,
	) {
		this.mc = loggerToMonitoringContext(logger);
	}

	public async writeSummaryTree(
		tree: api.ISummaryTree,
		context: ISummaryContext,
	): Promise<string> {
		// If the last proposed handle is not the proposed handle of the acked summary(could happen when the last summary get nacked),
		// then re-initialize the caches with the previous ones else just update the previous caches with the caches from acked summary.
		// Don't bother logging if lastSummaryProposalHandle hasn't been set before; only log on a positive mismatch.
		if (
			this.lastSummaryProposalHandle !== undefined &&
			this.lastSummaryProposalHandle !== context.proposalHandle
		) {
			this.mc.logger.sendTelemetryEvent({
				eventName: "LastSummaryProposedHandleMismatch",
				ackedSummaryProposedHandle: context.proposalHandle,
				lastSummaryProposalHandle: this.lastSummaryProposalHandle,
			});
		}
		const result = await this.writeSummaryTreeCore(
			context.ackHandle,
			context.referenceSequenceNumber,
			tree,
		);
		const id = result ? result.id : undefined;
		if (!result || !id) {
			throw new Error(`Failed to write summary tree`);
		}
		this.lastSummaryProposalHandle = id;
		return id;
	}

	private async writeSummaryTreeCore(
		parentHandle: string | undefined,
		referenceSequenceNumber: number,
		tree: api.ISummaryTree,
	): Promise<IWriteSummaryResponse> {
		const containsProtocolTree = isCombinedAppAndProtocolSummary(tree);
		const { snapshotTree, blobs } = await this.convertSummaryToSnapshotTree(
			parentHandle,
			tree,
			".app",
		);
		const snapshot: IOdspSummaryPayload = {
			entries: snapshotTree.entries!,
			message: "app",
			sequenceNumber: referenceSequenceNumber,
			// no ack handle implies this is initial summary after empty file creation.
			// send container payload so server will use it without a summary op
			type: containsProtocolTree || parentHandle === undefined ? "container" : "channel",
		};

		return getWithRetryForTokenRefresh(async (options) => {
			const storageToken = await this.getStorageToken(options, "WriteSummaryTree");

			const { url, headers } = getUrlAndHeadersWithAuth(
				`${this.snapshotUrl}/snapshot`,
				storageToken,
				this.forceAccessTokenViaAuthorizationHeader,
			);
			headers["Content-Type"] = "application/json";
			const relayServiceTenantAndSessionId = this.relayServiceTenantAndSessionId();
			// This would be undefined in case of summary is uploaded in detached container with attachment
			// blobs flow where summary is uploaded without connecting to push.
			if (relayServiceTenantAndSessionId !== undefined) {
				headers["If-Match"] = `fluid:sessionid=${relayServiceTenantAndSessionId}${
					parentHandle ? `;containerid=${parentHandle}` : ""
				}`;
			}

			const postBody = JSON.stringify(snapshot);

			return PerformanceEvent.timedExecAsync(
				this.mc.logger,
				{
					eventName: "uploadSummary",
					attempt: options.refresh ? 2 : 1,
					hasClaims: !!options.claims,
					hasTenantId: !!options.tenantId,
					headers: Object.keys(headers).length > 0 ? true : undefined,
					blobs,
					size: postBody.length,
					referenceSequenceNumber,
					type: snapshot.type,
				},
				async () => {
					const response =
						await this.epochTracker.fetchAndParseAsJSON<IWriteSummaryResponse>(
							url,
							{
								body: postBody,
								headers,
								method: "POST",
							},
							"uploadSummary",
						);
					return response.content;
				},
			);
		});
	}

	/**
	 * Following are the goals of this function:
	 *
	 * a. Converts the summary tree to a snapshot/odsp tree to be uploaded. Always upload full snapshot tree.
	 *
	 * @param parentHandle - Handle of the last uploaded summary or detach new summary.
	 * @param tree - Summary Tree which will be converted to snapshot tree to be uploaded.
	 * @param rootNodeName - Root node name of the summary tree.
	 * @param path - Current path of node which is getting evaluated.
	 * @param markUnreferencedNodes - True if we should mark unreferenced nodes.
	 */
	private async convertSummaryToSnapshotTree(
		parentHandle: string | undefined,
		tree: api.ISummaryTree,
		rootNodeName: string,
		markUnreferencedNodes: boolean = this.mc.config.getBoolean(
			"Fluid.Driver.Odsp.MarkUnreferencedNodes",
		) ?? true,
	): Promise<{
		snapshotTree: IOdspSummaryTree;
		blobs: number;
	}> {
		const snapshotTree: IOdspSummaryTree = {
			type: "tree",
			entries: [] as OdspSummaryTreeEntry[],
		};

		let blobs = 0;
		const keys = Object.keys(tree.tree);
		for (const key of keys) {
			const summaryObject = tree.tree[key];

			let id: string | undefined;
			let value: OdspSummaryTreeValue | undefined;

			// Tracks if an entry is unreferenced. Currently, only tree entries can be marked as unreferenced. If the
			// property is not present, the tree entry is considered referenced. If the property is present and is
			// true (which is the only value it can have), the tree entry is considered unreferenced.
			let unreferenced: true | undefined;
			let groupId: string | undefined;
			switch (summaryObject.type) {
				case api.SummaryType.Tree: {
					const result = await this.convertSummaryToSnapshotTree(
						parentHandle,
						summaryObject,
						rootNodeName,
					);
					value = result.snapshotTree;
					unreferenced = markUnreferencedNodes ? summaryObject.unreferenced : undefined;
					groupId = summaryObject.groupId;
					blobs += result.blobs;
					break;
				}
				case api.SummaryType.Blob: {
					value =
						typeof summaryObject.content === "string"
							? {
									type: "blob",
									content: summaryObject.content,
									encoding: "utf-8",
							  }
							: {
									type: "blob",
									content: Uint8ArrayToString(summaryObject.content, "base64"),
									encoding: "base64",
							  };
					blobs++;
					break;
				}
				case api.SummaryType.Handle: {
					if (!parentHandle) {
						throw new Error("Parent summary does not exist to reference by handle.");
					}
					let handlePath = summaryObject.handle;
					if (handlePath.length > 0 && !handlePath.startsWith("/")) {
						handlePath = `/${handlePath}`;
					}
					const pathKey = `${rootNodeName}${handlePath}`;
					id = `${parentHandle}/${pathKey}`;
					break;
				}
				case api.SummaryType.Attachment: {
					id = summaryObject.id;
					break;
				}
				default: {
					unreachableCase(
						summaryObject,
						`Unknown type: ${(summaryObject as api.SummaryObject).type}`,
					);
				}
			}

			const baseEntry: IOdspSummaryTreeBaseEntry = {
				path: encodeURIComponent(key),
				type: getGitType(summaryObject),
			};

			let entry: OdspSummaryTreeEntry;

			if (value) {
				assert(
					id === undefined,
					0x0ad /* "Snapshot entry has both a tree value and a referenced id!" */,
				);
				entry = {
					value,
					...baseEntry,
					unreferenced,
					groupId,
				};
			} else if (id) {
				entry = {
					...baseEntry,
					id,
				};
			} else {
				throw new Error(`Invalid tree entry for ${summaryObject.type}`);
			}

			snapshotTree.entries!.push(entry);
		}

		return { snapshotTree, blobs };
	}
}

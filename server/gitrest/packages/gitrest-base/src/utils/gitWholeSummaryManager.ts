/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IWholeFlatSummary,
	IWholeSummaryPayload,
	NetworkError,
} from "@fluidframework/server-services-client";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { IRepositoryManager } from "./definitions";
import { GitRestLumberEventName } from "./gitrestTelemetryDefinitions";
import {
	Constants,
	ISummaryWriteFeatureFlags,
	IWriteSummaryInfo,
	isChannelSummary,
	isContainerSummary,
	readSummary,
	writeChannelSummary,
	writeContainerSummary,
} from "./wholeSummary";

const DefaultSummaryWriteFeatureFlags: ISummaryWriteFeatureFlags = {
	enableLowIoWrite: false,
	optimizeForInitialSummary: false,
};

export { isChannelSummary, isContainerSummary } from "./wholeSummary";
export const latestSummarySha = Constants.LatestSummarySha;

/**
 * Handles reading/writing summaries from/to storage when the client expects or sends summary information in
 * the "Whole Summary" format. This can help save bandwidth by reducing the HTTP overhead associated
 * with "Shredded Summary" format communication between the client and service.
 *
 * Internally, GitWholeSummaryManager uploads and reads from storage in the same way as a client
 * using "Shredded Summary" format would, unless the enableLowIoWrite option is/was used.
 */
export class GitWholeSummaryManager {
	private readonly summaryWriteFeatureFlags: ISummaryWriteFeatureFlags;

	constructor(
		private readonly documentId: string,
		private readonly repoManager: IRepositoryManager,
		private readonly lumberjackProperties: Record<string, any>,
		private readonly externalStorageEnabled = true,
		writeOptions?: Partial<ISummaryWriteFeatureFlags>,
	) {
		this.summaryWriteFeatureFlags = {
			...DefaultSummaryWriteFeatureFlags,
			...writeOptions,
		};
	}

	/**
	 * Read a summary from Git storage.
	 * @param sha - The commit sha of the summary to read. If the sha is the special value "latest", the most recent commit sha will be used.
	 */
	public async readSummary(sha: string): Promise<IWholeFlatSummary> {
		const readSummaryMetric = Lumberjack.newLumberMetric(
			GitRestLumberEventName.WholeSummaryManagerReadSummary,
			this.lumberjackProperties,
		);

		try {
			const summaryTree = await readSummary(sha, {
				documentId: this.documentId,
				repoManager: this.repoManager,
				externalStorageEnabled: this.externalStorageEnabled,
				lumberjackProperties: this.lumberjackProperties,
			});
			readSummaryMetric.setProperty("commitSha", summaryTree.id);
			readSummaryMetric.setProperty("treeId", summaryTree.trees[0]?.id);
			readSummaryMetric.success("GitWholeSummaryManager succeeded in reading summary");
			return summaryTree;
		} catch (error: any) {
			readSummaryMetric.error("GitWholeSummaryManager failed to read summary", error);
			throw error;
		}
	}

	/**
	 * Write a summary to Git storage.
	 * @param payload - Payload containing summary tree entries and summary type (container or channel). Sequence number is not stored.
	 * @param isInitial - Whether this is the first summary written for the document.
	 * @returns Information about the written summary.
	 * If the summary is a "container" summary, the full summary tree will be returned so that it can be cached by Historian and/or optionally stored as 1 file in storage.
	 * If the summary is a "channel" summary, the tree sha will be returned so that it can be referenced by a future "container" summary.
	 */
	public async writeSummary(
		payload: IWholeSummaryPayload,
		isInitial?: boolean,
	): Promise<IWriteSummaryInfo> {
		const writeSummaryMetric = Lumberjack.newLumberMetric(
			GitRestLumberEventName.WholeSummaryManagerWriteSummary,
			this.lumberjackProperties,
		);
		writeSummaryMetric.setProperty(
			"enableLowIoWrite",
			this.summaryWriteFeatureFlags.enableLowIoWrite,
		);
		writeSummaryMetric.setProperty(
			"optimizeForInitialSummary",
			this.summaryWriteFeatureFlags.optimizeForInitialSummary,
		);
		writeSummaryMetric.setProperty("isInitial", isInitial);
		try {
			if (isChannelSummary(payload)) {
				writeSummaryMetric.setProperty("summaryType", "channel");
				const writeSummaryInfo = await writeChannelSummary(
					payload,
					{
						documentId: this.documentId,
						repoManager: this.repoManager,
						externalStorageEnabled: this.externalStorageEnabled,
						lumberjackProperties: this.lumberjackProperties,
					},
					this.summaryWriteFeatureFlags,
				);
				writeSummaryMetric.setProperty("treeSha", writeSummaryInfo.writeSummaryResponse.id);
				writeSummaryMetric.success(
					"GitWholeSummaryManager succeeded in writing channel summary",
				);
				return writeSummaryInfo;
			}
			if (isContainerSummary(payload)) {
				writeSummaryMetric.setProperty("summaryType", "container");
				const writeSummaryInfo = await writeContainerSummary(
					payload,
					isInitial,
					{
						documentId: this.documentId,
						repoManager: this.repoManager,
						externalStorageEnabled: this.externalStorageEnabled,
						lumberjackProperties: this.lumberjackProperties,
					},
					this.summaryWriteFeatureFlags,
				);
				writeSummaryMetric.setProperty("newDocument", writeSummaryInfo.isNew);
				writeSummaryMetric.setProperty(
					"commitSha",
					writeSummaryInfo.writeSummaryResponse.id,
				);
				writeSummaryMetric.success(
					"GitWholeSummaryManager succeeded in writing container summary",
				);
				return writeSummaryInfo;
			}
			throw new NetworkError(400, `Unknown Summary Type: ${payload.type}`);
		} catch (error: any) {
			writeSummaryMetric.error("GitWholeSummaryManager failed to write summary", error);
			throw error;
		}
	}
}

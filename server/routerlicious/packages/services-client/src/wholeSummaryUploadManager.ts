/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISummaryTree, IWholeSummaryPayload, IWholeSummaryPayloadType } from "./storageContracts";
import { IGitManager, ISummaryUploadManager, SummaryUploadResult } from "./storage";
import { convertSummaryTreeToWholeSummaryTree } from "./storageUtils";

/**
 * Converts summary to snapshot tree and uploads with single snaphot tree payload.
 */
export class WholeSummaryUploadManager implements ISummaryUploadManager {
	constructor(private readonly manager: IGitManager) {}

	public async writeSummaryTree(
		summaryTree: ISummaryTree,
		parentHandle: string | undefined,
		summaryType: IWholeSummaryPayloadType,
		sequenceNumber: number = 0,
		initial: boolean = false,
	): Promise<SummaryUploadResult> {
		const result = await this.writeSummaryTreeCore(
			parentHandle,
			summaryTree,
			summaryType,
			sequenceNumber,
			initial,
		);
		if (!result?.id) {
			throw new Error(`Failed to write summary tree`);
		}
		return result;
	}

	private async writeSummaryTreeCore(
		parentHandle: string | undefined,
		tree: ISummaryTree,
		type: IWholeSummaryPayloadType,
		sequenceNumber: number,
		initial: boolean,
	): Promise<SummaryUploadResult> {
		const snapshotTree = convertSummaryTreeToWholeSummaryTree(
			parentHandle,
			tree,
			"",
			type === "channel" ? ".app" : "",
		);
		const snapshotPayload: IWholeSummaryPayload = {
			entries: snapshotTree.entries,
			message: undefined,
			sequenceNumber,
			type,
		};

		return this.manager.createSummary(snapshotPayload, initial).then((response) => ({
			id: response.id,
			initialStorageName: response.initialStorageName,
		}));
	}
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IGitManager, ISummaryUploadManager } from "./storage";
import type {
	ISummaryTree,
	IWholeSummaryPayload,
	IWholeSummaryPayloadType,
} from "./storageContracts";
import { convertSummaryTreeToWholeSummaryTree } from "./storageUtils";

/**
 * Converts summary to snapshot tree and uploads with single snaphot tree payload.
 * @internal
 */
export class WholeSummaryUploadManager implements ISummaryUploadManager {
	constructor(private readonly manager: IGitManager) {}

	public async writeSummaryTree(
		summaryTree: ISummaryTree,
		parentHandle: string | undefined,
		summaryType: IWholeSummaryPayloadType,
		sequenceNumber: number = 0,
		initial: boolean = false,
		summaryTimeStr?: string,
	): Promise<string> {
		const id = await this.writeSummaryTreeCore(
			parentHandle,
			summaryTree,
			summaryType,
			sequenceNumber,
			initial,
			summaryTimeStr,
		);
		if (!id) {
			throw new Error(`Failed to write summary tree`);
		}
		return id;
	}

	private async writeSummaryTreeCore(
		parentHandle: string | undefined,
		tree: ISummaryTree,
		type: IWholeSummaryPayloadType,
		sequenceNumber: number,
		initial: boolean,
		summaryTimeStr?: string,
	): Promise<string> {
		const snapshotTree = convertSummaryTreeToWholeSummaryTree(
			parentHandle,
			tree,
			"",
			type === "channel" ? ".app" : "",
		);
		const snapshotPayload: IWholeSummaryPayload = {
			entries: snapshotTree.entries ?? [],
			message: `${type} summary upload`,
			sequenceNumber,
			type,
			summaryTime: summaryTimeStr,
		};

		return this.manager.createSummary(snapshotPayload, initial).then((response) => response.id);
	}
}

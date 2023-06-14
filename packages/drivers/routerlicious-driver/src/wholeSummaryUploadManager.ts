/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ISummaryTree,
	IWholeSummaryPayload,
	IWholeSummaryPayloadType,
	convertSummaryTreeToWholeSummaryTree,
} from "@fluidframework/server-services-client";
import { IGitManager, ISummaryUploadManager } from "./storageContracts";

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
	): Promise<string> {
		const id = await this.writeSummaryTreeCore(
			parentHandle,
			summaryTree,
			summaryType,
			sequenceNumber,
			initial,
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
	): Promise<string> {
		const snapshotTree = convertSummaryTreeToWholeSummaryTree(
			parentHandle,
			tree,
			"",
			type === "channel" ? ".app" : "",
		);
		const snapshotPayload: IWholeSummaryPayload = {
			entries: snapshotTree.entries ?? [],
			message: "",
			sequenceNumber,
			type,
		};

		return this.manager
			.createSummary(snapshotPayload, initial)
			.then((response) => response.content.id);
	}
}

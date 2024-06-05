/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IGitCommitDetails,
	IGitBlob,
	IGitCreateBlobResponse,
	IGitCreateTreeParams,
	IGitTree,
} from "@fluidframework/driver-definitions/internal";
import { runWithRetry } from "@fluidframework/driver-utils/internal";
import {
	IWholeSummaryPayload,
	IWriteSummaryResponse,
} from "@fluidframework/server-services-client";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import { IWholeFlatSnapshot } from "./contracts.js";
import { IR11sResponse } from "./restWrapper.js";
import { IGitManager } from "./storageContracts.js";

export class RetriableGitManager implements IGitManager {
	constructor(
		private readonly internalGitManager: IGitManager,
		private readonly logger: ITelemetryLoggerExt,
	) {}

	public async getCommits(
		sha: string,
		count: number,
	): Promise<IR11sResponse<IGitCommitDetails[]>> {
		return this.runWithRetry(
			async () => this.internalGitManager.getCommits(sha, count),
			"gitManager_getCommits",
		);
	}

	public async getTree(root: string, recursive: boolean): Promise<IR11sResponse<IGitTree>> {
		return this.runWithRetry(
			async () => this.internalGitManager.getTree(root, recursive),
			"gitManager_getTree",
		);
	}

	public async getBlob(sha: string): Promise<IR11sResponse<IGitBlob>> {
		return this.runWithRetry(
			async () => this.internalGitManager.getBlob(sha),
			"gitManager_getBlob",
		);
	}

	public async createBlob(
		content: string,
		encoding: string,
	): Promise<IR11sResponse<IGitCreateBlobResponse>> {
		return this.runWithRetry(
			async () => this.internalGitManager.createBlob(content, encoding),
			"gitManager_createBlob",
		);
	}

	public async createGitTree(params: IGitCreateTreeParams): Promise<IR11sResponse<IGitTree>> {
		return this.runWithRetry(
			async () => this.internalGitManager.createGitTree(params),
			"gitManager_createGitTree",
		);
	}

	public async createSummary(
		summary: IWholeSummaryPayload,
	): Promise<IR11sResponse<IWriteSummaryResponse>> {
		return this.runWithRetry(
			async () => this.internalGitManager.createSummary(summary),
			"gitManager_createSummary",
		);
	}

	public async getSnapshot(sha: string): Promise<IR11sResponse<IWholeFlatSnapshot>> {
		return this.runWithRetry(
			async () => this.internalGitManager.getSnapshot(sha),
			"gitManager_getSummary",
		);
	}

	private async runWithRetry<T>(api: () => Promise<T>, callName: string): Promise<T> {
		return runWithRetry(
			api,
			callName,
			this.logger,
			{}, // progress
		);
	}
}

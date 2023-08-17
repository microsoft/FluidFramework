/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type * as git from "@fluidframework/gitresources";
import {
	IWholeSummaryPayload,
	IWriteSummaryResponse,
} from "@fluidframework/server-services-client";
import { runWithRetry } from "@fluidframework/driver-utils";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils";
import { IGitManager } from "./storageContracts";
import { IR11sResponse } from "./restWrapper";
import { IWholeFlatSnapshot } from "./contracts";

export class RetriableGitManager implements IGitManager {
	constructor(
		private readonly internalGitManager: IGitManager,
		private readonly logger: ITelemetryLoggerExt,
	) {}

	public async getCommits(
		sha: string,
		count: number,
	): Promise<IR11sResponse<git.ICommitDetails[]>> {
		return this.runWithRetry(
			async () => this.internalGitManager.getCommits(sha, count),
			"gitManager_getCommits",
		);
	}

	public async getTree(root: string, recursive: boolean): Promise<IR11sResponse<git.ITree>> {
		return this.runWithRetry(
			async () => this.internalGitManager.getTree(root, recursive),
			"gitManager_getTree",
		);
	}

	public async getBlob(sha: string): Promise<IR11sResponse<git.IBlob>> {
		return this.runWithRetry(
			async () => this.internalGitManager.getBlob(sha),
			"gitManager_getBlob",
		);
	}

	public async createBlob(
		content: string,
		encoding: string,
	): Promise<IR11sResponse<git.ICreateBlobResponse>> {
		return this.runWithRetry(
			async () => this.internalGitManager.createBlob(content, encoding),
			"gitManager_createBlob",
		);
	}

	public async createGitTree(params: git.ICreateTreeParams): Promise<IR11sResponse<git.ITree>> {
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

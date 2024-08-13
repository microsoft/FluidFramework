/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fromUtf8ToBase64 } from "@fluid-internal/client-utils";
import type {
	IGitBlob,
	IGitCommitDetails,
	IGitCreateBlobParams,
	IGitCreateBlobResponse,
	IGitCreateTreeParams,
	IGitTree,
} from "@fluidframework/driver-definitions/internal";
import {
	IWholeSummaryPayload,
	IWriteSummaryResponse,
} from "@fluidframework/server-services-client";

import { IWholeFlatSnapshot } from "./contracts.js";
import { type QueryStringType } from "./queryStringUtils.js";
import { IR11sResponse } from "./restWrapper.js";
import { RestWrapper } from "./restWrapperBase.js";
import { IHistorian } from "./storageContracts.js";

export interface ICredentials {
	user: string;
	password: string;
}

export const getAuthorizationTokenFromCredentials = (credentials: ICredentials): string =>
	`Basic ${fromUtf8ToBase64(`${credentials.user}:${credentials.password}`)}`;

/**
 * Implementation of the IHistorian interface that calls out to a REST interface
 */
export class Historian implements IHistorian {
	private readonly defaultQueryString: QueryStringType = {};
	private readonly cacheBust: boolean;

	constructor(
		private readonly historianApi: boolean,
		disableCache: boolean,
		private readonly restWrapper: RestWrapper,
	) {
		if (disableCache && this.historianApi) {
			this.defaultQueryString.disableCache = disableCache;
			this.cacheBust = false;
		} else {
			this.cacheBust = disableCache;
		}
	}

	public async getBlob(sha: string): Promise<IR11sResponse<IGitBlob>> {
		return this.restWrapper.get<IGitBlob>(
			`/git/blobs/${encodeURIComponent(sha)}`,
			this.getQueryString(),
		);
	}

	public async createBlob(
		blob: IGitCreateBlobParams,
	): Promise<IR11sResponse<IGitCreateBlobResponse>> {
		return this.restWrapper.post<IGitCreateBlobResponse>(
			`/git/blobs`,
			blob,
			this.getQueryString(),
		);
	}

	public async getCommits(
		sha: string,
		count: number,
	): Promise<IR11sResponse<IGitCommitDetails[]>> {
		return this.restWrapper
			.get<IGitCommitDetails[]>(`/commits`, this.getQueryString({ count, sha }))
			.catch(async (error) =>
				error.statusCode === 400 || error.statusCode === 404
					? {
							content: [],
							headers: new Map(),
							propsToLog: {},
							requestUrl: "",
						}
					: Promise.reject<IR11sResponse<IGitCommitDetails[]>>(error),
			);
	}

	public async createTree(tree: IGitCreateTreeParams): Promise<IR11sResponse<IGitTree>> {
		return this.restWrapper.post<IGitTree>(`/git/trees`, tree, this.getQueryString());
	}

	public async getTree(sha: string, recursive: boolean): Promise<IR11sResponse<IGitTree>> {
		return this.restWrapper.get<IGitTree>(
			`/git/trees/${encodeURIComponent(sha)}`,
			this.getQueryString({ recursive: recursive ? 1 : 0 }),
		);
	}
	public async createSummary(
		summary: IWholeSummaryPayload,
		initial?: boolean,
	): Promise<IR11sResponse<IWriteSummaryResponse>> {
		return this.restWrapper.post<IWriteSummaryResponse>(
			`/git/summaries`,
			summary,
			this.getQueryString(initial !== undefined ? { initial } : undefined),
		);
	}

	public async getSnapshot(sha: string): Promise<IR11sResponse<IWholeFlatSnapshot>> {
		return this.restWrapper.get<IWholeFlatSnapshot>(
			`/git/summaries/${sha}`,
			this.getQueryString(),
		);
	}

	private getQueryString(queryString?: QueryStringType): QueryStringType {
		if (this.cacheBust) {
			return {
				cacheBust: Date.now(),
				...this.defaultQueryString,
				...queryString,
			};
		}
		return {
			...this.defaultQueryString,
			...queryString,
		};
	}
}

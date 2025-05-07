/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fromUtf8ToBase64 } from "@fluidframework/common-utils";
import * as git from "@fluidframework/gitresources";
import { RestWrapper, BasicRestWrapper } from "./restWrapper";
import { IHistorian } from "./storage";
import { IWholeFlatSummary, IWholeSummaryPayload, IWriteSummaryResponse } from "./storageContracts";
import { NetworkError } from "./error";
import { debug } from "./debug";
import type { IAbortSignalManager } from "./interfaces";

function endsWith(value: string, endings: string[]): boolean {
	for (const ending of endings) {
		if (value.endsWith(ending)) {
			return true;
		}
	}

	return false;
}

/**
 * @internal
 */
export interface ICredentials {
	user: string;
	password: string;
}

/**
 * @internal
 */
export const getAuthorizationTokenFromCredentials = (credentials: ICredentials): string =>
	`Basic ${fromUtf8ToBase64(`${credentials.user}:${credentials.password}`)}`;

/**
 * @internal
 */
export function parseToken(
	tenantId: string,
	authorization: string | undefined,
): string | undefined {
	let token: string | undefined;
	if (authorization) {
		const base64TokenMatch = authorization.match(/Basic (.+)/);
		if (!base64TokenMatch) {
			debug("Invalid base64 token", { tenantId });
			throw new NetworkError(403, "Malformed authorization token");
		}
		const encoded = Buffer.from(base64TokenMatch[1], "base64").toString();

		const tokenMatch = encoded.match(/(.+):(.+)/);
		if (!tokenMatch || tenantId !== tokenMatch[1]) {
			debug("Tenant mismatch or invalid token format", { tenantId });
			throw new NetworkError(403, "Malformed authorization token");
		}

		token = tokenMatch[2];
	}

	return token;
}

/**
 * Implementation of the IHistorian interface that calls out to a REST interface
 * @internal
 */
export class Historian implements IHistorian {
	private readonly defaultQueryString: Record<string, string | number | boolean> = {};
	private readonly cacheBust: boolean;
	private readonly restWrapper: RestWrapper;

	constructor(
		public endpoint: string,
		private readonly historianApi: boolean,
		disableCache: boolean,
		restWrapper?: RestWrapper,
		private readonly abortSignalManager?: IAbortSignalManager,
	) {
		if (disableCache && this.historianApi) {
			this.defaultQueryString.disableCache = disableCache;
			this.cacheBust = false;
		} else {
			this.cacheBust = disableCache;
		}

		this.restWrapper = restWrapper ?? new BasicRestWrapper(this.endpoint);
	}

	private getAbortSignalForRequest(): AbortSignal | undefined {
		return this.abortSignalManager?.getAbortSignal();
	}

	public async getHeader(sha: string): Promise<any> {
		return this.historianApi
			? this.restWrapper.get(
					`/headers/${encodeURIComponent(sha)}`,
					this.getQueryString(),
					undefined /* headers */,
					{ signal: this.getAbortSignalForRequest() },
			  )
			: this.getHeaderDirect(sha);
	}

	public async getFullTree(sha: string): Promise<any> {
		return this.restWrapper.get(
			`/tree/${encodeURIComponent(sha)}`,
			this.getQueryString(),
			undefined /* headers */,
			{ signal: this.getAbortSignalForRequest() },
		);
	}

	public async getBlob(sha: string): Promise<git.IBlob> {
		return this.restWrapper.get<git.IBlob>(
			`/git/blobs/${encodeURIComponent(sha)}`,
			this.getQueryString(),
			undefined /* headers */,
			{ signal: this.getAbortSignalForRequest() },
		);
	}

	public async createBlob(blob: git.ICreateBlobParams): Promise<git.ICreateBlobResponse> {
		return this.restWrapper.post<git.ICreateBlobResponse>(
			`/git/blobs`,
			blob,
			this.getQueryString(),
			undefined /* headers */,
			{ signal: this.getAbortSignalForRequest() },
		);
	}

	public async getContent(path: string, ref: string): Promise<any> {
		return this.restWrapper.get(
			`/contents/${path}`,
			this.getQueryString({ ref }),
			undefined /* headers */,
			{ signal: this.getAbortSignalForRequest() },
		);
	}

	public async getCommits(sha: string, count: number): Promise<git.ICommitDetails[]> {
		return this.restWrapper
			.get<git.ICommitDetails[]>(
				`/commits`,
				this.getQueryString({ count, sha }),
				undefined /* headers */,
				{ signal: this.getAbortSignalForRequest() },
			)
			.catch(async (error) =>
				error === 400 || error === 404
					? ([] as git.ICommitDetails[])
					: Promise.reject<git.ICommitDetails[]>(error),
			);
	}

	public async getCommit(sha: string): Promise<git.ICommit> {
		return this.restWrapper.get<git.ICommit>(
			`/git/commits/${encodeURIComponent(sha)}`,
			this.getQueryString(),
			undefined /* headers */,
			{ signal: this.getAbortSignalForRequest() },
		);
	}

	public async createCommit(commit: git.ICreateCommitParams): Promise<git.ICommit> {
		return this.restWrapper.post<git.ICommit>(
			`/git/commits`,
			commit,
			this.getQueryString(),
			undefined /* headers */,
			{ signal: this.getAbortSignalForRequest() },
		);
	}

	public async getRefs(): Promise<git.IRef[]> {
		return this.restWrapper.get(`/git/refs`, this.getQueryString(), undefined /* headers */, {
			signal: this.getAbortSignalForRequest(),
		});
	}

	public async getRef(ref: string): Promise<git.IRef> {
		return this.restWrapper.get(
			`/git/refs/${ref}`,
			this.getQueryString(),
			undefined /* headers */,
			{ signal: this.getAbortSignalForRequest() },
		);
	}

	public async createRef(params: git.ICreateRefParams): Promise<git.IRef> {
		return this.restWrapper.post(
			`/git/refs`,
			params,
			this.getQueryString(),
			undefined /* headers */,
			{ signal: this.getAbortSignalForRequest() },
		);
	}

	public async updateRef(ref: string, params: git.IPatchRefParams): Promise<git.IRef> {
		return this.restWrapper.patch(
			`/git/refs/${ref}`,
			params,
			this.getQueryString(),
			undefined /* headers */,
			{ signal: this.getAbortSignalForRequest() },
		);
	}

	public async deleteRef(ref: string): Promise<void> {
		await this.restWrapper.delete(
			`/git/refs/${ref}`,
			this.getQueryString(),
			undefined /* headers */,
			{ signal: this.getAbortSignalForRequest() },
		);
	}

	public async createTag(tag: git.ICreateTagParams): Promise<git.ITag> {
		return this.restWrapper.post(
			`/git/tags`,
			tag,
			this.getQueryString(),
			undefined /* headers */,
			{ signal: this.getAbortSignalForRequest() },
		);
	}

	public async getTag(tag: string): Promise<git.ITag> {
		return this.restWrapper.get(
			`/git/tags/${tag}`,
			this.getQueryString(),
			undefined /* headers */,
			{ signal: this.getAbortSignalForRequest() },
		);
	}

	public async createTree(tree: git.ICreateTreeParams): Promise<git.ITree> {
		return this.restWrapper.post<git.ITree>(
			`/git/trees`,
			tree,
			this.getQueryString(),
			undefined /* headers */,
			{ signal: this.getAbortSignalForRequest() },
		);
	}

	public async getTree(sha: string, recursive: boolean): Promise<git.ITree> {
		return this.restWrapper.get<git.ITree>(
			`/git/trees/${encodeURIComponent(sha)}`,
			this.getQueryString({ recursive: recursive ? 1 : 0 }),
			undefined /* headers */,
			{ signal: this.getAbortSignalForRequest() },
		);
	}
	public async createSummary(
		summary: IWholeSummaryPayload,
		initial?: boolean,
	): Promise<IWriteSummaryResponse> {
		return this.restWrapper.post<IWriteSummaryResponse>(
			`/git/summaries`,
			summary,
			this.getQueryString(initial !== undefined ? { initial } : undefined),
			undefined /* headers */,
			{ signal: this.getAbortSignalForRequest() },
		);
	}
	public async deleteSummary(softDelete: boolean): Promise<void> {
		const headers = { "Soft-Delete": softDelete };
		return this.restWrapper.delete(`/git/summaries`, this.getQueryString(), headers, {
			signal: this.getAbortSignalForRequest(),
		});
	}
	public async getSummary(sha: string): Promise<IWholeFlatSummary> {
		return this.restWrapper.get<IWholeFlatSummary>(
			`/git/summaries/${sha}`,
			this.getQueryString(),
			undefined /* headers */,
			{ signal: this.getAbortSignalForRequest() },
		);
	}

	private async getHeaderDirect(sha: string): Promise<git.IHeader> {
		const tree = await this.getTree(sha, true);

		const includeBlobs = [".attributes", ".blobs", ".messages", "header"];

		const blobsP: Promise<git.IBlob>[] = [];
		for (const entry of tree.tree) {
			if (entry.type === "blob" && endsWith(entry.path, includeBlobs)) {
				const blobP = this.getBlob(entry.sha);
				blobsP.push(blobP);
			}
		}
		const blobs = await Promise.all(blobsP);

		return {
			blobs,
			tree,
		};
	}

	private getQueryString(
		queryString?: Record<string, string | number | boolean>,
	): Record<string, string | number | boolean> {
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

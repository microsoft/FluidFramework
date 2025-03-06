/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as resources from "@fluidframework/gitresources";
import { buildGitTreeHierarchy } from "@fluidframework/protocol-base";
import * as api from "@fluidframework/protocol-definitions";
import { assert } from "@fluidframework/server-common-utils";
import { debug } from "./debug";
import {
	ICreateRefParamsExternal,
	IPatchRefParamsExternal,
	IGitManager,
	IHistorian,
} from "./storage";
import { IWholeFlatSummary, IWholeSummaryPayload, IWriteSummaryResponse } from "./storageContracts";

/**
 * @internal
 */
export class GitManager implements IGitManager {
	private readonly blobCache = new Map<string, resources.IBlob>();
	private readonly commitCache = new Map<string, resources.ICommit>();
	private readonly treeCache = new Map<string, resources.ITree>();
	private readonly refCache = new Map<string, string>();

	constructor(private readonly historian: IHistorian) {}

	public async getHeader(id: string, sha: string): Promise<api.ISnapshotTree> {
		const header = await this.historian.getHeader(sha);

		// Cache blobs that were sent in the header
		for (const blob of header.blobs) {
			this.blobCache.set(blob.sha, blob);
		}

		return buildGitTreeHierarchy(header.tree);
	}

	public async getFullTree(sha: string): Promise<any> {
		return this.historian.getFullTree(sha);
	}

	public async getCommit(sha: string): Promise<resources.ICommit> {
		const cachedCommit = this.commitCache.get(sha);
		if (cachedCommit !== undefined) {
			debug(`Cache hit on ${sha}`);
			return cachedCommit;
		}

		return this.historian.getCommit(sha);
	}

	/**
	 * Reads the object with the given ID. We defer to the client implementation to do the actual read.
	 */
	public async getCommits(shaOrRef: string, count: number): Promise<resources.ICommitDetails[]> {
		let sha = shaOrRef;

		// See if the sha is really a ref and convert
		const cachedRef = this.refCache.get(shaOrRef);
		if (cachedRef !== undefined) {
			debug(`Commit cache hit on ${shaOrRef}`);
			sha = cachedRef;

			// Delete refcache after first use
			this.refCache.delete(shaOrRef);

			// If null is stored for the ref then there are no commits - return an empty array
			if (!sha) {
				return [];
			}
		}

		// See if the commit sha is hashed and return it if so
		const cachedCommit = this.commitCache.get(sha);
		if (cachedCommit !== undefined) {
			debug(`Commit cache hit on ${sha}`);
			const commit = cachedCommit;
			return [
				{
					commit: {
						author: commit.author,
						committer: commit.committer,
						message: commit.message,
						tree: commit.tree,
						url: commit.url,
					},
					parents: commit.parents,
					sha: commit.sha,
					url: commit.url,
				},
			];
		}

		// Otherwise fall back to the historian
		return this.historian.getCommits(sha, count);
	}

	/**
	 * Reads the object with the given ID. We defer to the client implementation to do the actual read.
	 */
	public async getTree(root: string, recursive = true): Promise<resources.ITree> {
		const cachedTree = this.treeCache.get(root);
		if (cachedTree !== undefined) {
			debug(`Tree cache hit on ${root}`);
			return cachedTree;
		}

		return this.historian.getTree(root, recursive);
	}

	public async getBlob(sha: string): Promise<resources.IBlob> {
		const cachedBlob = this.blobCache.get(sha);
		if (cachedBlob !== undefined) {
			debug(`Blob cache hit on ${sha}`);
			return cachedBlob;
		}

		return this.historian.getBlob(sha);
	}

	public getRawUrl(sha: string): string {
		return `${this.historian.endpoint}/git/blobs/raw/${sha}`;
	}

	/**
	 * Retrieves the object at the given revision number
	 */

	public async getContent(commit: string, path: string): Promise<resources.IBlob> {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return this.historian.getContent(path, commit);
	}

	public async createBlob(
		content: string,
		encoding: "utf-8" | "base64",
	): Promise<resources.ICreateBlobResponse> {
		const blob: resources.ICreateBlobParams = {
			content,
			encoding,
		};
		return this.historian.createBlob(blob);
	}

	public async createGitTree(params: resources.ICreateTreeParams): Promise<resources.ITree> {
		const treeP = this.historian.createTree(params);
		return treeP;
	}

	public async createTree(files: api.ITree): Promise<resources.ITree> {
		return this.createTreeCore(files, 0);
	}

	public async createCommit(commit: resources.ICreateCommitParams): Promise<resources.ICommit> {
		return this.historian.createCommit(commit);
	}

	public async createSummary(
		summary: IWholeSummaryPayload,
		initial: boolean = false,
	): Promise<IWriteSummaryResponse> {
		return this.historian.createSummary(summary, initial);
	}

	public async deleteSummary(softDelete: boolean): Promise<void> {
		return this.historian.deleteSummary(softDelete);
	}

	public async getSummary(sha: string): Promise<IWholeFlatSummary> {
		return this.historian.getSummary(sha);
	}

	// eslint-disable-next-line @rushstack/no-new-null
	public async getRef(ref: string): Promise<resources.IRef | null> {
		return this.historian.getRef(`heads/${ref}`).catch((error) => {
			if (error === 400 || error === 404) {
				return null;
			} else {
				throw error;
			}
		});
	}

	public async createRef(branch: string, sha: string): Promise<resources.IRef> {
		const createRefParams: ICreateRefParamsExternal = {
			ref: `refs/heads/${branch}`,
			sha,
			config: { enabled: true },
		};

		return this.historian.createRef(createRefParams);
	}

	public async upsertRef(branch: string, commitSha: string): Promise<resources.IRef> {
		// Update (force) the ref to the new commit
		const ref: IPatchRefParamsExternal = {
			force: true,
			sha: commitSha,
			config: { enabled: true },
		};

		return this.historian.updateRef(`heads/${branch}`, ref);
	}

	public addRef(ref: string, sha: string) {
		this.refCache.set(ref, sha);
	}

	public addCommit(commit: resources.ICommit) {
		this.commitCache.set(commit.sha, commit);
	}

	public addTree(tree: resources.ITree) {
		this.treeCache.set(tree.sha, tree);
	}

	public addBlob(blob: resources.IBlob) {
		this.blobCache.set(blob.sha, blob);
	}

	/**
	 * Writes to the object with the given ID
	 */
	public async write(
		branch: string,
		inputTree: api.ITree,
		parents: string[],
		message: string,
	): Promise<resources.ICommit> {
		const tree = await this.createTree(inputTree);

		// Construct a commit for the tree
		const commitParams: resources.ICreateCommitParams = {
			author: {
				date: new Date().toISOString(),
				email: "kurtb@microsoft.com",
				name: "Kurt Berglund",
			},
			message,
			parents,
			tree: tree.sha,
		};

		const commit = await this.historian.createCommit(commitParams);

		// Create or update depending on if ref exists.
		// TODO optimize the update to know up front if the ref exists
		const existingRef = await this.getRef(branch);

		await (existingRef
			? this.upsertRef(branch, commit.sha)
			: this.createRef(branch, commit.sha));

		return commit;
	}

	private async createTreeCore(files: api.ITree, depth: number): Promise<resources.ITree> {
		// If a id is specified use it rather than creating new
		if (files.id) {
			return this.getTree(files.id);
		}

		// Kick off the work to create all the tree values
		const entriesP: Promise<resources.ICreateBlobResponse | resources.ITree>[] = [];
		for (const entry of files.entries) {
			switch (api.TreeEntry[entry.type]) {
				case api.TreeEntry.Blob: {
					const entryAsBlob = entry.value as api.IBlob;

					// Symlinks currently directly references a folder off the root of the tree. We adjust
					// the path based on the depth of the tree
					if (entry.mode === api.FileMode.Symlink) {
						entryAsBlob.contents = this.translateSymlink(entryAsBlob.contents, depth);
					}

					const blobP = this.createBlob(entryAsBlob.contents, entryAsBlob.encoding);
					entriesP.push(blobP);
					break;
				}

				case api.TreeEntry.Tree: {
					const entryAsTree = entry.value as api.ITree;
					const treeBlobP = this.createTreeCore(entryAsTree, depth + 1);
					entriesP.push(treeBlobP);
					break;
				}

				default:
					throw new Error("Unknown entry type");
			}
		}

		// Wait for them all to resolve
		const entries = await Promise.all(entriesP);
		const tree: resources.ICreateTreeEntry[] = [];
		assert(entries.length === files.entries.length, "File entries length is not correct");

		// Construct a new tree from the collection of hashes
		for (let i = 0; i < files.entries.length; i++) {
			const type =
				files.entries[i].type === api.TreeEntry.Tree
					? "tree"
					: files.entries[i].type === api.TreeEntry.Blob
					? "blob"
					: "commit";

			tree.push({
				mode: files.entries[i].mode,
				path: files.entries[i].path,
				sha: entries[i].sha,
				type,
			});
		}

		const requestBody: resources.ICreateTreeParams = {
			tree,
		};
		const treeP = this.historian.createTree(requestBody);
		return treeP;
	}

	private translateSymlink(link: string, depth: number): string {
		let prefix = "";
		for (let i = 0; i <= depth; i++) {
			prefix += "../";
		}

		return `${prefix}${link}`;
	}
}

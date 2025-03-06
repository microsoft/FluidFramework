/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IAuthor,
	IBlob,
	ICommit,
	ICommitDetails,
	ICommitHash,
	ICommitter,
	ICreateBlobParams,
	ICreateBlobResponse,
	ICreateCommitParams,
	ICreateRefParams,
	ICreateTagParams,
	ICreateTreeEntry,
	ICreateTreeParams,
	IPatchRefParams,
	IRef,
	ITag,
	ITree,
	ITreeEntry,
} from "@fluidframework/gitresources";
import { gitHashFile, IsoBuffer } from "@fluidframework/server-common-utils";
import {
	IHistorian,
	IWholeFlatSummary,
	IWholeSummaryPayload,
	IWriteSummaryResponse,
	NetworkError,
} from "@fluidframework/server-services-client";
import { ICollection, IDb } from "@fluidframework/server-services-core";
import { v4 as uuid } from "uuid";
import { TestDb } from "./testCollection";

/**
 * @internal
 */
export class TestHistorian implements IHistorian {
	public readonly endpoint = "";

	// back-compat 0.1010 old-collection-format
	private readonly blobs: ICollection<{
		_id: string;
		content: string;
		encoding: string;
		value?: ICreateBlobParams;
	}>;
	private readonly commits: ICollection<{
		_id: string;
		message: string;
		tree: string;
		parents: string[];
		author: IAuthor;
		value?: ICreateCommitParams;
	}>;
	private readonly trees: ICollection<{
		_id: string;
		tree: ICreateTreeEntry[];
		base_tree?: string;
		value?: ICreateTreeParams;
	}>;
	private readonly refs: ICollection<{
		_id: string;
		ref: string;
		sha: string;
		value?: ICreateRefParams;
	}>;

	constructor(db: IDb = new TestDb({})) {
		this.blobs = db.collection("blobs");
		this.commits = db.collection("commits");
		this.trees = db.collection("trees");
		this.refs = db.collection("refs");
	}

	public async getHeader(sha: string): Promise<any> {
		const tree = await this.getTree(sha, true);

		const includeBlobs = [".attributes", ".blobs", ".messages", "header"];

		const blobsP: Promise<IBlob>[] = [];
		for (const entry of tree.tree) {
			if (
				entry.type === "blob" &&
				includeBlobs.reduce((pv, cv) => pv || entry.path.endsWith(cv), false)
			) {
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

	public async getFullTree(sha: string): Promise<any> {
		throw new Error("Not Supported");
	}

	public async getBlob(sha: string): Promise<IBlob> {
		// TestCollection.findOneInternal() will return whole collection and first element will be retured!
		// So better throw here to avoid running into hard to debug issues.
		if (sha === undefined) {
			throw new Error("blob ID is undefined");
		}
		const blob = await this.blobs.findOne({ _id: sha });
		if (!blob) {
			throw new NetworkError(404, "Blob not found");
		}

		return {
			content: IsoBuffer.from(
				blob.content ?? blob.value?.content,
				blob.encoding ?? blob.value?.encoding,
			).toString("base64"),
			encoding: "base64",
			sha: blob._id,
			size:
				blob.content !== undefined ? blob.content.length : blob.value?.content.length ?? -1,
			url: "",
		};
	}

	public async createBlob(blob: ICreateBlobParams): Promise<ICreateBlobResponse> {
		const _id = await gitHashFile(IsoBuffer.from(blob.content, blob.encoding));
		await this.blobs.findOrCreate(
			{ _id },
			{
				_id,
				...blob,
				value: blob,
			},
		);
		return {
			sha: _id,
			url: "",
		};
	}

	public async getContent(path: string, ref: string): Promise<any> {
		const tree = await this.getTree(ref, true);
		for (const entry of tree.tree) {
			if (entry.path === path) {
				return this.getBlob(entry.sha);
			}
		}
	}

	public async getCommits(sha: string, count: number): Promise<ICommitDetails[]> {
		const commit = await this.getCommit(sha).catch(() => undefined);
		return commit
			? [
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
			  ]
			: [];
	}

	public async getCommit(sha: string): Promise<ICommit> {
		let commit = await this.commits.findOne({ _id: sha });
		if (!commit) {
			const ref = await this.getRef(`refs/heads/${sha}`);
			if (ref !== undefined && ref !== null) {
				commit = await this.commits.findOne({ _id: ref.object.sha });
			}
		}
		if (!commit) {
			throw new NetworkError(404, "Commit not found");
		}
		return {
			author: {} as Partial<IAuthor> as IAuthor,
			committer: {} as Partial<ICommitter> as ICommitter,
			message: commit.message ?? commit.value?.message,
			parents:
				(commit.parents !== undefined
					? commit.parents.map<ICommitHash>((p) => ({ sha: p, url: "" }))
					: commit.value?.parents.map<ICommitHash>((p) => ({ sha: p, url: "" }))) ?? [],
			sha: commit._id,
			tree: {
				sha: commit.tree ?? commit.value?.tree,
				url: "",
			},
			url: "",
		};
	}

	public async createCommit(commit: ICreateCommitParams): Promise<ICommit> {
		const _id = commit.tree;
		await this.commits.insertOne({ _id, ...commit, value: commit });
		return this.getCommit(_id);
	}

	public async createSummary(summary: IWholeSummaryPayload): Promise<IWriteSummaryResponse> {
		throw new Error("Not Supported");
	}

	public async deleteSummary(softDelete: boolean): Promise<void> {
		throw new Error("Not Supported");
	}

	public async getSummary(sha: string): Promise<IWholeFlatSummary> {
		throw new Error("Not Supported");
	}

	public async getRefs(): Promise<IRef[]> {
		throw new Error("Not Supported");
	}

	public async getRef(ref: string): Promise<IRef | null> {
		const _id = ref.startsWith("refs/") ? ref.substr(5) : ref;
		const val = await this.refs.findOne({ _id });
		if (!val) {
			return null;
		}
		return {
			ref: val.ref ?? val.value?.ref,
			url: "",
			object: {
				sha: val.sha ?? val.value?.sha,
				url: "",
				type: "",
			},
		};
	}

	public async createRef(params: ICreateRefParams): Promise<IRef> {
		const _id = params.ref.startsWith("refs/") ? params.ref.substr(5) : params.ref;
		await this.refs.insertOne({ _id, ...params, value: params });
		const newRefFromStorage = await this.getRef(params.ref);
		if (newRefFromStorage === null) {
			throw new Error("Newly created ref not found in storage.");
		}
		return newRefFromStorage;
	}

	public async updateRef(ref: string, params: IPatchRefParams): Promise<IRef> {
		const _id = ref.startsWith("refs/") ? ref.substr(5) : ref;
		await (params.force
			? this.refs.upsert({ _id }, { sha: params.sha, ref }, {})
			: this.refs.update({ _id }, { sha: params.sha, ref }, {}));
		const newRefFromStorage = await this.getRef(ref);
		if (newRefFromStorage === null) {
			throw new Error("Newly created ref not found in storage.");
		}
		return newRefFromStorage;
	}

	public async deleteRef(ref: string): Promise<void> {
		throw new Error("Not Supported");
	}

	public async createTag(tag: ICreateTagParams): Promise<ITag> {
		throw new Error("Not Supported");
	}

	public async getTag(tag: string): Promise<ITag> {
		throw new Error("Not Supported");
	}

	public async createTree(tree: ICreateTreeParams): Promise<ITree> {
		const _id = uuid();
		await this.trees.insertOne({
			_id,
			...tree,
			value: tree,
		});
		return this.getTree(_id, false);
	}

	public async getTree(sha: string, recursive: boolean): Promise<ITree> {
		return this.getTreeHelper(sha, recursive);
	}

	public async getTreeHelper(sha: string, recursive: boolean, path: string = ""): Promise<ITree> {
		const tree = await this.trees.findOne({ _id: sha });
		if (!tree) {
			throw new NetworkError(404, "Tree not found");
		}
		const finalTree: ITree = {
			sha: tree._id,
			url: "",
			tree: [],
		};
		for (const entry of tree.tree ?? tree.value?.tree ?? []) {
			const entryPath: string = path === "" ? entry.path : `${path}/${entry.path}`;
			const treeEntry: ITreeEntry = {
				mode: entry.mode,
				path: entryPath,
				sha: entry.sha,
				size: 0,
				type: entry.type,
				url: "",
			};
			finalTree.tree.push(treeEntry);
			if (entry.type === "tree" && recursive) {
				const childTree = await this.getTreeHelper(entry.sha, recursive, entryPath);
				if (childTree) {
					finalTree.tree = finalTree.tree.concat(childTree.tree);
				}
			}
		}
		return finalTree;
	}
}

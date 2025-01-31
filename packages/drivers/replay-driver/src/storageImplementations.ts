/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils/internal";
import { IClient, ISummaryTree } from "@fluidframework/driver-definitions";
import {
	IDocumentDeltaConnection,
	IDocumentDeltaStorageService,
	IDocumentService,
	IDocumentServiceEvents,
	IDocumentServiceFactory,
	IDocumentStorageService,
	IResolvedUrl,
	ISnapshotTree,
	ITree,
	IVersion,
} from "@fluidframework/driver-definitions/internal";
import { buildSnapshotTree } from "@fluidframework/driver-utils/internal";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import { EmptyDeltaStorageService } from "./emptyDeltaStorageService.js";
import { ReadDocumentStorageServiceBase } from "./replayController.js";

/**
 * Structure of snapshot on disk, when we store snapshot as single file
 * @internal
 */
export interface IFileSnapshot {
	tree: ITree;
	commits: { [key: string]: ITree };
}

/**
 * @internal
 */
export class FileSnapshotReader
	extends ReadDocumentStorageServiceBase
	implements IDocumentStorageService
{
	// IVersion.treeId used to communicate between getVersions() & getSnapshotTree() calls to indicate IVersion is ours.
	protected static readonly FileStorageVersionTreeId = "FileStorageTreeId";

	protected docId?: string;
	protected docTree: ISnapshotTree;
	protected blobs: Map<string, ArrayBufferLike>;
	protected readonly commits: { [key: string]: ITree } = {};
	protected readonly trees: { [key: string]: ISnapshotTree } = {};

	public constructor(json: IFileSnapshot) {
		super();
		this.commits = json.commits;

		this.blobs = new Map<string, ArrayBufferLike>();
		this.docTree = buildSnapshotTree(json.tree.entries, this.blobs);
	}

	public async getVersions(versionId: string | null, count: number): Promise<IVersion[]> {
		if (this.docId === undefined || this.docId === versionId || versionId === null) {
			if (versionId !== null) {
				this.docId = versionId;
			}
			return [{ id: "latest", treeId: "" }];
		}

		if (this.commits[versionId] !== undefined) {
			return [{ id: versionId, treeId: FileSnapshotReader.FileStorageVersionTreeId }];
		}
		throw new Error(`Unknown version ID: ${versionId}`);
	}

	public async getSnapshotTree(versionRequested?: IVersion): Promise<ISnapshotTree | null> {
		if (!versionRequested || versionRequested.id === "latest") {
			return this.docTree;
		}
		if (versionRequested.treeId !== FileSnapshotReader.FileStorageVersionTreeId) {
			// eslint-disable-next-line @typescript-eslint/no-base-to-string
			throw new Error(`Unknown version id: ${versionRequested}`);
		}

		let snapshotTree: ISnapshotTree | undefined = this.trees[versionRequested.id];
		if (snapshotTree === undefined) {
			// eslint-disable-next-line @fluid-internal/fluid/no-unchecked-record-access
			const tree = this.commits[versionRequested.id];
			if (tree === undefined) {
				throw new Error(`Can't find version ${versionRequested.id}`);
			}

			this.trees[versionRequested.id] = snapshotTree = buildSnapshotTree(
				tree.entries,
				this.blobs,
			);
		}
		return snapshotTree;
	}

	public async readBlob(blobId: string): Promise<ArrayBufferLike> {
		const blob = this.blobs.get(blobId);
		if (blob !== undefined) {
			return blob;
		}
		throw new Error(`Unknown blob ID: ${blobId}`);
	}
}

/**
 * @internal
 */
export class SnapshotStorage extends ReadDocumentStorageServiceBase {
	protected docId?: string;

	constructor(
		protected readonly storage: IDocumentStorageService,
		protected readonly docTree: ISnapshotTree | null,
	) {
		super();
		assert(!!this.docTree, 0x0b0 /* "Missing document snapshot tree!" */);
	}

	public async getVersions(versionId: string | null, count: number): Promise<IVersion[]> {
		if (this.docId === undefined || this.docId === versionId || versionId === null) {
			if (versionId !== null) {
				this.docId = versionId;
			}
			return [{ id: "latest", treeId: "" }];
		}
		return this.storage.getVersions(versionId, count);
	}

	public async getSnapshotTree(versionRequested?: IVersion): Promise<ISnapshotTree | null> {
		if (versionRequested && versionRequested.id !== "latest") {
			return this.storage.getSnapshotTree(versionRequested);
		}

		return this.docTree;
	}

	public async readBlob(blobId: string): Promise<ArrayBufferLike> {
		return this.storage.readBlob(blobId);
	}
}

export class StaticStorageDocumentService
	extends TypedEventEmitter<IDocumentServiceEvents>
	implements IDocumentService
{
	constructor(
		public readonly resolvedUrl: IResolvedUrl,
		private readonly storage: IDocumentStorageService,
	) {
		super();
	}

	public dispose() {}

	public async connectToStorage(): Promise<IDocumentStorageService> {
		return this.storage;
	}

	public async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
		return new EmptyDeltaStorageService();
	}

	public async connectToDeltaStream(client: IClient): Promise<IDocumentDeltaConnection> {
		// We have no delta stream, so make it not return forever...
		return new Promise(() => {});
	}
}

/**
 * @internal
 */
export class StaticStorageDocumentServiceFactory implements IDocumentServiceFactory {
	public constructor(protected readonly storage: IDocumentStorageService) {}

	public async createDocumentService(
		fileURL: IResolvedUrl,
		logger?: ITelemetryLoggerExt,
		clientIsSummarizer?: boolean,
	): Promise<IDocumentService> {
		return new StaticStorageDocumentService(fileURL, this.storage);
	}

	// TODO: Issue-2109 Implement detach container api or put appropriate comment.
	public async createContainer(
		createNewSummary: ISummaryTree,
		resolvedUrl: IResolvedUrl,
		logger: ITelemetryLoggerExt,
		clientIsSummarizer?: boolean,
	): Promise<IDocumentService> {
		throw new Error("Not implemented");
	}
}

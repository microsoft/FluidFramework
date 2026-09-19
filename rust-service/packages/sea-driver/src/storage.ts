/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISummaryTree } from "@fluidframework/driver-definitions";
import type {
	ICreateBlobResponse,
	IDocumentStorageService,
	ISnapshotTree,
	ISummaryContext,
	ISummaryHandle,
	IVersion,
} from "@fluidframework/driver-definitions/internal";

import {
	applicationSequenceOffset,
	bytesToHex,
	compareBytes,
	decoder,
	encoder,
	hexToBytes,
	summaryType,
} from "./lifecycleHelpers.js";
import type { SeaDriverClient, SummaryEntry } from "./wasmClient.js";

/** A published summary and the entries used to construct it. */
interface UploadedSummary {
	/** Content digest returned by summary publication. */
	readonly digest: Uint8Array;
	/** Canonically ordered flattened summary entries. */
	readonly entries: readonly SummaryEntry[];
}

/** A summary blob retained without encoding or copying its content until upload admission. */
interface PendingBlob {
	/** Canonical manifest path for the uploaded blob. */
	readonly path: Uint8Array;
	/** Caller-owned content kept until its upload completes. */
	readonly content: string | Uint8Array;
}

/** Maximum outstanding blob requests per summary, independent of its nesting depth. */
const summaryUploadConcurrency = 8;

/**
 * Content-addressed storage adapter for full Fluid summary trees and blobs.
 * @internal
 */
export class SeaDocumentStorage implements IDocumentStorageService {
	/** Fluid cache policy for immutable content-addressed storage. */
	public readonly policies = { maximumCacheDurationMs: 432_000_000 as const };

	/** Creates storage for one document over a shared serialized client. */
	public constructor(private readonly client: SeaDriverClient) {}

	/** Resolves the latest summary or a caller-provided content digest. */
	public async getVersions(versionId: string | null, count: number): Promise<IVersion[]> {
		if (count <= 0) {
			return [];
		}
		const snapshot =
			versionId === null
				? await this.client.latestSnapshot()
				: await this.client.snapshot(hexToBytes(versionId));
		if (snapshot !== undefined) {
			return [{ id: bytesToHex(snapshot.id), treeId: bytesToHex(snapshot.root) }];
		}
		const digest = versionId === null ? (await this.client.latestSnapshot())?.root : undefined;
		return digest === undefined
			? []
			: [{ id: bytesToHex(digest), treeId: bytesToHex(digest) }];
	}

	/** Reconstructs a Fluid snapshot tree from a flattened summary manifest. */
	public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
		const versions = version === undefined ? await this.getVersions(null, 1) : [version];
		const selected = versions[0];
		if (selected === undefined) {
			return null;
		}
		const entries = await this.client.fetchSummary(hexToBytes(selected.treeId ?? selected.id));
		return this.snapshotTree(selected.id, entries);
	}

	/** Uploads an immutable blob and returns its hexadecimal content digest. */
	public async createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse> {
		const upload = await this.client.uploadBlob(new Uint8Array(file));
		return { id: bytesToHex(upload.digest) };
	}

	/** Reads an immutable blob by hexadecimal content digest. */
	public async readBlob(id: string): Promise<ArrayBufferLike> {
		return (await this.client.fetchBlob(hexToBytes(id))).slice().buffer;
	}

	/** Uploads a full summary and publishes it as the latest snapshot. */
	public async uploadSummaryWithContext(
		summary: ISummaryTree,
		context: ISummaryContext,
	): Promise<string> {
		const parentHandle = context.ackHandle ?? context.proposalHandle;
		const parentSnapshot =
			parentHandle === undefined
				? undefined
				: await this.client.snapshot(hexToBytes(parentHandle));
		const parentEntries =
			parentSnapshot === undefined
				? undefined
				: await this.client.fetchSummary(parentSnapshot.root);
		const uploaded = await this.uploadSummary(summary, parentEntries);
		const eventSequenceNumber =
			context.referenceSequenceNumber -
			(this.client.applicationSequenceOffset ?? applicationSequenceOffset);
		const atEvent =
			eventSequenceNumber <= 0
				? this.client.positionForSequence(0)
				: this.client.positionForSequence(eventSequenceNumber);
		if (eventSequenceNumber > 0 && atEvent === undefined) {
			throw new Error(
				`no Sea position is mapped to Fluid sequence ${context.referenceSequenceNumber}`,
			);
		}
		const snapshotId = await this.client.publishSnapshotRoot(
			parentSnapshot?.id,
			atEvent,
			uploaded.digest,
		);
		return bytesToHex(snapshotId);
	}

	/** Reconstructs a full summary tree from a published summary handle. */
	public async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
		if (handle.handleType !== summaryType.tree) {
			throw new Error("only full summary-tree handles are supported");
		}
		const snapshot = await this.client.snapshot(hexToBytes(handle.handle));
		const entries = await this.client.fetchSummary(
			snapshot?.root ?? hexToBytes(handle.handle),
		);
		const tree: ISummaryTree = { type: summaryType.tree, tree: {} };
		for (const entry of entries) {
			this.insertSummaryBlob(
				tree,
				decoder.decode(entry.path),
				await this.client.fetchBlob(entry.blob),
			);
		}
		return tree;
	}

	/** Satisfies the storage interface; this adapter owns no independent resources. */
	public dispose(): void {}

	/** Uploads and publishes the detached container's initial full summary. */
	public async uploadInitialSummary(summary: ISummaryTree): Promise<void> {
		const uploaded = await this.uploadSummary(summary);
		await this.client.publishSnapshotRoot(undefined, undefined, uploaded.digest);
	}

	/** Flattens, uploads, and publishes a full summary in canonical path order. */
	private async uploadSummary(
		summary: ISummaryTree,
		parentEntries?: readonly SummaryEntry[],
	): Promise<UploadedSummary> {
		const entries: SummaryEntry[] = [];
		const blobs: PendingBlob[] = [];
		const app = summary.tree[".app"];
		const protocol = summary.tree[".protocol"];
		if (app?.type === summaryType.tree && protocol?.type === summaryType.tree) {
			this.flattenSummary(app, "", entries, blobs, parentEntries);
			this.flattenSummary(protocol, ".protocol", entries, blobs, parentEntries);
		} else {
			this.flattenSummary(summary, "", entries, blobs, parentEntries);
		}
		await this.uploadBlobs(blobs, entries);
		entries.sort((left, right) => compareBytes(left.path, right.path));
		const publication = await this.client.publishSummary(entries);
		return { digest: publication.digest, entries };
	}

	/** Validates handles and collects blobs before any summary upload starts. */
	private flattenSummary(
		summary: ISummaryTree,
		prefix: string,
		entries: SummaryEntry[],
		blobs: PendingBlob[],
		parentEntries?: readonly SummaryEntry[],
	): void {
		for (const [name, object] of Object.entries(summary.tree)) {
			const path = prefix.length === 0 ? name : `${prefix}/${name}`;
			if (object.type === summaryType.tree) {
				this.flattenSummary(object, path, entries, blobs, parentEntries);
			} else if (object.type === summaryType.blob) {
				blobs.push({ path: encoder.encode(path), content: object.content });
			} else if (object.type === 4) {
				entries.push({ path: encoder.encode(path), blob: hexToBytes(object.id) });
			} else if (object.type === 3) {
				if (parentEntries === undefined) {
					throw new Error("summary handle requires an acknowledged parent snapshot");
				}
				const target = object.handle.replace(/^\//u, "");
				if (object.handleType === summaryType.blob || object.handleType === 4) {
					const referenced = parentEntries.find(
						(entry) => decoder.decode(entry.path) === target,
					);
					if (referenced === undefined) {
						throw new Error(`summary handle does not resolve: ${object.handle}`);
					}
					entries.push({ path: encoder.encode(path), blob: referenced.blob });
				} else if (object.handleType === summaryType.tree) {
					const targetPrefix = target.length === 0 ? "" : `${target}/`;
					const referenced = parentEntries.filter((entry) =>
						decoder.decode(entry.path).startsWith(targetPrefix),
					);
					if (referenced.length === 0) {
						throw new Error(`summary tree handle does not resolve: ${object.handle}`);
					}
					for (const entry of referenced) {
						const suffix = decoder.decode(entry.path).slice(targetPrefix.length);
						entries.push({
							path: encoder.encode(suffix.length === 0 ? path : `${path}/${suffix}`),
							blob: entry.blob,
						});
					}
				} else {
					throw new Error("nested summary handles are unsupported");
				}
			}
		}
	}

	/** Refills bounded upload slots and drains admitted work before propagating the first failure.
	 * No summary is published until every blob succeeds; failed uploads are not retried.
	 */
	private async uploadBlobs(
		blobs: readonly PendingBlob[],
		entries: SummaryEntry[],
	): Promise<void> {
		let next = 0;
		let failed = false;
		let failure: unknown;
		await Promise.all(
			Array.from({ length: Math.min(summaryUploadConcurrency, blobs.length) }, async () => {
				while (!failed) {
					const blob = blobs[next++];
					if (blob === undefined) return;
					try {
						const payload =
							typeof blob.content === "string" ? encoder.encode(blob.content) : blob.content;
						const upload = await this.client.uploadBlob(payload);
						entries.push({ path: blob.path, blob: upload.digest });
					} catch (error) {
						if (!failed) failure = error;
						failed = true;
					}
				}
			}),
		);
		if (failed) throw failure;
	}

	/** Reconstructs Fluid's snapshot-tree shape from a flat summary manifest. */
	private snapshotTree(id: string, entries: readonly SummaryEntry[]): ISnapshotTree {
		const root: ISnapshotTree = { id, blobs: {}, trees: {} };
		for (const entry of entries) {
			const parts = decoder.decode(entry.path).split("/");
			const name = parts.pop();
			if (name === undefined || name.length === 0) {
				throw new Error("invalid empty summary path");
			}
			let parent = root;
			for (const part of parts) {
				parent = parent.trees[part] ??= { blobs: {}, trees: {} };
			}
			parent.blobs[name] = bytesToHex(entry.blob);
		}
		return root;
	}

	/** Inserts one fetched blob into a mutable full-summary tree. */
	private insertSummaryBlob(tree: ISummaryTree, path: string, payload: Uint8Array): void {
		const parts = path.split("/");
		const name = parts.pop();
		if (name === undefined || name.length === 0) {
			throw new Error("invalid empty summary path");
		}
		let parent = tree;
		for (const part of parts) {
			const existing = parent.tree[part];
			if (existing === undefined) {
				const child: ISummaryTree = { type: summaryType.tree, tree: {} };
				parent.tree[part] = child;
				parent = child;
			} else if (existing.type === summaryType.tree) {
				parent = existing;
			} else {
				throw new Error(`summary path collides at ${part}`);
			}
		}
		parent.tree[name] = { type: summaryType.blob, content: payload };
	}
}

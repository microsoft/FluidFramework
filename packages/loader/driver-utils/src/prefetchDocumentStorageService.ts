/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IDocumentStorageServicePolicies,
	ISnapshotTree,
	IVersion,
} from "@fluidframework/driver-definitions/internal";
import { LoaderCachingPolicy } from "@fluidframework/driver-definitions/internal";

import { DocumentStorageServiceProxy } from "./documentStorageServiceProxy.js";
import { canRetryOnError } from "./network.js";

/**
 * @internal
 */
export class PrefetchDocumentStorageService extends DocumentStorageServiceProxy {
	// BlobId -> blob prefetchCache cache
	private readonly prefetchCache = new Map<string, Promise<ArrayBufferLike>>();
	private prefetchEnabled = true;

	public get policies(): IDocumentStorageServicePolicies | undefined {
		const policies = this.internalStorageService.policies;
		if (policies) {
			return { ...policies, caching: LoaderCachingPolicy.NoCaching };
		}
		return undefined;
	}

	public async getSnapshotTree(
		version?: IVersion,
		scenarioName?: string,
		// eslint-disable-next-line @rushstack/no-new-null -- legacy API compatibility
	): Promise<ISnapshotTree | null> {
		const p = this.internalStorageService.getSnapshotTree(version, scenarioName);
		if (this.prefetchEnabled) {
			// eslint-disable-next-line no-void -- explicitly ignoring returned Promise
			void p.then((tree: ISnapshotTree | null) => {
				if (tree === null) {
					return undefined;
				}
				this.prefetchTree(tree);
			});
		}
		const result = await p;
		return result;
	}

	public async readBlob(blobId: string): Promise<ArrayBufferLike> {
		return this.cachedRead(blobId);
	}
	public stopPrefetch(): void {
		this.prefetchEnabled = false;
		this.prefetchCache.clear();
	}

	private async cachedRead(blobId: string): Promise<ArrayBufferLike> {
		if (this.prefetchEnabled) {
			const prefetchedBlobP = this.prefetchCache.get(blobId);
			if (prefetchedBlobP !== undefined) {
				return prefetchedBlobP;
			}
			const prefetchedBlobPFromStorage = this.internalStorageService.readBlob(blobId);
			this.prefetchCache.set(
				blobId,
				prefetchedBlobPFromStorage.catch((error) => {
					if (canRetryOnError(error)) {
						this.prefetchCache.delete(blobId);
					}
					throw error;
				}),
			);
			return prefetchedBlobPFromStorage;
		}
		return this.internalStorageService.readBlob(blobId);
	}

	private prefetchTree(tree: ISnapshotTree): void {
		const secondary: string[] = [];
		this.prefetchTreeCore(tree, secondary);

		for (const blob of secondary) {
			// eslint-disable-next-line no-void -- explicitly ignoring returned Promise
			void this.cachedRead(blob);
		}
	}

	private prefetchTreeCore(tree: ISnapshotTree, secondary: string[]): void {
		for (const [blobKey, blob] of Object.entries(tree.blobs)) {
			if (blobKey.startsWith(".") || blobKey === "header" || blobKey.startsWith("quorum")) {
				if (blob !== null) {
					// eslint-disable-next-line no-void -- explicitly ignoring returned Promise
					void this.cachedRead(blob);
				}
			} else if (!blobKey.startsWith("deltas") && blob !== null) {
				secondary.push(blob);
			}
		}

		for (const subTree of Object.values(tree.trees)) {
			this.prefetchTreeCore(subTree, secondary);
		}
	}
}

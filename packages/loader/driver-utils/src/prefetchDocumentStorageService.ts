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
	}

	public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
		const p = this.internalStorageService.getSnapshotTree(version);
		if (this.prefetchEnabled) {
			// We don't care if the prefetch succeeds
			void p.then((tree: ISnapshotTree | null | undefined) => {
				if (tree === null || tree === undefined) {
					return;
				}
				this.prefetchTree(tree);
			});
		}
		return p;
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
			// Attach error handler for side effects only:
			// 1. Clear cache on retryable errors so next read retries
			// 2. Prevent unhandled rejection warning for fire-and-forget prefetch
			// Note: Callers who await the cached promise will still see the rejection
			prefetchedBlobPFromStorage.catch((error) => {
				if (canRetryOnError(error)) {
					// Only clear cache if our promise is still the cached one
					// (avoids race condition with concurrent requests)
					if (this.prefetchCache.get(blobId) === prefetchedBlobPFromStorage) {
						this.prefetchCache.delete(blobId);
					}
				}
			});
			this.prefetchCache.set(blobId, prefetchedBlobPFromStorage);
			return prefetchedBlobPFromStorage;
		}
		return this.internalStorageService.readBlob(blobId);
	}

	private prefetchTree(tree: ISnapshotTree): void {
		const secondary: string[] = [];
		this.prefetchTreeCore(tree, secondary);

		for (const blob of secondary) {
			// We don't care if the prefetch succeeds
			void this.cachedRead(blob);
		}
	}

	private prefetchTreeCore(tree: ISnapshotTree, secondary: string[]): void {
		for (const [blobKey, blob] of Object.entries(tree.blobs)) {
			if (blobKey.startsWith(".") || blobKey === "header" || blobKey.startsWith("quorum")) {
				if (blob !== null) {
					// We don't care if the prefetch succeeds
					void this.cachedRead(blob);
				}
			} else if (!blobKey.startsWith("deltas")) {
				if (blob !== null) {
					secondary.push(blob);
				}
			}
		}

		for (const subTree of Object.values(tree.trees)) {
			this.prefetchTreeCore(subTree, secondary);
		}
	}
}

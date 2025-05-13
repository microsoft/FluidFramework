/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { IContainer } from "@fluidframework/container-definitions/internal";
import {
	IGarbageCollectionState,
	concatGarbageCollectionStates,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/container-runtime/internal/test/gc";
import {
	IFluidHandleContext,
	type IFluidHandleInternal,
} from "@fluidframework/core-interfaces/internal";
import { ISummaryTree, SummaryType } from "@fluidframework/driver-definitions";
import {
	gcBlobPrefix,
	gcDeletedBlobKey,
	gcTombstoneBlobKey,
	gcTreeKey,
} from "@fluidframework/runtime-definitions/internal";
import { FluidSerializer, parseHandles } from "@fluidframework/shared-object-base/internal";
import { waitForContainerConnection } from "@fluidframework/test-utils/internal";

/**
 * Returns the garbage collection state from the GC tree in the summary.
 * Note that it assumes that all the GC data in the GC tree are summary trees or blobs and not summary handles.
 * @param summaryTree - The summary tree that contains the GC summary.
 * @returns The GC state if the GC summary tree exists, undefined otherwise.
 */
export function getGCStateFromSummary(
	summaryTree: ISummaryTree,
): IGarbageCollectionState | undefined {
	const rootGCTree = summaryTree.tree[gcTreeKey];
	if (rootGCTree === undefined) {
		return undefined;
	}
	assert.equal(
		rootGCTree.type,
		SummaryType.Tree,
		"getGCStateFromSummary: GC data should be a tree",
	);

	let rootGCState: IGarbageCollectionState = { gcNodes: {} };
	for (const key of Object.keys(rootGCTree.tree)) {
		// Skip blobs that do not start with the GC prefix.
		if (!key.startsWith(gcBlobPrefix)) {
			continue;
		}

		const gcBlob = rootGCTree.tree[key];
		assert(gcBlob !== undefined, "getGCStateFromSummary: GC state not available");
		assert.equal(
			gcBlob.type,
			SummaryType.Blob,
			"getGCStateFromSummary: GC state is not a blob",
		);
		const gcState = JSON.parse(gcBlob.content as string) as IGarbageCollectionState;
		// Merge the GC state of this blob into the root GC state.
		rootGCState = concatGarbageCollectionStates(rootGCState, gcState);
	}
	return rootGCState;
}

/**
 * Returns the `gcFeature` metadata from the summary.
 * Tests may have different expectations for GC's behavior when runtimes involved in the test have different
 * values for gcFeature.
 */
export function getGCFeatureFromSummary(summaryTree: ISummaryTree): number {
	const metadata = summaryTree.tree[".metadata"];
	assert.equal(metadata.type, SummaryType.Blob, "Expected to find metadata blob in summary");
	assert(typeof metadata.content === "string", "Expected metadata to be a string");
	const content = JSON.parse(metadata.content) as { gcFeature: number };
	return content.gcFeature;
}

/**
 * Returns the tombstone data from the GC tree in the summary.
 * Note that it assumes that the tombstone data in the GC tree is a summary blob and not summary handle.
 * @param summaryTree - The summary tree that contains the GC summary.
 * @returns The tombstone data if it exists, undefined otherwise.
 */
export function getGCTombstoneStateFromSummary(
	summaryTree: ISummaryTree,
): string[] | undefined {
	const rootGCTree = summaryTree.tree[gcTreeKey];
	if (rootGCTree === undefined) {
		return undefined;
	}

	assert.equal(
		rootGCTree.type,
		SummaryType.Tree,
		"getGCTombstoneStateFromSummary: GC data should be a tree",
	);
	const tombstoneBlob = rootGCTree.tree[gcTombstoneBlobKey];
	if (tombstoneBlob === undefined) {
		return undefined;
	}

	assert.equal(
		tombstoneBlob.type,
		SummaryType.Blob,
		"getGCTombstoneStateFromSummary: Tombstone state is not a blob",
	);
	return JSON.parse(tombstoneBlob.content as string) as string[];
}

/**
 * Returns the sweep data from the GC tree in the summary.
 * Note that it assumes that the sweep data in the GC tree is a summary blob and not summary handle.
 * @param summaryTree - The summary tree that contains the GC summary.
 * @returns The sweep data if it exists, undefined otherwise.
 */
export function getGCDeletedStateFromSummary(summaryTree: ISummaryTree): string[] | undefined {
	const rootGCTree = summaryTree.tree[gcTreeKey];
	if (rootGCTree === undefined) {
		return undefined;
	}

	assert.equal(
		rootGCTree.type,
		SummaryType.Tree,
		"getGCDeletedStateFromSummary: GC data should be a tree",
	);
	const sweepBlob = rootGCTree.tree[gcDeletedBlobKey];
	if (sweepBlob === undefined) {
		return undefined;
	}

	assert.equal(
		sweepBlob.type,
		SummaryType.Blob,
		"getGCDeletedStateFromSummary: Sweep state is not a blob",
	);
	return JSON.parse(sweepBlob.content as string) as string[];
}

export const waitForContainerWriteModeConnectionWrite = async (container: IContainer) => {
	const resolveIfActive = (res: () => void) => {
		if (container.deltaManager.active) {
			res();
		}
	};
	if (!container.deltaManager.active) {
		await new Promise<void>((resolve, reject) => {
			container.on("connected", () => resolveIfActive(resolve));
			container.once("closed", (error) => reject(error));
		});
	}
};

/**
 * We manufacture a handle to simulate a bug where an object is unreferenced in GC's view
 * (and reminder, interactive clients never update their GC data after loading),
 * but someone still has a handle to it.
 *
 * It's possible to achieve this truly with multiple clients where one revives it mid-session
 * after it was unreferenced for the inactive timeout, but that's more complex to implement
 * in a test and is no better than this approach
 */
export function manufactureHandle<T>(
	handleContext: IFluidHandleContext,
	url: string,
): IFluidHandleInternal<T> {
	const serializer = new FluidSerializer(handleContext);
	const handle: IFluidHandleInternal<T> = parseHandles(
		{ type: "__fluid_handle__", url },
		serializer,
	) as IFluidHandleInternal<T>;
	return handle;
}

/**
 * Reconnects the summarizer so that it is elected as the current summarizer. This is needed for two reasons:
 * 1. In ODSP, when a summary is submitted, the previous one may be deleted based on heuristics. Since these tests
 * need to load a container from an older summary, we need to load a summarizer with the old summary before a new
 * one is generated. This poses problem with summarizer election because of the second reason below.
 * 2. In these tests, summarization is disabled on the main container. However, when the first summarizer container
 * is closed, the main container is still chosen as the summarizer due to a bug. If we reconnect a new summarizer
 * after this happens, it will be chosen as the summarizer client and can do on-demand summaries.
 */
export async function reconnectSummarizerToBeElected(container: IContainer) {
	container.disconnect();
	container.connect();
	await waitForContainerConnection(container);
}

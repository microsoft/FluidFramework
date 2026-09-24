/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createHash } from "node:crypto";

import { AttachState } from "@fluidframework/container-definitions";
import { stableGCVersion } from "@fluidframework/container-runtime/internal/test/gc";
import {
	SummaryType,
	type ISummaryTree,
	type SummaryObject,
} from "@fluidframework/driver-definitions";
import type { ISnapshotTree } from "@fluidframework/driver-definitions/internal";
import {
	createIdCompressor,
	toIdCompressorWithCore,
	type SessionId,
} from "@fluidframework/id-compressor/internal";
import { addBlobToSummary, SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
import { configuredSharedTree } from "@fluidframework/tree/internal";

import type { MaterializedSnapshot } from "./seedRuntimeAdapter.js";
import { parseSeed } from "./textSeedFormat.js";
import { documentFromSeed, viewConfiguration } from "./textTreeSchema.js";

/**
 * Fixed application registry, graph paths and alias in the internal construction fixture.
 */
export const layout = {
	storeType: "seed-text-store",
	storeId: "document",
	treeId: "tree",
	alias: "root",
};
/**
 * Pin the SharedTree collaboration codec used by all clients of this bounded reference.
 */
export const treeKind = configuredSharedTree({ minVersionForCollab: "2.0.0" });
/**
 * The native channel factory used by both construction and loading.
 */
export const treeFactory = treeKind.getFactory();

/** Shared construction allocation context; never a live joining client's session. */
const genesisSession = "beefbeef-beef-4000-8000-000000000001" as SessionId;

/**
 * Construct genuine SharedTree state at the seed checkpoint without submitting live initialization ops.
 *
 * This is an internal test fixture, not a supported general snapshot codec.
 * Fluid serializes the tree, schema, edit manager and compressor; this fixture describes their
 * enclosing datastore/runtime metadata. Loader remains responsible for replaying later operations.
 */
export function materializeSeed(input: unknown, sequenceNumber: number): MaterializedSnapshot {
	if (!Number.isSafeInteger(sequenceNumber) || sequenceNumber < 0) {
		throw new Error("Seed checkpoint must be a nonnegative safe integer");
	}
	const seed = parseSeed(input);
	const compressor = toIdCompressorWithCore(createIdCompressor(genesisSession));
	const runtime = new MockFluidDataStoreRuntime({
		id: layout.storeId,
		clientId: "seed-builder",
		idCompressor: compressor,
		attachState: AttachState.Detached,
	});
	const channel = treeFactory.create(runtime, layout.treeId);
	const view = channel.viewWith(viewConfiguration);
	try {
		view.initialize(documentFromSeed(seed));
		compressor.finalizeCreationRange(compressor.takeNextCreationRange());
		const channelSummary = channel.getAttachSummary(true, false);
		addBlobToSummary(channelSummary, ".attributes", JSON.stringify(channel.attributes));
		const channels = new SummaryTreeBuilder();
		channels.addWithStats(layout.treeId, channelSummary);
		const store = new SummaryTreeBuilder();
		store.addBlob(
			".component",
			JSON.stringify({
				pkg: JSON.stringify([layout.storeType]),
				summaryFormatVersion: 2,
				isRootDataStore: true,
			}),
		);
		store.addWithStats(".channels", channels);
		const stores = new SummaryTreeBuilder();
		stores.addWithStats(layout.storeId, store);
		const result = new SummaryTreeBuilder();
		// Mirrors the shape ContainerRuntime writes at summarization time; see
		// packages/runtime/container-runtime/src/containerRuntime.ts (search "summaryFormatVersion: 1")
		// for the authoritative, evolving metadata contract this fixture pins to a snapshot in time.
		result.addBlob(
			".metadata",
			JSON.stringify({
				summaryFormatVersion: 1,
				summaryNumber: 0,
				gcFeature: stableGCVersion,
				message: { sequenceNumber: -1 },
				lastMessage: {
					sequenceNumber,
					minimumSequenceNumber: 0,
					referenceSequenceNumber: sequenceNumber,
					clientSequenceNumber: 0,
					// eslint-disable-next-line unicorn/no-null -- Native message metadata uses null for an absent client.
					clientId: null,
					timestamp: 0,
					type: "noop",
				},
				documentSchema: {
					version: 1,
					refSeq: sequenceNumber,
					runtime: {
						explicitSchemaControl: true,
						idCompressorMode: "on",
						opGroupingEnabled: true,
						compressionLz4: true,
					},
				},
			}),
		);
		result.addBlob(".aliases", JSON.stringify([[layout.alias, layout.storeId]]));
		result.addBlob(".idCompressor", JSON.stringify(compressor.serialize(false)));
		result.addWithStats(".channels", stores);
		const blobs = new Map<string, ArrayBuffer>();
		/** Use content identities only for local blob lookup, not compatibility or authentication. */
		function toSnapshot(summary: ISummaryTree): ISnapshotTree {
			const snapshot: ISnapshotTree = { blobs: {}, trees: {} };
			for (const key of Object.keys(summary.tree).sort()) {
				const entry: SummaryObject | undefined = summary.tree[key];
				if (entry?.type === SummaryType.Tree) {
					snapshot.trees[key] = toSnapshot(entry);
				} else if (entry?.type === SummaryType.Blob) {
					const bytes =
						typeof entry.content === "string"
							? Buffer.from(entry.content)
							: Buffer.from(entry.content);
					const id = `seed:${createHash("sha256").update(bytes).digest("hex")}`;
					snapshot.blobs[key] = id;
					blobs.set(id, Uint8Array.from(bytes).buffer);
				} else {
					throw new Error("Initial native state must contain only trees and blobs");
				}
			}
			return snapshot;
		}
		return { snapshot: toSnapshot(result.summary), blobs };
	} finally {
		view.dispose();
		runtime.dispose();
	}
}

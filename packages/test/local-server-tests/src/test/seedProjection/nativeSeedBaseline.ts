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

import { parseHtml, serializeHtml } from "./htmlSeedFormat.js";
import { HtmlDocument, toTree, viewConfiguration } from "./htmlTreeSchema.js";
import type { HtmlParts } from "./externalSeedFile.js";

export const storeType = "reference-html-store";
export const storeId = "document";
export const treeId = "tree";
export const rootAlias = "root";
export const treeFactory = configuredSharedTree({ minVersionForCollab: "2.0.0" }).getFactory();
const genesisSession = "beefbeef-beef-4000-8000-000000000001" as SessionId;

/**
 * Complete native application baseline presented to ContainerRuntime before normal loading.
 * This is an in-memory projection, not a new persisted snapshot or a replacement protocol envelope.
 */
export interface NativeBaseline {
	/** Full runtime-root summary containing native metadata, aliases, compressor, stores, and DDSs. */
	summary: ISummaryTree;
	/** Equivalent ID-only tree using deterministic `projected:<sha256>` virtual blob IDs. */
	snapshot: ISnapshotTree;
	/** UTF-8 or binary payloads for every virtual blob ID referenced by snapshot. */
	blobs: Map<string, ArrayBuffer>;
	/** Lowercase 64-hex SHA-256 of the sorted snapshot JSON, transitively binding bytes and checkpoint. */
	fingerprint: string;
}

/**
 * Build an operation-compatible native SharedTree baseline for HTML at the source checkpoint.
 *
 * For fixed HTML, checkpoint, and pinned codec configuration, output must be byte-identical.
 * No fresh GUID, clock, random value, or live client identity may affect persisted state.
 * The fixed genesis session supplies shared construction identities; it is not a joining session.
 *
 * INTERNAL FIXTURE scaffolding, not a supported application snapshot codec.
 * The actual forest, schema, edit manager and compressor are serialized by Fluid.
 * Only the enclosing runtime/datastore/channel envelope is described here.
 * The mock supplies a disconnected DDS construction context; no collaboration or
 * summary upload/ACK is mocked in the scenario.
 *
 * htmlProjector invokes this before native runtime loading, including pending-state reconstruction.
 * It preserves the source checkpoint and does not replay its op suffix. The fingerprint diagnoses
 * incompatible reconstruction; it is not a production first-op agreement or authentication protocol.
 */
export function buildNativeBaseline(parts: HtmlParts, sequenceNumber: number): NativeBaseline {
	if (!Number.isSafeInteger(sequenceNumber) || sequenceNumber < 0) {
		throw new Error("A native baseline requires a nonnegative integer checkpoint");
	}
	const canonicalParts = {
		first: serializeHtml(parseHtml(parts.first)),
		second: serializeHtml(parseHtml(parts.second)),
	};
	const compressor = toIdCompressorWithCore(createIdCompressor(genesisSession));
	const runtime = new MockFluidDataStoreRuntime({
		id: storeId,
		clientId: "genesis-builder",
		idCompressor: compressor,
		attachState: AttachState.Detached,
	});
	const channel = treeFactory.create(runtime, treeId);
	const view = channel.viewWith(viewConfiguration);
	try {
		view.initialize(
			new HtmlDocument({
				first: toTree(parseHtml(canonicalParts.first)),
				second: toTree(parseHtml(canonicalParts.second)),
			}),
		);
		// Detached initialization allocates real stable IDs. Finalize once, then
		// serialize without a session: every live client gets a NEW local session.
		compressor.finalizeCreationRange(compressor.takeNextCreationRange());
		const channelSummary = channel.getAttachSummary(true, false);
		addBlobToSummary(channelSummary, ".attributes", JSON.stringify(channel.attributes));
		const metadata = {
			summaryFormatVersion: 1,
			summaryNumber: 0,
			gcFeature: stableGCVersion,
			message: { sequenceNumber: -1 },
			lastMessage: {
				sequenceNumber,
				minimumSequenceNumber: 0,
				referenceSequenceNumber: sequenceNumber,
				clientSequenceNumber: 0,
				// eslint-disable-next-line unicorn/no-null -- Native message metadata represents an absent client as null.
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
		};
		const dataStoreChannels = new SummaryTreeBuilder();
		dataStoreChannels.addWithStats(treeId, channelSummary);
		const dataStore = new SummaryTreeBuilder();
		dataStore.addBlob(
			".component",
			JSON.stringify({
				pkg: JSON.stringify([storeType]),
				summaryFormatVersion: 2,
				isRootDataStore: true,
			}),
		);
		dataStore.addWithStats(".channels", dataStoreChannels);
		const runtimeChannels = new SummaryTreeBuilder();
		runtimeChannels.addWithStats(storeId, dataStore);
		const runtimeSummary = new SummaryTreeBuilder();
		runtimeSummary.addBlob(".metadata", JSON.stringify(metadata));
		runtimeSummary.addBlob(".aliases", JSON.stringify([[rootAlias, storeId]]));
		runtimeSummary.addBlob(".idCompressor", JSON.stringify(compressor.serialize(false)));
		runtimeSummary.addWithStats(".channels", runtimeChannels);
		const summary = runtimeSummary.summary;
		const blobs = new Map<string, ArrayBuffer>();
		// Sorted paths and content-addressed IDs make the snapshot and fingerprint deterministic.
		const convert = (input: ISummaryTree): ISnapshotTree => {
			const result: ISnapshotTree = { blobs: {}, trees: {} };
			for (const key of Object.keys(input.tree).sort()) {
				const value: SummaryObject | undefined = input.tree[key];
				if (value === undefined) {
					throw new Error("A native baseline summary entry must be defined");
				}
				if (value.type === SummaryType.Tree) {
					result.trees[key] = convert(value);
				} else if (value.type === SummaryType.Blob) {
					const bytes =
						typeof value.content === "string"
							? Buffer.from(value.content)
							: Buffer.from(value.content);
					const id = `projected:${createHash("sha256").update(bytes).digest("hex")}`;
					result.blobs[key] = id;
					blobs.set(id, Uint8Array.from(bytes).buffer);
				} else {
					throw new Error("A genesis baseline must contain only native trees and blobs");
				}
			}
			return result;
		};
		const snapshot = convert(summary);
		return {
			summary,
			snapshot,
			blobs,
			fingerprint: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"),
		};
	} finally {
		view.dispose();
		runtime.dispose();
	}
}

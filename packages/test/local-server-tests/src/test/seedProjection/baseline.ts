/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createHash } from "node:crypto";

import { AttachState } from "@fluidframework/container-definitions";
import { stableGCVersion } from "@fluidframework/container-runtime/internal/test/gc";
import { SummaryType, type ISummaryTree } from "@fluidframework/driver-definitions";
import type { ISnapshotTree } from "@fluidframework/driver-definitions/internal";
import {
	createIdCompressor,
	toIdCompressorWithCore,
	type SessionId,
} from "@fluidframework/id-compressor/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
import { configuredSharedTree } from "@fluidframework/tree/internal";

import { format, parseHtml, serializeHtml, toTree, viewConfiguration } from "./html.js";

export const storeType = "reference-html-store";
export const storeId = "document";
export const treeId = "tree";
export const rootAlias = "root";
export const projectionKey = "applicationProjection";
export const projectionGroup = "application-projection";
export const codeDetails = { package: "seed-projection-reference/1" };
export const treeFactory = configuredSharedTree({ minVersionForCollab: "2.0.0" }).getFactory();
const genesisSession = "beefbeef-beef-4000-8000-000000000001" as SessionId;

export const blob = (content: string): { type: SummaryType.Blob; content: string } => ({
	type: SummaryType.Blob,
	content,
});
export const tree = (children: ISummaryTree["tree"]): ISummaryTree => ({
	type: SummaryType.Tree,
	tree: children,
});
export const hash = (text: string): string => createHash("sha256").update(text).digest("hex");

export function projection(html: string): ISummaryTree {
	return {
		...tree({
			"manifest.work": blob(JSON.stringify({ format, html: "document.html" })),
			"document.html": blob(html),
		}),
		groupId: projectionGroup,
	};
}

/**
 * External creation never creates a Loader/Container/native model. This is just the
 * loader protocol envelope plus app-owned bytes, suitable for the backend create API.
 */
export function externalSeed(html: string): ISummaryTree {
	parseHtml(html);
	return tree({
		".protocol": tree({
			attributes: blob(JSON.stringify({ sequenceNumber: 0, minimumSequenceNumber: 0 })),
			quorumMembers: blob("[]"),
			quorumProposals: blob("[]"),
			quorumValues: blob(
				JSON.stringify([
					[
						"code",
						{
							key: "code",
							value: codeDetails,
							approvalSequenceNumber: 0,
							commitSequenceNumber: 0,
							sequenceNumber: 0,
						},
					],
				]),
			),
		}),
		".app": tree({ [projectionKey]: projection(html) }),
	});
}

export interface NativeBaseline {
	summary: ISummaryTree;
	snapshot: ISnapshotTree;
	blobs: Map<string, ArrayBuffer>;
	fingerprint: string;
}

/**
 * INTERNAL FIXTURE scaffolding, not an application snapshot codec.
 * The actual forest, schema, edit manager and compressor are serialized by Fluid.
 * Only the enclosing runtime/datastore/channel envelope is described here.
 * The mock supplies a disconnected DDS construction context; no collaboration or
 * summary upload/ACK is mocked in the scenario.
 */
export function buildNativeBaseline(html: string, sequenceNumber: number): NativeBaseline {
	if (!Number.isSafeInteger(sequenceNumber) || sequenceNumber < 0) {
		throw new Error("A native baseline requires a nonnegative integer checkpoint");
	}
	const canonicalHtml = serializeHtml(parseHtml(html));
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
		view.initialize(toTree(parseHtml(canonicalHtml)));
		// Detached initialization allocates real stable IDs. Finalize once, then
		// serialize without a session: every live client gets a NEW local session.
		compressor.finalizeCreationRange(compressor.takeNextCreationRange());
		const channelSummary = channel.getAttachSummary(true, false).summary;
		channelSummary.tree[".attributes"] = blob(JSON.stringify(channel.attributes));
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
		const summary = tree({
			".metadata": blob(JSON.stringify(metadata)),
			".aliases": blob(JSON.stringify([[rootAlias, storeId]])),
			".idCompressor": blob(JSON.stringify(compressor.serialize(false))),
			".channels": tree({
				[storeId]: tree({
					".component": blob(
						JSON.stringify({
							pkg: JSON.stringify([storeType]),
							summaryFormatVersion: 2,
							isRootDataStore: true,
						}),
					),
					".channels": tree({ [treeId]: channelSummary }),
				}),
			}),
		});
		const blobs = new Map<string, ArrayBuffer>();
		const convert = (input: ISummaryTree): ISnapshotTree => {
			const result: ISnapshotTree = { blobs: {}, trees: {} };
			for (const key of Object.keys(input.tree).sort()) {
				const value = input.tree[key];
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
		return { summary, snapshot, blobs, fingerprint: hash(JSON.stringify(snapshot)) };
	} finally {
		view.dispose();
		runtime.dispose();
	}
}

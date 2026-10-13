/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	type GraphCommit,
	type DeltaRoot,
	type RevisionTag,
	type UpPath,
	moveToDetachedField,
	rootFieldKey,
	tagChange,
	topDownPath,
} from "../core/index.js";
import { intoDelta, TreeStatus } from "../feature-libraries/index.js";
import {
	getKernel,
	isArrayNodeSchema,
	isTreeNode,
	treeNodeApi,
	type TreeLocation,
	type CapturedTreeLocation,
	type CapturedTreeLocations,
	type TreeNodeReference,
	type ResolvedTreeLocation,
	type TreeLocationResolver,
	type TreeLocationResolution,
	type TreePositionRevision,
} from "../simple-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { treeNodeFromAnchor } from "../simple-tree/core/index.js";
import { brand } from "../util/index.js";

import {
	LocationReplay,
	rewindDetachedRoots,
	type TrackedLocation,
} from "./locationReplay.js";
import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";
import type { TreeCheckout } from "./treeCheckout.js";

/**
 * Supplies the main branch's canonical sequenced state independently of its local head.
 * Only the main checkout receives this source; forks and other shared branches cannot resolve locations.
 */
export interface LocationRevisionSource {
	readonly head: GraphCommit<SharedTreeChange>;
	readonly isAttached: boolean;
}

interface DecodedReference {
	readonly path: UpPath;
	readonly length: number | undefined;
}

/**
 * Validates the private, versioned wire format before handing paths to core anchors.
 */
function decodeReference(
	reference: TreeNodeReference,
	revision: TreePositionRevision,
): DecodedReference | undefined {
	if (typeof reference !== "string") {
		return undefined;
	}
	let value: unknown;
	try {
		value = JSON.parse(reference);
	} catch (error) {
		if (error instanceof SyntaxError) {
			return undefined;
		}
		throw error;
	}
	if (
		typeof value !== "object" ||
		value === null ||
		!("version" in value) ||
		value.version !== 1 ||
		!("revision" in value) ||
		value.revision !== revision ||
		!("path" in value) ||
		!Array.isArray(value.path)
	) {
		return undefined;
	}
	let path: UpPath | undefined;
	const steps: readonly unknown[] = value.path;
	for (const step of steps) {
		if (!Array.isArray(step) || step.length !== 2) {
			return undefined;
		}
		const [field, index]: readonly unknown[] = step;
		if (
			typeof field !== "string" ||
			typeof index !== "number" ||
			!Number.isSafeInteger(index) ||
			index < 0 ||
			(path === undefined && (field !== rootFieldKey || index !== 0))
		) {
			return undefined;
		}
		path = { parent: path, parentField: brand(field), parentIndex: index };
	}
	const length = "length" in value ? value.length : undefined;
	if (
		path === undefined ||
		(length !== undefined &&
			(typeof length !== "number" || !Number.isSafeInteger(length) || length < 0))
	) {
		return undefined;
	}
	return { path, length };
}

function unavailable(reason: "target-deleted" | "invalid-location"): ResolvedTreeLocation {
	return { status: "unavailable", reason };
}

/**
 * Resolves sender-side historical paths by replaying the current branch's retained changes.
 * No graph references are retained between calls, so this cannot pin collaboration history.
 */
export class DefaultTreeLocationResolver implements TreeLocationResolver {
	private disposed = false;

	public constructor(
		private readonly checkout: TreeCheckout,
		private readonly idCompressor: IIdCompressor,
	) {}

	public dispose(): void {
		this.disposed = true;
	}

	private checkUsable(): void {
		this.checkout.breaker.use();
		if (this.disposed || this.checkout.disposed) {
			throw new UsageError(
				"Cannot use location resolution after the view has been disposed or switched branches.",
			);
		}
	}

	private revisionKey(commit: GraphCommit<SharedTreeChange>): TreePositionRevision {
		return JSON.stringify([
			"main",
			commit.revision === "root" ? "root" : this.idCompressor.decompress(commit.revision),
		]) as TreePositionRevision;
	}

	private getMainSource(): LocationRevisionSource {
		this.checkUsable();
		const source = this.checkout.getLocationRevisionSource();
		if (source === undefined) {
			throw new UsageError(
				"Location capture and resolution are only supported on the main view.",
			);
		}
		if (!source.isAttached) {
			throw new UsageError("Location capture and resolution require an attached SharedTree.");
		}
		if (this.checkout.transaction.size > 0) {
			throw new UsageError(
				"Location capture and resolution are not supported during a transaction.",
			);
		}
		return source;
	}

	public capture(locations: readonly TreeLocation[]): CapturedTreeLocations {
		const source = this.getMainSource();
		if (source.head !== this.checkout.getLocationHead()) {
			throw new UsageError(
				"Cannot capture locations while the main view has pending local edits.",
			);
		}
		if (source.head.revision === "root") {
			throw new UsageError(
				"Cannot capture locations before the main view has a sequenced revision.",
			);
		}
		const revision = this.revisionKey(source.head);
		return {
			revision,
			locations: locations.map((location): CapturedTreeLocation => {
				if (!isTreeNode(location.node)) {
					throw new UsageError("A captured location requires a SimpleTree node.");
				}
				const kernel = getKernel(location.node);
				if (
					!kernel.isHydrated() ||
					kernel.anchorNode.anchorSet !== this.checkout.forest.anchors ||
					kernel.getStatus() !== TreeStatus.InDocument
				) {
					throw new UsageError("The captured node must belong to this view's document.");
				}
				if (location.kind !== "node" && location.kind !== "sequence") {
					throw new UsageError("Unrecognized tree location kind.");
				}
				if (
					location.kind === "sequence" &&
					(!isArrayNodeSchema(kernel.schema) ||
						!Number.isSafeInteger(location.index) ||
						location.index < 0 ||
						location.index > location.node.length ||
						(location.affinity !== "before" && location.affinity !== "after"))
				) {
					throw new UsageError(
						"A sequence location requires an array, an in-bounds gap index, and an affinity.",
					);
				}
				const node = JSON.stringify({
					version: 1,
					revision,
					path: topDownPath(kernel.anchorNode).map((step) => [
						step.parentField,
						step.parentIndex,
					]),
					...(location.kind === "sequence" ? { length: location.node.length } : {}),
				}) as TreeNodeReference;
				return location.kind === "node"
					? { kind: "node", node }
					: {
							kind: "sequence",
							node,
							index: location.index,
							affinity: location.affinity,
						};
			}),
		};
	}

	public resolve(capture: CapturedTreeLocations): TreeLocationResolution {
		const source = this.getMainSource();
		const commits: GraphCommit<SharedTreeChange>[] = [];
		let commit = this.checkout.getLocationHead();
		let sequenced = false;
		while (true) {
			sequenced ||= commit === source.head;
			if (sequenced && this.revisionKey(commit) === capture.revision) {
				break;
			}
			if (commit.wasTrimmed || commit.parent === undefined) {
				return { status: "revision-unavailable" };
			}
			commits.push(commit);
			commit = commit.parent;
		}
		const deltas: { delta: DeltaRoot; revision: RevisionTag }[] = [];
		let replay: LocationReplay | undefined;
		try {
			for (const entry of commits.reverse()) {
				for (const change of entry.change.changes) {
					// Schema changes do not change node identity or location.
					// Preserve all data entries, including those interleaved with schema edits.
					if (change.type === "data") {
						deltas.push({
							delta: intoDelta(tagChange(change.innerChange, entry.revision)),
							revision: entry.revision,
						});
					}
				}
			}
			const detached = this.checkout.removedRoots.clone();
			for (let i = deltas.length - 1; i >= 0; i--) {
				const entry = deltas[i];
				assert(entry !== undefined, "Expected a delta while reconstructing repair identities");
				rewindDetachedRoots(detached, entry.delta);
			}
			const activeReplay = new LocationReplay(detached);
			replay = activeReplay;
			const tracked = capture.locations.map((location): TrackedLocation | undefined => {
				const reference = decodeReference(location.node, capture.revision);
				if (reference === undefined) {
					return undefined;
				}
				if (location.kind === "node") {
					return activeReplay.track(reference.path);
				}
				if (
					location.kind !== "sequence" ||
					reference.length === undefined ||
					!Number.isSafeInteger(location.index) ||
					location.index < 0 ||
					location.index > reference.length ||
					(location.affinity !== "before" && location.affinity !== "after")
				) {
					return undefined;
				}
				return activeReplay.track(reference.path, {
					index: location.index,
					affinity: location.affinity,
				});
			});
			for (const { delta, revision } of deltas) {
				activeReplay.apply(delta, revision);
			}
			return {
				status: "resolved",
				locations: tracked.map((location) =>
					location === undefined
						? unavailable("invalid-location")
						: this.materialize(activeReplay, location),
				),
			};
		} finally {
			replay?.dispose();
			for (const { delta } of deltas) {
				for (const build of delta.build ?? []) {
					build.trees.referenceRemoved();
				}
				for (const refresher of delta.refreshers ?? []) {
					refresher.trees.referenceRemoved();
				}
			}
		}
	}

	private materialize(
		replay: LocationReplay,
		location: TrackedLocation,
	): ResolvedTreeLocation {
		const path = replay.snapshot(location);
		if (path === undefined) {
			return unavailable("target-deleted");
		}
		const cursor = this.checkout.forest.allocateCursor("resolveLocation");
		try {
			moveToDetachedField(this.checkout.forest, cursor);
			let first = true;
			for (const step of topDownPath(path)) {
				if (!first) {
					cursor.enterField(step.parentField);
				}
				first = false;
				if (step.parentIndex >= cursor.getFieldLength()) {
					return unavailable("invalid-location");
				}
				cursor.enterNode(step.parentIndex);
			}
			const anchor = cursor.buildAnchor();
			try {
				const anchorNode = this.checkout.forest.anchors.locate(anchor);
				assert(anchorNode !== undefined, "Expected a resolved node anchor");
				const node = treeNodeFromAnchor(anchorNode);
				if (!isTreeNode(node)) {
					return unavailable("invalid-location");
				}
				if (location.gap === undefined) {
					return { status: "resolved", location: { kind: "node", node } };
				}
				const schema = treeNodeApi.schema(node);
				if (
					!isArrayNodeSchema(schema) ||
					!treeNodeApi.is(node, schema) ||
					location.gap.index > node.length
				) {
					return unavailable("invalid-location");
				}
				return { status: "resolved", location: { kind: "sequence", node, ...location.gap } };
			} finally {
				this.checkout.forest.anchors.forget(anchor);
			}
		} finally {
			cursor.free();
		}
	}
}

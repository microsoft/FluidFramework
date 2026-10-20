/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	extractJsonValidator,
	type FormatValidator,
	type SchemaValidationFunction,
} from "../codec/index.js";
import {
	type GraphCommit,
	type ChangeRebaser,
	type DeltaRoot,
	type RevisionTag,
	type UpPath,
	moveToDetachedField,
	rootFieldKey,
	tagChange,
	topDownPath,
} from "../core/index.js";
import {
	ContextSlot,
	getOrCreateHydratedFlexTreeNode,
	intoDelta,
	TreeStatus,
} from "../feature-libraries/index.js";
import {
	getKernel,
	getOrCreateNodeFromInnerNode,
	isArrayNodeSchema,
	isTreeNode,
	treeNodeApi,
	type TreeLocation,
	type TextLocationNode,
	type CapturedTreeLocation,
	type TreeGapCaptureOptions,
	type TreeNode,
	type TreeArrayNode,
	type TreeLocationResolver,
	type TreeLocationResolution,
} from "../simple-tree/index.js";
import { isTextLocationNode, textLocationArray } from "../text/index.js";
import { brand, isReadonlyArray } from "../util/index.js";

import {
	LocationReplay,
	rewindDetachedRoots,
	type TrackedLocation,
} from "./locationReplay.js";
import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";
import type { TreeCheckout } from "./treeCheckout.js";
import {
	capturedTreeLocationSchema,
	capturedTreeLocationEnvelopeSchema,
	type CapturedTreeLocationInternal,
	type CapturedRevision,
	type CapturedNodeReference,
} from "./locationFormat.js";

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
 * Checks reference semantics and converts a schema-validated path into an up-path.
 */
function decodeReference(
	value: CapturedNodeReference,
	revision: CapturedRevision,
): DecodedReference | undefined {
	if (value.version !== 1 || !matchesRevision(value.revision, revision)) {
		return undefined;
	}
	let path: UpPath | undefined;
	for (const [field, index] of value.path) {
		if (path === undefined && (field !== rootFieldKey || index !== 0)) {
			return undefined;
		}
		path = { parent: path, parentField: brand(field), parentIndex: index };
	}
	if (path === undefined) {
		return undefined;
	}
	return { path, length: value.length };
}

function matchesRevision(candidate: CapturedRevision, expected: CapturedRevision): boolean {
	return candidate.branchId === expected.branchId && candidate.revision === expected.revision;
}

function unavailable(reason: "target-deleted" | "invalid-location"): TreeLocationResolution {
	return { status: "unavailable", reason };
}

/**
 * Resolves sender-side historical paths by replaying the current branch's retained changes.
 * No graph references are retained between calls, so this cannot pin collaboration history.
 * @remarks
 * Only main's sequenced history is supported: a logical revision alone does not identify
 * a speculative or history-rebased branch state.
 * Resolution uses the current rebased local suffix, not transient rollback/reapplication events.
 * The repair-identity index is rewound before replay; tree contents are not reconstructed.
 * Sparse anchors track the historical paths forward, then the current forest supplies SimpleTree objects.
 * Cost depends on repair-index size, intervening delta traversal, path depth, and location count.
 * There is no persistent index, background subscription, or additional summary data.
 */
export class DefaultTreeLocationResolver implements TreeLocationResolver {
	private disposed = false;
	private readonly envelopeValidator: SchemaValidationFunction<
		typeof capturedTreeLocationEnvelopeSchema
	>;
	private readonly locationValidator: SchemaValidationFunction<
		typeof capturedTreeLocationSchema
	>;

	public constructor(
		private readonly checkout: TreeCheckout,
		private readonly idCompressor: IIdCompressor,
		jsonValidator: FormatValidator,
		private readonly rebaser: ChangeRebaser<SharedTreeChange>,
		private readonly mintRevisionTag: () => RevisionTag,
	) {
		const validator = extractJsonValidator(jsonValidator);
		this.envelopeValidator = validator.compile(capturedTreeLocationEnvelopeSchema);
		this.locationValidator = validator.compile(capturedTreeLocationSchema);
	}

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

	private revisionKey(commit: GraphCommit<SharedTreeChange>): CapturedRevision {
		return {
			branchId: "main",
			revision:
				commit.revision === "root" ? "root" : this.idCompressor.decompress(commit.revision),
		};
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

	public capture(location: TreeLocation): CapturedTreeLocation;
	public capture(locations: readonly TreeLocation[]): CapturedTreeLocation[];
	public capture(
		locations: TreeLocation | readonly TreeLocation[],
	): CapturedTreeLocation | CapturedTreeLocation[] {
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
		const captureOne = (location: TreeLocation): CapturedTreeLocation => {
			if (!isTreeNode(location.node)) {
				throw new UsageError("A captured location requires a SimpleTree node.");
			}
			if (location.kind !== "node" && location.kind !== "sequence") {
				throw new UsageError("Unrecognized tree location kind.");
			}
			let target = location.node;
			let text = false;
			if (location.kind === "sequence" && isTextLocationNode(location.node)) {
				target = location.node[textLocationArray];
				text = true;
			}
			const kernel = getKernel(target);
			if (
				!kernel.isHydrated() ||
				kernel.anchorNode.anchorSet !== this.checkout.forest.anchors ||
				kernel.getStatus() !== TreeStatus.InDocument
			) {
				throw new UsageError("The captured node must belong to this view's document.");
			}
			if (
				location.kind !== "node" &&
				location.movePolicy !== undefined &&
				location.movePolicy !== "follow"
			) {
				throw new UsageError('Only the "follow" move policy is supported.');
			}
			const length =
				isArrayNodeSchema(kernel.schema) && treeNodeApi.is(target, kernel.schema)
					? target.length
					: undefined;
			if (
				location.kind !== "node" &&
				(length === undefined ||
					!Number.isSafeInteger(location.index) ||
					location.index < 0 ||
					location.index > length ||
					(location.affinity !== undefined &&
						location.affinity !== "before" &&
						location.affinity !== "after"))
			) {
				throw new UsageError(
					"A sequence location requires an array or supported text node, an in-bounds gap index, and a valid affinity if provided.",
				);
			}
			const node: CapturedNodeReference = {
				version: 1,
				revision,
				path: topDownPath(kernel.anchorNode).map((step) => [
					step.parentField,
					step.parentIndex,
				]),
				...(location.kind === "node" ? {} : { length }),
			};
			const capture: CapturedTreeLocationInternal = {
				revision,
				location:
					location.kind === "node"
						? { kind: "node", node }
						: {
								kind: text ? "text" : "sequence",
								node,
								index: location.index,
								affinity: location.affinity ?? "before",
							},
			};
			return capture as unknown as CapturedTreeLocation;
		};
		return isReadonlyArray(locations) ? locations.map(captureOne) : captureOne(locations);
	}

	public captureNode(node: TreeNode): CapturedTreeLocation {
		return this.capture({ kind: "node", node });
	}

	public captureGap(
		node: TreeArrayNode | TextLocationNode,
		index: number,
		options?: TreeGapCaptureOptions,
	): CapturedTreeLocation {
		return this.capture({ kind: "sequence", node, index, ...options });
	}

	public resolve(capture: CapturedTreeLocation): TreeLocationResolution;
	public resolve(captures: readonly CapturedTreeLocation[]): TreeLocationResolution[];
	public resolve(
		captured: CapturedTreeLocation | readonly CapturedTreeLocation[],
	): TreeLocationResolution | TreeLocationResolution[] {
		const source = this.getMainSource();
		const captures = isReadonlyArray(captured) ? captured : [captured];
		const groups = new Map<
			string,
			{
				revision: CapturedRevision;
				locations: unknown[];
				indices: number[];
			}
		>();
		const results: TreeLocationResolution[] = captures.map((capture: unknown, index) => {
			if (this.envelopeValidator.check(capture)) {
				const { revision } = capture;
				const key = JSON.stringify([revision.branchId, revision.revision]);
				let group = groups.get(key);
				if (group === undefined) {
					group = { revision, locations: [], indices: [] };
					groups.set(key, group);
				}
				group.locations.push(capture.location);
				group.indices.push(index);
			}
			return { status: "revision-unavailable" };
		});
		for (const { revision, locations, indices } of groups.values()) {
			const resolved = this.#resolveRevision(revision, locations, source);
			for (const [index, result] of resolved.entries()) {
				const target = indices[index];
				assert(
					target !== undefined,
					0xd6f /* Expected a result index for every captured location */,
				);
				results[target] = result;
			}
		}
		if (isReadonlyArray(captured)) {
			return results;
		}
		assert(
			results[0] !== undefined,
			0xd70 /* Expected a result for a single captured location */,
		);
		return results[0];
	}

	#resolveRevision(
		revision: CapturedRevision,
		locations: readonly unknown[],
		source: LocationRevisionSource,
	): TreeLocationResolution[] {
		const commits: GraphCommit<SharedTreeChange>[] = [];
		let commit = this.checkout.getLocationHead();
		let sequenced = false;
		while (true) {
			sequenced ||= commit === source.head;
			if (sequenced && matchesRevision(revision, this.revisionKey(commit))) {
				break;
			}
			if (commit.wasTrimmed || commit.parent === undefined) {
				return locations.map(() => ({ status: "revision-unavailable" }));
			}
			commits.push(commit);
			commit = commit.parent;
		}
		const deltas: { delta: DeltaRoot; revision: RevisionTag }[] = [];
		let replay: LocationReplay | undefined;
		try {
			const detached = this.checkout.removedRoots.clone();
			for (const entry of commits) {
				rewindDetachedRoots(detached, entry, this.rebaser, this.mintRevisionTag());
			}
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
			const activeReplay = new LocationReplay(detached);
			replay = activeReplay;
			const tracked = locations.map(
				(location): { location: TrackedLocation; text: boolean } | undefined => {
					if (!this.locationValidator.check(location)) {
						return undefined;
					}
					const reference = decodeReference(location.node, revision);
					if (reference === undefined) {
						return undefined;
					}
					if (location.kind === "node") {
						return { location: activeReplay.track(reference.path), text: false };
					}
					if (
						(location.kind !== "sequence" && location.kind !== "text") ||
						(location.movePolicy !== undefined && location.movePolicy !== "follow") ||
						reference.length === undefined ||
						location.index > reference.length ||
						(location.affinity !== "before" && location.affinity !== "after")
					) {
						return undefined;
					}
					return {
						location: activeReplay.track(reference.path, {
							index: location.index,
							affinity: location.affinity,
						}),
						text: location.kind === "text",
					};
				},
			);
			for (const { delta, revision: deltaRevision } of deltas) {
				activeReplay.apply(delta, deltaRevision);
			}
			return tracked.map((entry) =>
				entry === undefined
					? unavailable("invalid-location")
					: this.#materialize(activeReplay, entry.location, entry.text),
			);
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

	#materialize(
		replay: LocationReplay,
		location: TrackedLocation,
		text: boolean,
	): TreeLocationResolution {
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
			const context = this.checkout.forest.anchors.slots.get(ContextSlot);
			assert(
				context !== undefined,
				0xd71 /* Expected a FlexTree context for the receiving view */,
			);
			const node = getOrCreateNodeFromInnerNode(
				getOrCreateHydratedFlexTreeNode(context, cursor),
			);
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
			if (text) {
				const owner = treeNodeApi.parent(node);
				if (
					owner !== undefined &&
					isTextLocationNode(owner) &&
					owner[textLocationArray] === node
				) {
					return {
						status: "resolved",
						location: { kind: "text", node: owner, ...location.gap },
					};
				}
			}
			return { status: "resolved", location: { kind: "sequence", node, ...location.gap } };
		} finally {
			cursor.free();
		}
	}
}

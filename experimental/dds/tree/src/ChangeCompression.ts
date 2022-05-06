/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DetachedSequenceId, NodeId, OpSpaceNodeId } from './Identifiers';
import {
	BuildInternal,
	BuildNodeInternal,
	ChangeInternal,
	CompressedChangeInternal,
	ChangeTypeInternal,
	CompressedBuildInternal,
	CompressedPlaceholderTree,
	InsertInternal,
	DetachInternal,
	SetValueInternal,
	ConstraintInternal,
} from './persisted-types';
import { ContextualizedNodeIdNormalizer } from './NodeIdUtilities';
import { copyPropertyIfDefined, fail, Mutable, ReplaceRecursive } from './Common';
import { TreeCompressor } from './TreeCompressor';
import { StringInterner } from './StringInterner';
import { convertStablePlaceIds, convertStableRangeIds } from './IdConversion';

/**
 * Encapsulates knowledge of how to compress/decompress a change into a compressed change
 * Compression and decompression each take in a {@link StringInterner} for deduplicating shared strings.
 * @internal
 */
export class ChangeCompressor {
	public constructor(private readonly treeCompressor: TreeCompressor<DetachedSequenceId>) {}

	public compress<TId extends OpSpaceNodeId>(
		change: ChangeInternal,
		interner: StringInterner,
		idNormalizer: ContextualizedNodeIdNormalizer<TId>
	): CompressedChangeInternal<TId> {
		if (change.type === ChangeTypeInternal.Build) {
			const source: CompressedPlaceholderTree<TId, DetachedSequenceId>[] = [];
			for (const node of change.source) {
				source.push(this.treeCompressor.compress(node, interner, idNormalizer));
			}
			const newChange: CompressedBuildInternal<TId> = {
				destination: change.destination,
				source,
				type: ChangeTypeInternal.CompressedBuild,
			};
			return newChange;
		} else {
			return normalizeChange(change, (id) => idNormalizer.normalizeToOpSpace(id));
		}
	}

	public decompress<TId extends OpSpaceNodeId>(
		change: CompressedChangeInternal<TId>,
		interner: StringInterner,
		idNormalizer: ContextualizedNodeIdNormalizer<TId>
	): ChangeInternal {
		if (change.type === ChangeTypeInternal.CompressedBuild) {
			const source: BuildNodeInternal[] = [];
			for (const node of change.source) {
				source.push(this.treeCompressor.decompress(node, interner, idNormalizer));
			}
			const newChange: BuildInternal = {
				destination: change.destination,
				source,
				type: ChangeTypeInternal.Build,
			};
			return newChange;
		} else {
			return normalizeChange(change, (id) => idNormalizer.normalizeToSessionSpace(id));
		}
	}
}

function normalizeChange<From extends NodeId | OpSpaceNodeId, To extends NodeId | OpSpaceNodeId>(
	change: ReplaceRecursive<Exclude<ChangeInternal, BuildInternal>, NodeId, From>,
	normalizeId: (id: From) => To
): ReplaceRecursive<Exclude<ChangeInternal, BuildInternal>, NodeId, To> {
	switch (change.type) {
		case ChangeTypeInternal.Insert: {
			const insert: ReplaceRecursive<InsertInternal, NodeId, To> = {
				source: change.source,
				destination: convertStablePlaceIds(change.destination, normalizeId),
				type: ChangeTypeInternal.Insert,
			};
			return insert;
		}
		case ChangeTypeInternal.Detach: {
			const detach: ReplaceRecursive<DetachInternal, NodeId, To> = {
				source: convertStableRangeIds(change.source, normalizeId),
				type: ChangeTypeInternal.Detach,
			};
			copyPropertyIfDefined(change, detach, 'destination');
			return detach;
		}
		case ChangeTypeInternal.SetValue: {
			const setValue: ReplaceRecursive<SetValueInternal, NodeId, To> = {
				nodeToModify: normalizeId(change.nodeToModify),
				payload: change.payload,
				type: ChangeTypeInternal.SetValue,
			};
			return setValue;
		}
		case ChangeTypeInternal.Constraint: {
			const constraint: Mutable<ReplaceRecursive<ConstraintInternal, NodeId, To>> = {
				effect: change.effect,
				toConstrain: convertStableRangeIds(change.toConstrain, normalizeId),
				type: ChangeTypeInternal.Constraint,
			};
			copyPropertyIfDefined(change, constraint, 'contentHash');
			copyPropertyIfDefined(change, constraint, 'identityHash');
			copyPropertyIfDefined(change, constraint, 'label');
			copyPropertyIfDefined(change, constraint, 'length');
			if (change.parentNode !== undefined) {
				constraint.parentNode = normalizeId(change.parentNode);
			}
			return constraint;
		}
		default:
			fail('unexpected change type');
	}
}

/**
 * Compresses the provided edit by applying `compressor` to each change and leaving other fields
 * untouched.
 */
export function compressEdit<TId extends OpSpaceNodeId, TEdit extends { changes: readonly ChangeInternal[] }>(
	compressor: ChangeCompressor,
	interner: StringInterner,
	idNormalizer: ContextualizedNodeIdNormalizer<TId>,
	edit: TEdit
): Omit<TEdit, 'changes'> & { changes: readonly CompressedChangeInternal<TId>[] } {
	return {
		...edit,
		changes: edit.changes.map((change) => compressor.compress(change, interner, idNormalizer)),
	};
}

/**
 * Decompresses the provided edit by applying `compressor` to each change and leaving other fields
 * untouched.
 */
export function decompressEdit<
	TId extends OpSpaceNodeId,
	TEdit extends { changes: readonly CompressedChangeInternal<TId>[] }
>(
	compressor: ChangeCompressor,
	interner: StringInterner,
	idNormalizer: ContextualizedNodeIdNormalizer<TId>,
	edit: TEdit
): Omit<TEdit, 'changes'> & { changes: readonly ChangeInternal[] } {
	return {
		...edit,
		changes: edit.changes.map((change) => compressor.decompress(change, interner, idNormalizer)),
	};
}

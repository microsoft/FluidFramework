/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import type { DetachedSequenceId } from './Identifiers';
import type { ChangeCompressor, TreeCompressor } from './Compression';
import { ChangeInternal, CompressedChangeInternal, ChangeTypeInternal } from './persisted-types';
import { StringInterner } from './StringInterner';

/**
 * Creates an {@link ChangeCompressor} which compresses all of the trees in 'Build' changes using the provided `treeCompressor`.
 */
export function makeChangeCompressor<TCompressedTree>(
	treeCompressor: TreeCompressor<DetachedSequenceId, TCompressedTree>
): ChangeCompressor<ChangeInternal, CompressedChangeInternal<TCompressedTree>> {
	return {
		compress: (change, interner) => {
			if (change.type === ChangeTypeInternal.Build) {
				return {
					destination: change.destination,
					source: change.source.map((node) => treeCompressor.compress(node, interner)),
					type: ChangeTypeInternal.CompressedBuild,
				};
			}
			return change;
		},
		decompress: (change, interner) => {
			if (change.type === ChangeTypeInternal.CompressedBuild) {
				return {
					destination: change.destination,
					source: change.source.map((node) => treeCompressor.decompress(node, interner)),
					type: ChangeTypeInternal.Build,
				};
			}

			return change;
		},
	};
}

/**
 * Compresses the provided edit by applying `compressor` to each change and leaving other fields
 * untouched.
 */
export function compressEdit<TChange, TCompressed, TEdit extends { changes: readonly TChange[] }>(
	compressor: ChangeCompressor<TChange, TCompressed>,
	interner: StringInterner,
	edit: TEdit
): Omit<TEdit, 'changes'> & { changes: readonly TCompressed[] } {
	return {
		...edit,
		changes: edit.changes.map((change) => compressor.compress(change, interner)),
	};
}

/**
 * Decompresses the provided edit by applying `compressor` to each change and leaving other fields
 * untouched.
 */
export function decompressEdit<TChange, TCompressed, TEdit extends { changes: readonly TCompressed[] }>(
	compressor: ChangeCompressor<TChange, TCompressed>,
	interner: StringInterner,
	edit: TEdit
): Omit<TEdit, 'changes'> & { changes: readonly TChange[] } {
	return {
		...edit,
		changes: edit.changes.map((change) => compressor.decompress(change, interner)),
	};
}

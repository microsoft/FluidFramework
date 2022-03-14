/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DetachedSequenceId } from './Identifiers';
import type { EditCompressor, TreeCompressor } from './Compression';
import {
	BuildInternal,
	BuildNodeInternal,
	ChangeInternal,
	CompressedChangeInternal,
	ChangeTypeInternal,
	CompressedBuildInternal,
	Edit,
} from './persisted-types';

/**
 * Creates an {@link EditCompressor} which compresses all of the trees in 'Build' changes using the provided `treeCompressor`.
 */
export function makeEditCompressor<TCompressedTree>(
	treeCompressor: TreeCompressor<DetachedSequenceId, TCompressedTree>
): EditCompressor<ChangeInternal, Edit<CompressedChangeInternal<TCompressedTree>>> {
	return {
		compress: (edit, interner) => {
			const changes: CompressedChangeInternal<TCompressedTree>[] = [];
			for (const change of edit.changes) {
				if (change.type === ChangeTypeInternal.Build) {
					const source: TCompressedTree[] = [];
					for (const node of change.source) {
						source.push(treeCompressor.compress(node, interner));
					}
					const newChange: CompressedBuildInternal<TCompressedTree> = {
						destination: change.destination,
						source,
						type: ChangeTypeInternal.CompressedBuild,
					};
					changes.push(newChange);
				} else {
					changes.push(change);
				}
			}

			const newEdit = { ...edit, changes };
			return newEdit;
		},
		decompress: (edit, interner) => {
			const changes: ChangeInternal[] = [];
			for (const change of edit.changes) {
				if (change.type === ChangeTypeInternal.CompressedBuild) {
					const source: BuildNodeInternal[] = [];
					for (const node of change.source) {
						source.push(treeCompressor.decompress(node, interner));
					}
					const newChange: BuildInternal = {
						destination: change.destination,
						source,
						type: ChangeTypeInternal.Build,
					};
					changes.push(newChange);
				} else {
					changes.push(change);
				}
			}

			const newEdit = { ...edit, changes };
			return newEdit;
		},
	};
}

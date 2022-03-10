/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import type { CompressedPlaceholderTree, TreeNodeSequence } from '../../generic';
import type { DetachedSequenceId } from '../../Identifiers';
import type { BuildInternal, ChangeInternal, ChangeTypeInternal } from './0.0.2';

// TODO:#55916: Add 0.1.1 types

/**
 * Compressed change format type.
 * Encodes the same information as a {@link ChangeInternal}, but uses a more compact object format for `build` changes.
 */
export type CompressedChangeInternal<TCompressedTree = CompressedBuildNode> =
	| Exclude<ChangeInternal, BuildInternal>
	| CompressedBuildInternal<TCompressedTree>;

/**
 * A compressed version of {@link BuildInternal} where the source is a sequence of compressed nodes.
 * @public
 */
export interface CompressedBuildInternal<TCompressedTree = CompressedBuildNode> {
	/** {@inheritdoc Build.destination } */
	readonly destination: DetachedSequenceId;
	/** A sequence of nodes to build in some compressed format. */
	readonly source: TreeNodeSequence<TCompressedTree>;
	/** {@inheritdoc Build."type" } */
	readonly type: typeof ChangeTypeInternal.CompressedBuild;
}

/**
 * A BuildNode that has been compressed into a {@link CompressedPlaceholderTree}.
 * @public
 */
export type CompressedBuildNode = CompressedPlaceholderTree<DetachedSequenceId>;

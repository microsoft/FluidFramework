/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import type { DetachedSequenceId } from './Identifiers';
import { PlaceholderTree } from './persisted-types';
import type { StringInterner } from './StringInterner';

/**
 * Encapsulates knowledge of how to compress/decompress a {@link PlaceholderTree} into some `TCompressed` format.
 * Compression and decompression each take in a {@link StringInterner} for deduplicating shared strings.
 * @internal
 */
export interface TreeCompressor<TPlaceholder extends DetachedSequenceId | never, TCompressed> {
	/**
	 * @param node - The {@link PlaceholderTree} to compress.
	 * @param interner - The StringInterner to use to intern strings.
	 */
	compress(node: PlaceholderTree<TPlaceholder>, interner: StringInterner): TCompressed;
	/**
	 * @param node - The node in array format to decompress
	 * @param interner - The StringInterner to use to obtain the original strings from their intern
	 */
	decompress(node: TCompressed, interner: StringInterner): PlaceholderTree<TPlaceholder>;
}

/**
 * Encapsulates knowledge of how to compress/decompress a {@link TChange} into some `TCompressed` format.
 * Compression and decompression each take in a {@link StringInterner} for deduplicating shared strings.
 * @internal
 */
export interface ChangeCompressor<TChange, TCompressed> {
	compress(change: TChange, interner: StringInterner): TCompressed;
	decompress(change: TCompressed, interner: StringInterner): TChange;
}

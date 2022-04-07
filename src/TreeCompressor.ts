/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { isDetachedSequenceId } from './Identifiers';
import type { Definition, DetachedSequenceId, InternedStringId, OpSpaceNodeId, TraitLabel } from './Identifiers';
import type { StringInterner } from './StringInterner';
import type { CompressedTraits, CompressedPlaceholderTree, PlaceholderTree } from './persisted-types';
import type { ContextualizedNodeIdNormalizer } from './NodeIdUtilities';

/**
 * Compresses a given {@link PlaceholderTree}
 * (Such as a {@link ChangeNode} or {@link BuildNode}) into an array,
 * while also string interning all node {@link Definition}s and {@link TraitLabel}s.
 * See {@link CompressedPlaceholderTree} for format.
 */
export class TreeCompressor<TPlaceholder extends DetachedSequenceId | never> {
	/**
	 * @param node - The {@link PlaceholderTree} to compress.
	 * @param interner - The StringInterner to use to intern strings.
	 */
	public compress<TId extends OpSpaceNodeId>(
		node: PlaceholderTree<TPlaceholder>,
		interner: StringInterner,
		idNormalizer: ContextualizedNodeIdNormalizer<TId>
	): CompressedPlaceholderTree<TId, TPlaceholder> {
		if (isDetachedSequenceId(node)) {
			return node;
		}

		const compressedNode: CompressedPlaceholderTree<TId, TPlaceholder> = [
			idNormalizer.normalizeToOpSpace(node.identifier),
			interner.getInternId(node.definition),
		];

		// Omit traits if empty and payload is undefined.
		const traits = Object.entries(node.traits);
		if (traits.length > 0 || node.payload !== undefined) {
			const compressedTraits: CompressedTraits<TId, TPlaceholder> = [];
			for (const [label, trait] of traits) {
				compressedTraits.push(
					interner.getInternId(label),
					trait.map((child) => this.compress(child, interner, idNormalizer))
				);
			}
			compressedNode.push(compressedTraits);
		}

		if (node.payload !== undefined) {
			compressedNode.push(node.payload);
		}

		return compressedNode;
	}

	/**
	 * @param node - The node in array format to decompress
	 * @param interner - The StringInterner to use to obtain the original strings from their intern
	 */
	public decompress<TId extends OpSpaceNodeId>(
		node: CompressedPlaceholderTree<TId, TPlaceholder>,
		interner: StringInterner,
		idNormalizer: ContextualizedNodeIdNormalizer<TId>
	): PlaceholderTree<TPlaceholder> {
		if (isDetachedSequenceId(node)) {
			return node;
		}

		const [identifier, internedDefinition, compressedTraits, payload] = node;
		const definition = interner.getString(internedDefinition) as Definition;

		const traits = {};
		if (compressedTraits !== undefined) {
			for (let i = 0; i < Object.entries(compressedTraits).length; i += 2) {
				const compressedLabel = compressedTraits[i] as InternedStringId;
				const compressedChildren = compressedTraits[i + 1] as (
					| TPlaceholder
					| CompressedPlaceholderTree<TId, TPlaceholder>
				)[];

				const decompressedTraits = compressedChildren.map((child) =>
					this.decompress(child, interner, idNormalizer)
				);

				const label = interner.getString(compressedLabel) as TraitLabel;
				traits[label] = decompressedTraits;
			}
		}

		const decompressedNode = {
			identifier: idNormalizer.normalizeToSessionSpace(identifier),
			definition,
			traits,
			...(payload !== undefined ? { payload } : {}),
		};

		return decompressedNode;
	}
}

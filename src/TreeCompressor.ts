/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import type { TreeCompressor } from './Compression';
import { Definition, DetachedSequenceId, InternedStringId, isDetachedSequenceId, TraitLabel } from './Identifiers';
import { StringInterner } from './StringInterner';
import type { CompressedTraits, CompressedPlaceholderTree, PlaceholderTree } from './persisted-types';

/**
 * {@link TreeCompressor} implementation which compresses a given {@link PlaceholderTree}
 * (Such as a {@link ChangeNode} or {@link BuildNode}) into an array,
 * while also string interning all node {@link Definition}s and {@link TraitLabel}s.
 * See {@link CompressedPlaceholderTree} for format.
 */
export class TreeCompressor_0_1_1<TPlaceholder extends DetachedSequenceId | never>
	implements TreeCompressor<TPlaceholder, CompressedPlaceholderTree<TPlaceholder>>
{
	/**
	 * {@inheritdoc TreeCompressor.compress}
	 */
	public compress(
		node: PlaceholderTree<TPlaceholder>,
		interner: StringInterner
	): CompressedPlaceholderTree<TPlaceholder> {
		if (isDetachedSequenceId(node)) {
			return node;
		}

		const compressedNode: CompressedPlaceholderTree<TPlaceholder> = [
			node.identifier,
			interner.getInternId(node.definition),
		];

		// Omit traits if empty and payload is undefined.
		const traits = Object.entries(node.traits);
		if (traits.length > 0 || node.payload !== undefined) {
			const compressedTraits: CompressedTraits<TPlaceholder> = [];
			for (const [label, trait] of traits) {
				compressedTraits.push(
					interner.getInternId(label),
					trait.map((child) => this.compress(child, interner))
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
	 * {@inheritdoc TreeCompressor.decompress}
	 */
	public decompress(
		node: CompressedPlaceholderTree<TPlaceholder>,
		interner: StringInterner
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
					| CompressedPlaceholderTree<TPlaceholder>
				)[];

				const decompressedTraits = compressedChildren.map((child) => this.decompress(child, interner));

				const label = interner.getString(compressedLabel) as TraitLabel;
				traits[label] = decompressedTraits;
			}
		}

		const decompressedNode = {
			identifier,
			definition,
			traits,
			...(payload !== undefined ? { payload } : {}),
		};

		return decompressedNode;
	}
}

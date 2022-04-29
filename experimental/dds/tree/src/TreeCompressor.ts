/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { isDetachedSequenceId } from './Identifiers';
import type { Definition, DetachedSequenceId, InternedStringId, OpSpaceNodeId, TraitLabel } from './Identifiers';
import type { StringInterner } from './StringInterner';
import type { CompressedTraits, CompressedPlaceholderTree, PlaceholderTree, Payload } from './persisted-types';
import type { ContextualizedNodeIdNormalizer } from './NodeIdUtilities';
import { assert, fail, Mutable } from './Common';

/**
 * Compresses a given {@link PlaceholderTree} into a more compact serializable format.
 */
export interface TreeCompressor<TPlaceholder extends DetachedSequenceId | never> {
	/**
	 * @param node - The {@link PlaceholderTree} to compress.
	 * @param interner - The StringInterner to use to intern strings.
	 * @param idNormalizer - A normalizer to transform node IDs into op-space
	 */
	compress<TId extends OpSpaceNodeId>(
		node: PlaceholderTree<TPlaceholder>,
		interner: StringInterner,
		idNormalizer: ContextualizedNodeIdNormalizer<TId>
	): CompressedPlaceholderTree<TId, TPlaceholder>;

	/**
	 * @param node - The {@link PlaceholderTree} to compress.
	 * @param interner - The StringInterner to use to intern strings.
	 * @param idNormalizer - A normalizer to transform node IDs into op-space
	 */
	decompress<TId extends OpSpaceNodeId>(
		node: CompressedPlaceholderTree<TId, TPlaceholder>,
		interner: StringInterner,
		idNormalizer: ContextualizedNodeIdNormalizer<TId>
	): PlaceholderTree<TPlaceholder>;
}

/**
 * Compresses a given {@link PlaceholderTree}
 * (Such as a {@link ChangeNode} or {@link BuildNode}) into an array,
 * while also string interning all node {@link Definition}s and {@link TraitLabel}s.
 * See {@link CompressedPlaceholderTree} for format.
 */
export class InterningTreeCompressor<TPlaceholder extends DetachedSequenceId | never>
	implements TreeCompressor<TPlaceholder>
{
	public compress<TId extends OpSpaceNodeId>(
		node: PlaceholderTree<TPlaceholder>,
		interner: StringInterner,
		idNormalizer: ContextualizedNodeIdNormalizer<TId>
	): CompressedPlaceholderTree<TId, TPlaceholder> {
		this.previousId = undefined;
		return this.compressI(node, interner, idNormalizer);
	}

	private compressI<TId extends OpSpaceNodeId>(
		node: PlaceholderTree<TPlaceholder>,
		interner: StringInterner,
		idNormalizer: ContextualizedNodeIdNormalizer<TId>
	): CompressedPlaceholderTree<TId, TPlaceholder> {
		if (isDetachedSequenceId(node)) {
			return node;
		}

		const internedDefinition = interner.getInternedId(node.definition) ?? node.definition;
		const normalizedId = idNormalizer.normalizeToOpSpace(node.identifier);
		const compressedId = canElideId(this.previousId, normalizedId) ? undefined : normalizedId;
		this.previousId = normalizedId;
		const compressedTraits: CompressedTraits<TId, TPlaceholder> = [];

		// Omit traits if empty and payload is undefined.
		const traits = Object.entries(node.traits).sort();
		if (traits.length > 0 || node.payload !== undefined) {
			for (const [label, trait] of traits) {
				compressedTraits.push(
					interner.getInternedId(label) ?? (label as TraitLabel),
					trait.map((child) => this.compressI(child, interner, idNormalizer))
				);
			}
		}

		const payloadTraits = node.payload !== undefined ? [node.payload, ...compressedTraits] : compressedTraits;
		if (payloadTraits.length > 0) {
			if (compressedId !== undefined) {
				return [internedDefinition, compressedId, payloadTraits];
			}
			return [internedDefinition, payloadTraits];
		}

		if (compressedId !== undefined) {
			return [internedDefinition, compressedId];
		}

		return [internedDefinition];
	}

	/** The ID that was compressed or decompressed most recently */
	private previousId?: OpSpaceNodeId;

	public decompress<TId extends OpSpaceNodeId>(
		node: CompressedPlaceholderTree<TId, TPlaceholder>,
		interner: StringInterner,
		idNormalizer: ContextualizedNodeIdNormalizer<TId>
	): PlaceholderTree<TPlaceholder> {
		if (isDetachedSequenceId(node)) {
			return node;
		}
		const rootId = node[1];
		assert(typeof rootId === 'number', 'Root node was compressed with no ID');
		this.previousId = rootId;
		return this.decompressI(node, interner, idNormalizer);
	}

	private decompressI<TId extends OpSpaceNodeId>(
		node: CompressedPlaceholderTree<TId, TPlaceholder>,
		interner: StringInterner,
		idNormalizer: ContextualizedNodeIdNormalizer<TId>
	): PlaceholderTree<TPlaceholder> {
		if (isDetachedSequenceId(node)) {
			return node;
		}

		let compressedId: TId | undefined;
		let compressedTraits:
			| [Payload, ...CompressedTraits<TId, TPlaceholder>]
			| CompressedTraits<TId, TPlaceholder>
			| undefined;
		let payload: Payload | undefined;
		const [maybeInternedDefinition, idOrPayloadTraits, payloadTraits] = node;
		if (idOrPayloadTraits !== undefined) {
			if (typeof idOrPayloadTraits === 'number') {
				compressedId = idOrPayloadTraits;
				if (payloadTraits !== undefined) {
					compressedTraits = payloadTraits;
				}
			} else {
				// TODO: This cast can be removed on typescript 4.6
				compressedTraits = idOrPayloadTraits as typeof compressedTraits;
			}
		}

		const definition =
			typeof maybeInternedDefinition === 'string'
				? maybeInternedDefinition
				: // TODO: This cast can be removed on typescript 4.6
				  (interner.getString(maybeInternedDefinition as number) as Definition);

		let identifier: TId;
		if (compressedId !== undefined) {
			identifier = compressedId;
		} else {
			const prevId = this.previousId ?? fail();
			identifier = prevId < 0 ? ((prevId - 1) as TId) : (((prevId as number) + 1) as TId);
		}
		this.previousId = identifier;

		const traits = {};
		if (compressedTraits !== undefined) {
			let offset: number;
			if (compressedTraits.length % 2 === 1) {
				offset = 1;
				payload = compressedTraits[0];
			} else {
				offset = 0;
			}
			const traitsLength = compressedTraits.length - offset;
			for (let i = 0; i < traitsLength; i += 2) {
				const offsetIndex = i + offset;
				const maybeCompressedLabel = compressedTraits[offsetIndex] as InternedStringId;
				const compressedChildren = compressedTraits[offsetIndex + 1] as (
					| TPlaceholder
					| CompressedPlaceholderTree<TId, TPlaceholder>
				)[];

				const decompressedTraits = compressedChildren.map((child) =>
					this.decompressI(child, interner, idNormalizer)
				);

				const label =
					typeof maybeCompressedLabel === 'string'
						? maybeCompressedLabel
						: (interner.getString(maybeCompressedLabel) as TraitLabel);
				traits[label] = decompressedTraits;
			}
		}

		const decompressedNode: Mutable<PlaceholderTree<TPlaceholder>> = {
			identifier: idNormalizer.normalizeToSessionSpace(identifier),
			definition,
			traits,
		};

		if (payload !== undefined) {
			decompressedNode.payload = payload;
		}

		return decompressedNode;
	}
}

function canElideId<TId extends OpSpaceNodeId>(previousId: TId | undefined, id: TId): boolean {
	if (previousId === undefined) {
		return false;
	}

	const numericId: number = previousId;
	if (numericId < 0) {
		return id === numericId - 1;
	}

	return id === numericId + 1;
}

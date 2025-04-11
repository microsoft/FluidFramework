/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, expect } from 'chai';

import { walkTree } from '../EditUtilities.js';
import {
	Definition,
	DetachedSequenceId,
	InternedStringId,
	NodeId,
	OpSpaceNodeId,
	TraitLabel,
	isDetachedSequenceId,
} from '../Identifiers.js';
import { ContextualizedNodeIdNormalizer, scopeIdNormalizer } from '../NodeIdUtilities.js';
import { RevisionView } from '../RevisionView.js';
import { MutableStringInterner } from '../StringInterner.js';
import { InterningTreeCompressor } from '../TreeCompressor.js';
import { IdCompressor, createSessionId, isFinalId, isLocalId } from '../id-compressor/index.js';
import { CompressedPlaceholderTree, PlaceholderTree, TraitMap, TreeNode } from '../persisted-types/index.js';

import { makeNodeIdContext, setUpTestTree } from './utilities/TestUtilities.js';

/**
 * Verifies a tree can round-trip through compression/decompression. Optionally also asserts the compressed state
 * matches some expected state.
 *
 * By default, this function asserts the round-tripped tree is deeply equal to the `tree` parameter.
 * If that parameter is not normalized (ex: contains extra properties), a custom `roundTripAsserter` can be passed instead.
 */
function testCompression<TPlaceholder extends DetachedSequenceId | never>(
	tree: PlaceholderTree<TPlaceholder>,
	idNormalizer: ContextualizedNodeIdNormalizer<OpSpaceNodeId>,
	compressed?: CompressedPlaceholderTree<OpSpaceNodeId, TPlaceholder>,
	roundTripAsserter?: (tree: PlaceholderTree<TPlaceholder>, roundTrippedTree: PlaceholderTree<TPlaceholder>) => void,
	internStrings: (interner: MutableStringInterner, tree: PlaceholderTree<TPlaceholder>) => void = (interner, tree) => {
		walkTree<Exclude<PlaceholderTree<DetachedSequenceId>, DetachedSequenceId>, DetachedSequenceId>(
			tree,
			(node) => {
				interner.getOrCreateInternedId(node.definition);
				for (const trait of Object.keys(node.traits).sort()) {
					interner.getOrCreateInternedId(trait);
				}
			},
			isDetachedSequenceId
		);
	}
): void {
	const interner = new MutableStringInterner();
	internStrings(interner, tree);
	const treeCompressor = new InterningTreeCompressor<TPlaceholder>();
	const compressedTree = treeCompressor.compress(tree, interner, idNormalizer);
	if (compressed !== undefined) {
		expect(compressedTree).to.deep.equal(compressed);
	}
	const internedStrings = interner.getSerializable();
	const newInterner = new MutableStringInterner(internedStrings);
	const decompressedTree = treeCompressor.decompress(compressedTree, newInterner, idNormalizer);
	if (roundTripAsserter) {
		roundTripAsserter(tree, decompressedTree);
	} else {
		expect(decompressedTree).to.deep.equal(tree);
	}
}

/**
 * Brands the passed in number as an `InternedStringId`.
 * Ergonomic helper for making expected compressed trees typecheck.
 */
function internedId(n: number): InternedStringId {
	return n as InternedStringId;
}

describe('TreeCompression', () => {
	it('noops on a placeholder root tree', () => {
		const placeholderId = 42 as DetachedSequenceId;
		const context = makeNodeIdContext();
		testCompression(placeholderId, scopeIdNormalizer(context), placeholderId);
	});

	it('can compress trees containing nested DetachedSequenceIds', () => {
		const context = makeNodeIdContext();
		const id = context.generateNodeId();
		const detachedSequenceId = 43 as DetachedSequenceId;
		const tree: PlaceholderTree<DetachedSequenceId> = {
			identifier: id,
			definition: 'node' as Definition,
			traits: {
				someTrait: [detachedSequenceId],
			},
		};
		testCompression(tree, scopeIdNormalizer(context), [
			internedId(0),
			context.normalizeToOpSpace(id),
			[internedId(1), [detachedSequenceId]],
		]);
	});

	it('omits traits and payload fields on empty leaf nodes', () => {
		const context = makeNodeIdContext();
		const id = context.generateNodeId();
		const tree: PlaceholderTree = {
			identifier: id,
			definition: 'node' as Definition,
			traits: {},
		};
		testCompression(tree, scopeIdNormalizer(context), [internedId(0), context.normalizeToOpSpace(id)]);
	});

	it('handles payloads on leaves', () => {
		const context = makeNodeIdContext();
		const id = context.generateNodeId();
		const tree: PlaceholderTree = {
			identifier: id,
			definition: 'node' as Definition,
			traits: {},
			payload: 5,
		};
		testCompression(tree, scopeIdNormalizer(context), [internedId(0), context.normalizeToOpSpace(id), [5]]);
	});

	it('handles non-interned `Definition`s', () => {
		const context = makeNodeIdContext();
		const id = context.generateNodeId();
		const definition = 'node' as Definition;
		const tree: PlaceholderTree = {
			identifier: id,
			definition,
			traits: {},
		};
		testCompression(
			tree,
			scopeIdNormalizer(context),
			[definition, context.normalizeToOpSpace(id)],
			undefined,
			() => {} /* intern nothing */
		);
	});

	it('handles non-interned `TraitLabel`s', () => {
		const context = makeNodeIdContext();
		const parentId = context.generateNodeId();
		const childId = context.generateNodeId();
		const parentDefinition = 'def1' as Definition;
		const childDefinition = 'def2' as Definition;
		const tree: PlaceholderTree = {
			identifier: parentId,
			definition: parentDefinition,
			traits: {
				trait1: [
					{
						identifier: childId,
						definition: childDefinition,
						traits: {},
					},
				],
			},
		};
		testCompression(
			tree,
			scopeIdNormalizer(context),
			[internedId(0), context.normalizeToOpSpace(parentId), ['trait1', [[internedId(1)]]]],
			undefined,
			(interner) => {
				interner.getOrCreateInternedId(parentDefinition);
				interner.getOrCreateInternedId(childDefinition);
			}
		);
	});

	it('handles intermediate nodes without payloads', () => {
		const context = makeNodeIdContext();
		const parentId = context.generateNodeId();
		const childId = context.generateNodeId();
		const parentDefinition = 'def1' as Definition;
		const childDefinition = 'def2' as Definition;
		const tree: PlaceholderTree = {
			identifier: parentId,
			definition: parentDefinition,
			traits: {
				trait1: [
					{
						identifier: childId,
						definition: childDefinition,
						traits: {},
					},
				],
			},
		};
		testCompression(tree, scopeIdNormalizer(context), [
			internedId(0),
			context.normalizeToOpSpace(parentId),
			[internedId(1), [[internedId(2)]]],
		]);
	});

	it('handles intermediate nodes with payloads', () => {
		const context = makeNodeIdContext();
		const parentId = context.generateNodeId();
		const childId = context.generateNodeId();
		const parentDefinition = 'def1' as Definition;
		const childDefinition = 'def2' as Definition;
		const payload = 'parentPayload';
		const tree: PlaceholderTree = {
			identifier: parentId,
			definition: parentDefinition,
			traits: {
				trait1: [
					{
						identifier: childId,
						definition: childDefinition,
						traits: {},
					},
				],
			},
			payload,
		};
		testCompression(tree, scopeIdNormalizer(context), [
			internedId(0),
			context.normalizeToOpSpace(parentId),
			[payload, internedId(1), [[internedId(2)]]],
		]);
	});

	it('handles traits with multiple nodes', () => {
		const tree = setUpTestTree();
		testCompression<never>(
			tree,
			scopeIdNormalizer(tree),
			[
				internedId(0),
				tree.normalizeToOpSpace(tree.identifier),
				[
					internedId(1),
					[[internedId(0), tree.normalizeToOpSpace(tree.left.identifier)]],
					internedId(2),
					[[internedId(0)]], // Right ID should be elided, but no others
				],
			],
			// SimpleTestTree contains extra properties, so deep compare as objects is insufficient. The revision view strategy
			// only works for valid standalone trees (i.e. ones without placeholders).
			(tree, treeAfterRoundTrip) => {
				expect(RevisionView.fromTree(tree).equals(RevisionView.fromTree(treeAfterRoundTrip)), 'Unequal revision views');
			}
		);
	});

	it('can round trip a tree with several levels', () => {
		const context = makeNodeIdContext();
		const makeLeaf = (): PlaceholderTree => ({
			identifier: context.generateNodeId(),
			definition: crypto.randomUUID() as Definition,
			traits: {},
		});

		// Makes a full 2-ary tree with the provided height.
		const makeTreeWithHeight = (height: number): PlaceholderTree => {
			if (height === 0) {
				return makeLeaf();
			}

			return {
				identifier: context.generateNodeId(),
				definition: crypto.randomUUID() as Definition,
				traits: {
					[crypto.randomUUID() as TraitLabel]: [makeTreeWithHeight(height - 1)],
					[crypto.randomUUID() as TraitLabel]: [makeTreeWithHeight(height - 1)],
				},
			};
		};

		testCompression(makeTreeWithHeight(3), scopeIdNormalizer(context));
	});

	it('elides IDs that span multiple children or cousins', () => {
		const reservedIdCount = 4;
		const idCompressor = new IdCompressor(createSessionId(), reservedIdCount);
		const context = makeNodeIdContext(idCompressor);
		// Order of IDs:  [-1, -2, -3, -4, 0, 1, 2, -5, 3, -6, -6]
		// After elision: [-1,  _,  _,  _, 0, _, _, -5, 3, -6, -6]
		const localIds = [...Array(6).keys()].map((_) => context.generateNodeId());
		localIds.forEach((id) => assert(isLocalId(id)));
		const finalIds = [...Array(reservedIdCount).keys()].map((_, i) => idCompressor.getReservedId(i) as NodeId);
		finalIds.forEach((id) => assert(isFinalId(id)));

		function node(
			identifier: NodeId,
			traits?: TraitMap<TreeNode<PlaceholderTree, NodeId>>
		): TreeNode<PlaceholderTree, NodeId> {
			return {
				identifier,
				definition: 'def' as Definition,
				traits: traits ?? {},
			};
		}

		const tree: PlaceholderTree = node(localIds[0], {
			zebra: [node(localIds[5]), node(localIds[5])],
			maganio: [
				node(localIds[3]),
				node(finalIds[0], {
					pardesio: [node(finalIds[2]), node(localIds[4]), node(finalIds[3])],
					hortonio: [node(finalIds[1])],
				}),
			],
			aardvark: [
				node(localIds[1], {
					basketball: [node(localIds[2])],
				}),
			],
		});

		const nodeDef = internedId(0);

		function id(id: NodeId): OpSpaceNodeId {
			return context.normalizeToOpSpace(id);
		}

		testCompression<never>(tree, scopeIdNormalizer(context), [
			nodeDef,
			id(tree.identifier),
			[
				internedId(1), // aardvark
				[[nodeDef, [internedId(4), [[nodeDef]]]]],
				internedId(2), // maganio
				[
					[nodeDef],
					[
						nodeDef,
						id(finalIds[0]),
						[
							internedId(5), // hortonio
							[[nodeDef]],
							internedId(6), // pardesio
							[[nodeDef], [nodeDef, id(localIds[4])], [nodeDef, id(finalIds[3])]],
						],
					],
				],
				internedId(3), // zebra
				[
					[nodeDef, id(localIds[5])],
					[nodeDef, id(localIds[5])],
				],
			],
		]);
	});
});

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { v4 as uuidv4 } from 'uuid';
import type { Definition, DetachedSequenceId, InternedStringId, NodeId, TraitLabel } from '../Identifiers';
import { CompressedPlaceholderTree, PlaceholderTree } from '../persisted-types';
import { RevisionView } from '../RevisionView';
import { StringInterner } from '../StringInterner';
import { TreeCompressor_0_1_1 } from '../TreeCompressor';
import { setUpTestTree } from './utilities/TestUtilities';

/**
 * Verifies a tree can round-trip through compression/decompression. Optionally also asserts the compressed state
 * matches some expected state.
 *
 * By default, this function asserts the round-tripped tree is deeply equal to the `tree` parameter.
 * If that parameter is not normalized (ex: contains extra properties), a custom `roundTripAsserter` can be passed instead.
 */
function testCompression<TPlaceholder extends DetachedSequenceId | never>(
	tree: PlaceholderTree<TPlaceholder>,
	compressed?: CompressedPlaceholderTree<TPlaceholder>,
	roundTripAsserter?: (tree: PlaceholderTree<TPlaceholder>, roundTrippedTree: PlaceholderTree<TPlaceholder>) => void
): void {
	const interner = new StringInterner();
	const treeCompressor = new TreeCompressor_0_1_1<TPlaceholder>();
	const compressedTree = treeCompressor.compress(tree, interner);
	if (compressed !== undefined) {
		expect(compressedTree).to.deep.equal(compressed);
	}
	const internedStrings = interner.getSerializable();
	const newInterner = new StringInterner(internedStrings);
	const decompressedTree = treeCompressor.decompress(compressedTree, newInterner);
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
		testCompression(placeholderId, placeholderId);
	});

	it('can compress trees containing nested DetachedSequenceIds', () => {
		const id = uuidv4() as NodeId;
		const detachedSequenceId = 43 as DetachedSequenceId;
		const tree: PlaceholderTree<DetachedSequenceId> = {
			identifier: id,
			definition: 'node' as Definition,
			traits: {
				someTrait: [detachedSequenceId],
			},
		};
		testCompression(tree, [id, internedId(0), [internedId(1), [detachedSequenceId]]]);
	});

	it('omits traits and payload fields on empty leaf nodes', () => {
		const id = uuidv4() as NodeId;
		const tree: PlaceholderTree = {
			identifier: id,
			definition: 'node' as Definition,
			traits: {},
		};
		testCompression(tree, [id, internedId(0)]);
	});

	it('handles payloads on leaves', () => {
		const id = uuidv4() as NodeId;
		const tree: PlaceholderTree = {
			identifier: id,
			definition: 'node' as Definition,
			traits: {},
			payload: 5,
		};
		testCompression(tree, [id, internedId(0), [], 5]);
	});

	it('handles intermediate nodes without payloads', () => {
		const parentId = uuidv4() as NodeId;
		const childId = uuidv4() as NodeId;
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
		testCompression(tree, [parentId, internedId(0), [internedId(1), [[childId, internedId(2)]]]]);
	});

	it('handles intermediate nodes with payloads', () => {
		const parentId = uuidv4() as NodeId;
		const childId = uuidv4() as NodeId;
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
		testCompression(tree, [parentId, internedId(0), [internedId(1), [[childId, internedId(2)]]], payload]);
	});

	it('handles traits with multiple nodes', () => {
		const tree = setUpTestTree();
		testCompression<never>(
			tree,
			[
				tree.identifier,
				internedId(0),
				[
					internedId(1),
					[[tree.left.identifier, internedId(0)]],
					internedId(2),
					[[tree.right.identifier, internedId(0)]],
				],
			],
			// SimpleTestTree contains extra properties, so deep compare as objects is insufficient. The revision view strategy
			// only works for valid standalone trees (i.e. ones without placeholders).
			(tree, treeAfterRoundTrip) => {
				expect(
					RevisionView.fromTree(tree).equals(RevisionView.fromTree(treeAfterRoundTrip)),
					'Unequal revision views'
				);
			}
		);
	});

	it('can round trip a tree with several levels', () => {
		const makeLeaf = (): PlaceholderTree => ({
			identifier: uuidv4() as NodeId,
			definition: uuidv4() as Definition,
			traits: {},
		});

		// Makes a full 2-ary tree with the provided height.
		const makeTreeWithHeight = (height: number): PlaceholderTree => {
			if (height === 0) {
				return makeLeaf();
			}

			return {
				identifier: uuidv4() as NodeId,
				definition: uuidv4() as Definition,
				traits: {
					[uuidv4() as TraitLabel]: [makeTreeWithHeight(height - 1)],
					[uuidv4() as TraitLabel]: [makeTreeWithHeight(height - 1)],
				},
			};
		};

		testCompression(makeTreeWithHeight(3));
	});
});

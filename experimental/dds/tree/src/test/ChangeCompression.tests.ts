/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { DetachedSequenceId, OpSpaceNodeId } from '../Identifiers';
import { MutableStringInterner, StringInterner } from '../StringInterner';
import {
	BuildInternal,
	ChangeInternal,
	ChangeTypeInternal,
	CompressedBuildInternal,
	CompressedChangeInternal,
	CompressedPlaceholderTree,
	ConstraintEffect,
	ConstraintInternal,
	DetachInternal,
	Edit,
	PlaceholderTree,
	SetValueInternal,
} from '../persisted-types';
import { ChangeCompressor, compressEdit, decompressEdit } from '../ChangeCompression';
import { StablePlace, StableRange } from '../ChangeTypes';
import { newEdit, newEditId } from '../EditUtilities';
import { TreeCompressor, InterningTreeCompressor } from '../TreeCompressor';
import { ContextualizedNodeIdNormalizer, scopeIdNormalizer } from '../NodeIdUtilities';
import { convertStableRangeIds } from '../IdConversion';
import { makeNodeIdContext, setUpTestTree } from './utilities/TestUtilities';

// CompressedChange type for this test suite. It aligns with CompressedChangeInternal but doesn't actually compress trees.
type TestCompressedChange = CompressedChangeInternal<OpSpaceNodeId>;

class TestTreeCompressor<TPlaceholder extends DetachedSequenceId | never> implements TreeCompressor<TPlaceholder> {
	public compressTreeCalls: PlaceholderTree<TPlaceholder>[] = [];
	public decompressTreeCalls: CompressedPlaceholderTree<OpSpaceNodeId, TPlaceholder>[] = [];

	public constructor(private readonly treeCompressor = new InterningTreeCompressor<TPlaceholder>()) {}

	public compress<TId extends OpSpaceNodeId>(
		node: PlaceholderTree<TPlaceholder>,
		interner: StringInterner,
		idNormalizer: ContextualizedNodeIdNormalizer<TId>
	): CompressedPlaceholderTree<TId, TPlaceholder> {
		this.compressTreeCalls.push(node);
		return this.treeCompressor.compress(node, interner, idNormalizer);
	}

	public decompress<TId extends OpSpaceNodeId>(
		node: CompressedPlaceholderTree<TId, TPlaceholder>,
		interner: StringInterner,
		idNormalizer: ContextualizedNodeIdNormalizer<TId>
	): PlaceholderTree<TPlaceholder> {
		this.decompressTreeCalls.push(node);
		return this.treeCompressor.decompress(node, interner, idNormalizer);
	}
}

describe('ChangeCompression', () => {
	const treeCompressor = new TestTreeCompressor();

	beforeEach(() => {
		treeCompressor.compressTreeCalls.length = 0;
		treeCompressor.decompressTreeCalls.length = 0;
	});

	const compressor = new ChangeCompressor(treeCompressor);

	/**
	 * Verifies an edit can round-trip through compression/decompression. Optionally also asserts the compressed state
	 * matches some expected state.
	 *
	 * The mocked treeCompressor above is used for tree-level compression, so that tests can assert tree compression is invoked
	 * without taking a dependency on its implementation.
	 */
	function testCompression(
		edit: Edit<ChangeInternal>,
		idNormalizer: ContextualizedNodeIdNormalizer<OpSpaceNodeId>,
		compressed?: Edit<TestCompressedChange>
	): void {
		const interner = new MutableStringInterner();
		const compressedEdit = compressEdit(compressor, interner, idNormalizer, edit);
		if (compressed !== undefined) {
			expect(compressedEdit).to.deep.equal(compressed);
		}

		const buildChanges = edit.changes.filter<BuildInternal>(
			(change: ChangeInternal): change is BuildInternal => change.type === ChangeTypeInternal.Build
		);
		let treeIndex = 0;
		for (const buildChange of buildChanges) {
			for (const tree of buildChange.source) {
				const treeParam = treeCompressor.compressTreeCalls[treeIndex];
				expect(treeParam).to.equal(tree);
				treeIndex++;
			}
		}
		expect(treeIndex).to.equal(treeCompressor.compressTreeCalls.length);

		expect(treeCompressor.decompressTreeCalls.length).to.equal(0);

		const internedStrings = interner.getSerializable();
		const newInterner = new MutableStringInterner(internedStrings);
		const decompressedEdit = decompressEdit(compressor, newInterner, idNormalizer, compressedEdit);

		const compressedBuildChanges = compressedEdit.changes.filter<CompressedBuildInternal<OpSpaceNodeId>>(
			(change): change is CompressedBuildInternal<OpSpaceNodeId> =>
				change.type === ChangeTypeInternal.CompressedBuild
		);

		treeIndex = 0;
		for (const buildChange of compressedBuildChanges) {
			for (const tree of buildChange.source) {
				const treeParam = treeCompressor.decompressTreeCalls[treeIndex];
				expect(treeParam).to.equal(tree);
				treeIndex++;
			}
		}
		expect(treeIndex).to.equal(treeCompressor.decompressTreeCalls.length);
		expect(decompressedEdit).to.deep.equal(edit);
	}

	it('Compresses the BuildNodes of an edit with Build Changes', () => {
		const tree = setUpTestTree();
		const edit = newEdit(ChangeInternal.insertTree([tree.toChangeNode()], StablePlace.after(tree.left)));
		const expectedCompressedEdit: Edit<TestCompressedChange> = {
			id: edit.id,
			changes: [
				{
					destination: 0 as DetachedSequenceId,
					source: [
						new InterningTreeCompressor().compress(
							tree,
							new MutableStringInterner(),
							scopeIdNormalizer(tree)
						),
					],
					type: ChangeTypeInternal.CompressedBuild,
				},
				{
					destination: { side: 1, referenceSibling: tree.normalizeToOpSpace(tree.left.identifier) },
					source: 0 as DetachedSequenceId,
					type: ChangeTypeInternal.Insert,
				},
			],
		};
		testCompression(edit, scopeIdNormalizer(tree), expectedCompressedEdit);
	});

	it('compresses id references in Detach changes to op space', () => {
		const tree = setUpTestTree();
		const detach: DetachInternal = {
			destination: 0 as DetachedSequenceId,
			source: StableRange.only(tree),
			type: ChangeTypeInternal.Detach,
		};
		const edit: Edit<ChangeInternal> = {
			id: newEditId(),
			changes: [detach],
		};
		testCompression(edit, scopeIdNormalizer(tree), {
			...edit,
			changes: [{ ...detach, source: convertStableRangeIds(detach.source, (id) => tree.normalizeToOpSpace(id)) }],
		});
	});

	it('compresses id references in SetValue changes to op space', () => {
		const context = makeNodeIdContext();
		const id = context.generateNodeId();
		const setValue: SetValueInternal = {
			nodeToModify: id,
			payload: 5,
			type: ChangeTypeInternal.SetValue,
		};
		const edit: Edit<ChangeInternal> = {
			id: newEditId(),
			changes: [setValue],
		};
		testCompression(edit, scopeIdNormalizer(context, context.localSessionId), {
			...edit,
			changes: [{ ...setValue, nodeToModify: context.normalizeToOpSpace(id) }],
		});
	});

	it('compresses id references in Constraint changes to op space', () => {
		const tree = setUpTestTree();
		const constraint: ConstraintInternal = {
			toConstrain: StableRange.only(tree),
			effect: ConstraintEffect.InvalidAndDiscard,
			type: ChangeTypeInternal.Constraint,
		};
		const edit: Edit<ChangeInternal> = {
			id: newEditId(),
			changes: [constraint],
		};
		testCompression(edit, scopeIdNormalizer(tree), {
			...edit,
			changes: [
				{
					type: constraint.type,
					effect: constraint.effect,
					toConstrain: convertStableRangeIds(constraint.toConstrain, (id) => tree.normalizeToOpSpace(id)),
				},
			],
		});
	});
});

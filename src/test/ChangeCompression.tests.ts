/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { v4 as uuidv4 } from 'uuid';
import { DetachedSequenceId, NodeId } from '../Identifiers';
import { StringInterner } from '../StringInterner';
import type { TreeCompressor } from '../Compression';
import {
	BuildInternal,
	ChangeInternal,
	ChangeTypeInternal,
	CompressedBuildInternal,
	CompressedChangeInternal,
	ConstraintEffect,
	ConstraintInternal,
	DetachInternal,
	Edit,
	InsertInternal,
	PlaceholderTree,
	SetValueInternal,
} from '../persisted-types';
import { compressEdit, decompressEdit, makeChangeCompressor } from '../ChangeCompression';
import { StablePlace, StableRange } from '../ChangeTypes';
import { newEdit, newEditId } from '../EditUtilities';
import { setUpTestTree } from './utilities/TestUtilities';

// CompressedChange type for this test suite. It aligns with CompressedChangeInternal but doesn't actually compress trees.
type TestCompressedChange = CompressedChangeInternal<PlaceholderTree<DetachedSequenceId>>;

describe('ChangeCompression', () => {
	const compressTreeCalls: [PlaceholderTree<DetachedSequenceId>, StringInterner][] = [];
	const decompressTreeCalls: [PlaceholderTree<DetachedSequenceId>, StringInterner][] = [];

	const treeCompressor: TreeCompressor<DetachedSequenceId, PlaceholderTree<DetachedSequenceId>> = {
		compress: (tree, interner) => {
			compressTreeCalls.push([tree, interner]);
			return tree;
		},
		decompress: (tree, interner) => {
			decompressTreeCalls.push([tree, interner]);
			return tree;
		},
	};

	beforeEach(() => {
		compressTreeCalls.length = 0;
		decompressTreeCalls.length = 0;
	});

	const compressor = makeChangeCompressor(treeCompressor);

	/**
	 * Verifies an edit can round-trip through compression/decompression. Optionally also asserts the compressed state
	 * matches some expected state.
	 *
	 * The mocked treeCompressor above is used for tree-level compression, so that tests can assert tree compression is invoked
	 * without taking a dependency on its implementation.
	 */
	function testCompression(edit: Edit<ChangeInternal>, compressed?: Edit<TestCompressedChange>): void {
		const interner = new StringInterner();
		const compressedEdit = compressEdit(compressor, interner, edit);
		if (compressed !== undefined) {
			expect(compressedEdit).to.deep.equal(compressed);
		}

		const buildChanges = edit.changes.filter<BuildInternal>(
			(change: ChangeInternal): change is BuildInternal => change.type === ChangeTypeInternal.Build
		);
		let treeIndex = 0;
		for (const buildChange of buildChanges) {
			for (const tree of buildChange.source) {
				const [treeParam, internerParam] = compressTreeCalls[treeIndex];
				expect(treeParam).to.equal(tree);
				expect(internerParam).to.equal(interner);
				treeIndex++;
			}
		}
		expect(treeIndex).to.equal(compressTreeCalls.length);

		expect(decompressTreeCalls.length).to.equal(0);

		const internedStrings = interner.getSerializable();
		const newInterner = new StringInterner(internedStrings);
		const decompressedEdit = decompressEdit(compressor, newInterner, compressedEdit);

		const compressedBuildChanges = compressedEdit.changes.filter<
			CompressedBuildInternal<PlaceholderTree<DetachedSequenceId>>
		>(
			(change): change is CompressedBuildInternal<PlaceholderTree<DetachedSequenceId>> =>
				change.type === ChangeTypeInternal.CompressedBuild
		);

		treeIndex = 0;
		for (const buildChange of compressedBuildChanges) {
			for (const tree of buildChange.source) {
				const [treeParam, internerParam] = decompressTreeCalls[treeIndex];
				expect(treeParam).to.equal(tree);
				expect(internerParam).to.equal(newInterner);
				treeIndex++;
			}
		}
		expect(treeIndex).to.equal(decompressTreeCalls.length);
		expect(decompressedEdit).to.deep.equal(edit);
	}

	it('Compresses the BuildNodes of an edit with Build Changes', () => {
		const tree = setUpTestTree();
		const edit = newEdit(InsertInternal.create([tree], StablePlace.after(tree.left)));
		const expectedCompressedEdit: Edit<TestCompressedChange> = {
			id: edit.id,
			changes: [
				{
					destination: 0 as DetachedSequenceId,
					source: [tree],
					type: ChangeTypeInternal.CompressedBuild,
				},
				{
					destination: { side: 1, referenceSibling: tree.left.identifier },
					source: 0 as DetachedSequenceId,
					type: ChangeTypeInternal.Insert,
				},
			],
		};
		testCompression(edit, expectedCompressedEdit);
	});

	it('does not compress Detach Changes', () => {
		const tree = setUpTestTree();
		const detach: DetachInternal = {
			destination: 0 as DetachedSequenceId,
			source: StableRange.only(tree),
			type: ChangeTypeInternal.Detach,
		};
		const edit: Edit<ChangeInternal> & Edit<TestCompressedChange> = {
			id: newEditId(),
			changes: [detach],
		};
		testCompression(edit, edit);
	});

	it('does not compress SetValue changes', () => {
		const id = uuidv4() as NodeId;
		const setValue: SetValueInternal = {
			nodeToModify: id,
			payload: 5,
			type: ChangeTypeInternal.SetValue,
		};
		const edit: Edit<ChangeInternal> & Edit<TestCompressedChange> = {
			id: newEditId(),
			changes: [setValue],
		};
		testCompression(edit, edit);
	});

	it('does not compress Constraint changes', () => {
		const tree = setUpTestTree();
		const constraint: ConstraintInternal = {
			toConstrain: StableRange.only(tree),
			effect: ConstraintEffect.InvalidAndDiscard,
			type: ChangeTypeInternal.Constraint,
		};
		const edit: Edit<ChangeInternal> & Edit<TestCompressedChange> = {
			id: newEditId(),
			changes: [constraint],
		};
		testCompression(edit, edit);
	});
});

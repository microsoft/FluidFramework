/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { Definition, TraitLabel } from '../Identifiers';
import { RevisionView } from '../RevisionView';
import { ChangeNode } from '../persisted-types';
import { refreshTestTree } from './utilities/TestUtilities';
import { TestNode } from './utilities/TestNode';
import { expectDefined } from './utilities/TestCommon';

describe('TreeView', () => {
	const testTree = refreshTestTree();

	describe('can compute deltas', () => {
		it('that are the same object', () => {
			const view = testTree.view;
			expect(view.delta(view)).deep.equals({
				changed: [],
				added: [],
				removed: [],
			});
		});

		it('that have the same tree', () => {
			const viewA = RevisionView.fromTree<TestNode>(testTree);
			const viewB = RevisionView.fromTree<TestNode>(testTree);
			expect(viewA.delta(viewB)).deep.equals({
				changed: [],
				added: [],
				removed: [],
			});
		});

		it('with different root ids', () => {
			const viewA = RevisionView.fromTree(testTree.buildLeaf(testTree.generateNodeId()));
			const viewB = RevisionView.fromTree(testTree.buildLeaf(testTree.generateNodeId()));
			expect(() => viewA.delta(viewB)).to.throw('Delta can only be calculated between views that share a root');
		});

		it('with different subtrees', () => {
			const rootId = testTree.generateNodeId();

			const leafA = testTree.buildLeaf(testTree.generateNodeId());
			const leafB = testTree.buildLeaf(testTree.generateNodeId());

			const subtreeA = {
				identifier: testTree.generateNodeId(),
				definition: 'node' as Definition,
				traits: { children: [leafA] },
			};
			const subtreeB = {
				identifier: testTree.generateNodeId(),
				definition: 'node' as Definition,
				traits: { children: [leafB] },
			};

			const rootA: ChangeNode = {
				identifier: rootId,
				definition: 'node' as Definition,
				traits: {
					children: [subtreeA],
				},
			};
			const rootB: ChangeNode = {
				identifier: rootId,
				definition: 'node' as Definition,
				traits: {
					children: [subtreeB],
				},
			};

			const viewA = RevisionView.fromTree(rootA);
			const viewB = RevisionView.fromTree(rootB);
			const delta = viewA.delta(viewB);
			expect(delta.changed).deep.equals([rootId]);
			expect(delta.removed.length).equals(2);
			expect(delta.added.length).equals(2);
			expect(delta.removed).contains(subtreeA.identifier);
			expect(delta.removed).contains(leafA.identifier);
			expect(delta.added).contains(subtreeB.identifier);
			expect(delta.added).contains(leafB.identifier);
		});

		it('with different payloads', () => {
			const rootId = testTree.generateNodeId();
			const nodeA: ChangeNode = {
				identifier: rootId,
				definition: 'node' as Definition,
				payload: 'test1',
				traits: {},
			};
			const nodeB: ChangeNode = {
				identifier: rootId,
				definition: 'node' as Definition,
				payload: 'test2',
				traits: {},
			};

			const viewA = RevisionView.fromTree(nodeA);
			const viewB = RevisionView.fromTree(nodeB);
			const delta = viewA.delta(viewB);
			expect(delta.changed).deep.equals([rootId]);
			expect(delta.removed).deep.equals([]);
			expect(delta.added).deep.equals([]);
		});

		it('after an insert', () => {
			const viewA = testTree.view;
			const insertedNode = testTree.buildLeaf(testTree.generateNodeId());
			const treeB: ChangeNode = {
				identifier: testTree.identifier,
				definition: testTree.definition,
				traits: { ...testTree.traits, left: [insertedNode, testTree.left] },
			};
			const viewB = RevisionView.fromTree(treeB);
			const delta = viewA.delta(viewB);
			expect(delta.changed).deep.equals([testTree.identifier]);
			expect(delta.removed).deep.equals([]);
			expect(delta.added).deep.equals([insertedNode.identifier]);
		});

		it('after a delete', () => {
			const viewA = testTree.view;
			const treeB: ChangeNode = {
				identifier: testTree.identifier,
				definition: testTree.definition,
				traits: { ...testTree.traits, left: [] },
			};
			const viewB = RevisionView.fromTree(treeB);
			const delta = viewA.delta(viewB);
			expect(delta.changed).deep.equals([testTree.identifier]);
			expect(delta.removed).deep.equals([testTree.left.identifier]);
			expect(delta.added).deep.equals([]);
		});

		it('after a move', () => {
			const viewA = testTree.view;
			const treeB: ChangeNode = {
				identifier: testTree.identifier,
				definition: testTree.definition,
				traits: { ...testTree.traits, left: [], right: [testTree.right, testTree.left] },
			};
			const viewB = RevisionView.fromTree(treeB);
			const delta = viewA.delta(viewB);
			expect(delta.changed).deep.equals([testTree.identifier]);
			expect(delta.removed).deep.equals([]);
			expect(delta.added).deep.equals([]);
		});
	});

	it('correctly returns node parentage', () => {
		const view = testTree.view;
		for (const node of view) {
			const parentNode = view.tryGetParentViewNode(node.identifier);
			if (parentNode !== undefined) {
				const parentage = expectDefined(node.parentage);
				expect(parentage.label).to.equal(view.getTraitLabel(node.identifier));
				expect(parentage.parent).to.equal(parentNode.identifier);
			}
		}
	});

	// Regression test for the issue fixed in #9824
	it('can be iterated in a consistent order', () => {
		const [id1, id2, id3] = Array.from({ length: 3 }).map(() => testTree.generateNodeId());
		const label1 = 'traitLabelA' as TraitLabel;
		const label2 = 'traitLabelB' as TraitLabel;
		const { definition } = testTree;
		const tree1: ChangeNode = {
			identifier: id1,
			definition,
			traits: {
				[label1]: [{ identifier: id2, definition, traits: {} }],
				[label2]: [{ identifier: id3, definition, traits: {} }],
			},
		};
		// Like tree1, but defined with the labels in the opposite order and with different node ids under each trait.
		const tree2: ChangeNode = {
			identifier: id1,
			definition,
			traits: {
				[label2]: [{ identifier: id2, definition, traits: {} }],
				[label1]: [{ identifier: id3, definition, traits: {} }],
			},
		};
		const view1 = RevisionView.fromTree(tree1);
		const view2 = RevisionView.fromTree(tree2);
		expect(Array.from(view1).map((node) => node.identifier)).to.deep.equal([id1, id2, id3]);
		// Child iteration should be sorted on trait labels.
		expect(Array.from(view2).map((node) => node.identifier)).to.deep.equal([id1, id3, id2]);
	});
});

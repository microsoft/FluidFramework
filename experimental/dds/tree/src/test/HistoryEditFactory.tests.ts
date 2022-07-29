/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { revert } from '../HistoryEditFactory';
import { DetachedSequenceId, TraitLabel } from '../Identifiers';
import { ChangeInternal, DetachInternal, Side, StablePlaceInternal, StableRangeInternal } from '../persisted-types';
import { expectDefined } from './utilities/TestCommon';
import { refreshTestTree } from './utilities/TestUtilities';

describe('revert', () => {
	const testTree = refreshTestTree();

	it('can revert a single detached node', () => {
		const firstDetachedId = 0 as DetachedSequenceId;
		const node = testTree.buildLeafInternal();
		const firstBuild = ChangeInternal.build([node], firstDetachedId);
		const insertedNodeId = 1 as DetachedSequenceId;
		const insertedBuild = ChangeInternal.build([firstDetachedId], insertedNodeId);
		const insertChange = ChangeInternal.insert(
			insertedNodeId,
			StablePlaceInternal.atStartOf(testTree.left.traitLocation)
		);
		const result = expectDefined(revert([firstBuild, insertedBuild, insertChange], testTree.view));
		expect(result.length).to.equal(1);
		const revertedChange = result[0] as DetachInternal;
		expect(revertedChange.source.start.referenceSibling).to.deep.equal(node.identifier);
		expect(revertedChange.source.end.referenceSibling).to.deep.equal(node.identifier);
	});

	it('can revert multiple detached nodes', () => {
		const firstDetachedId = 0 as DetachedSequenceId;
		const firstNode = testTree.buildLeafInternal();
		const firstBuild = ChangeInternal.build([firstNode], firstDetachedId);
		const secondDetachedId = 1 as DetachedSequenceId;
		const secondNode = testTree.buildLeafInternal();
		const secondBuild = ChangeInternal.build([secondNode], secondDetachedId);
		const insertedNodeId = 2 as DetachedSequenceId;
		const insertedBuild = ChangeInternal.build([firstDetachedId, secondDetachedId], insertedNodeId);
		const insertChange = ChangeInternal.insert(
			insertedNodeId,
			StablePlaceInternal.atStartOf(testTree.left.traitLocation)
		);
		const result = expectDefined(revert([firstBuild, secondBuild, insertedBuild, insertChange], testTree.view));
		expect(result.length).to.equal(1);
		const revertedChange = result[0] as DetachInternal;
		expect(revertedChange.source.start.referenceSibling).to.deep.equal(firstNode.identifier);
		expect(revertedChange.source.end.referenceSibling).to.deep.equal(secondNode.identifier);
	});

	it('handles reverting the insert of empty nodes, with subsequent non-empty nodes', () => {
		// build and insert of empty traits
		const emptyTraitNodeId = 0 as DetachedSequenceId;
		const emptyTraitBuild = ChangeInternal.build([], emptyTraitNodeId);
		const emptyTraitInsert = ChangeInternal.insert(
			emptyTraitNodeId,
			StablePlaceInternal.atStartOf(testTree.left.traitLocation)
		);

		// build and insert of non-empty traits
		const firstDetachedId = 1 as DetachedSequenceId;
		const firstNode = testTree.buildLeafInternal();
		const firstBuild = ChangeInternal.build([firstNode], firstDetachedId);
		const insertedNodeId = 3 as DetachedSequenceId;
		const insertedBuild = ChangeInternal.build([firstDetachedId], insertedNodeId);
		const insertChange = ChangeInternal.insert(
			insertedNodeId,
			StablePlaceInternal.atStartOf(testTree.left.traitLocation)
		);
		const result = expectDefined(
			revert([emptyTraitBuild, emptyTraitInsert, firstBuild, insertedBuild, insertChange], testTree.view)
		);
		expect(result.length).to.equal(1);
		const revertedChange = result[0] as DetachInternal;
		expect(revertedChange.source.start.referenceSibling).to.deep.equal(firstNode.identifier);
	});

	/** This is a regression test for a bug where we make sure that any built/detached nodes are cleared when any
	 *  empty insert/detach change is skipped once encountered. The expected outcome is undefined, as during the second
	 *  empty insert (with the same DetachSequenceId), there should be no such node in the builtNodes.
	 */
	it('handles reverting the insert of empty nodes, with subsequent empty nodes of same DetachedSequenceId', () => {
		const emptyTraitNodeId = 0 as DetachedSequenceId;
		const emptyTraitBuild = ChangeInternal.build([], emptyTraitNodeId);
		const emptyTraitInsert = ChangeInternal.insert(
			emptyTraitNodeId,
			StablePlaceInternal.atStartOf(testTree.left.traitLocation)
		);
		const result = revert([emptyTraitBuild, emptyTraitInsert, emptyTraitInsert], testTree.view);
		expect(result).to.be.undefined;
	});

	it('handles reverting the detach of an empty trait', () => {
		const insertedNodeId = 0 as DetachedSequenceId;
		const result = expectDefined(
			revert(
				[
					ChangeInternal.detach(
						StableRangeInternal.all({
							label: 'someNonExistentTraitLabel' as TraitLabel,
							parent: testTree.identifier,
						}),
						insertedNodeId
					),
				],
				testTree.view
			)
		);
		expect(result).to.have.lengthOf(0);
	});

	it('handles reverting the insert of an empty trait', () => {
		const emptyTraitNodeId = 0 as DetachedSequenceId;
		const emptyTraitBuild = ChangeInternal.build([], emptyTraitNodeId);
		const emptyTraitInsert = ChangeInternal.insert(
			emptyTraitNodeId,
			StablePlaceInternal.atStartOf(testTree.left.traitLocation)
		);
		const result = expectDefined(revert([emptyTraitBuild, emptyTraitInsert], testTree.view));
		expect(result).to.have.lengthOf(0);
	});

	describe('returns undefined for reverts that require more context than the view directly before the edit', () => {
		describe('because the edit conflicted', () => {
			it('when reverting a detach of a node that is not in the tree', () => {
				const nodeNotInTree = testTree.buildLeafInternal();
				const change = ChangeInternal.detach(StableRangeInternal.only(nodeNotInTree));
				const result = revert([change], testTree.view);
				expect(result).to.be.undefined;
			});

			it('when reverting a set value of a node that is not in the tree', () => {
				const nodeNotInTree = testTree.buildLeafInternal();
				const change = ChangeInternal.setPayload(nodeNotInTree, '42');
				const result = revert([change], testTree.view);
				expect(result).to.be.undefined;
			});
		});

		describe('because the edit was malformed', () => {
			it('when reverting an insert whose source is not insertable', () => {
				const detachedId = 0 as DetachedSequenceId;
				// Revert an insert where the source is not a valid detached sequence ID (nothing has been built/detached with that ID)
				expect(
					revert(
						[ChangeInternal.insert(detachedId, StablePlaceInternal.atStartOf(testTree.left.traitLocation))],
						testTree.view
					)
				).to.be.undefined;
				// Revert a duplicate insert (the source has already been inserted by a previous insert in the same edit)
				expect(
					revert(
						[
							ChangeInternal.build([testTree.buildLeafInternal()], detachedId),
							ChangeInternal.insert(
								detachedId,
								StablePlaceInternal.atStartOf(testTree.left.traitLocation)
							),
							ChangeInternal.insert(
								detachedId,
								StablePlaceInternal.atStartOf(testTree.left.traitLocation)
							),
						],
						testTree.view
					)
				).to.be.undefined;
			});

			it('when reverting a detach whose destination is already occupied', () => {
				const detachedId = 0 as DetachedSequenceId;
				// Revert a detach where the destination is already occupied due to a prior detach
				expect(
					revert(
						[
							ChangeInternal.detach(StableRangeInternal.only(testTree.left), detachedId),
							ChangeInternal.detach(StableRangeInternal.only(testTree.left), detachedId),
						],
						testTree.view
					)
				).to.be.undefined;
				// Revert a detach where the destination is already occupied due to a prior build
				expect(
					revert(
						[
							ChangeInternal.build([testTree.buildLeafInternal()], detachedId),
							ChangeInternal.detach(StableRangeInternal.only(testTree.left), detachedId),
						],
						testTree.view
					)
				).to.be.undefined;
			});
		});
	});
});

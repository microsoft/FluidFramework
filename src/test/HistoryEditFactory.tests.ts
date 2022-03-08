import { expect } from 'chai';
import {
	ChangeInternal,
	DetachInternal,
	revert,
	StablePlaceInternal_0_0_2,
	StableRangeInternal_0_0_2,
} from '../default-edits';
import { Side } from '../generic';
import { DetachedSequenceId } from '../Identifiers';
import { expectDefined } from './utilities/TestCommon';
import { refreshTestTree } from './utilities/TestUtilities';

describe('revert', () => {
	const testTree = refreshTestTree();

	it('can revert a single detached node', () => {
		const firstDetachedId = 0 as DetachedSequenceId;
		const node = testTree.buildStableLeaf();
		const firstBuild = ChangeInternal.build([node], firstDetachedId);
		const insertedNodeId = 1 as DetachedSequenceId;
		const insertedBuild = ChangeInternal.build([firstDetachedId], insertedNodeId);
		const insertChange = ChangeInternal.insert(insertedNodeId, {
			referenceTrait: testTree.left.traitLocation.stable,
			side: Side.After,
		});
		const result = expectDefined(revert([firstBuild, insertedBuild, insertChange], testTree.view, testTree));
		expect(result.length).to.equal(1);
		const revertedChange = result[0] as DetachInternal;
		expect(revertedChange.source.start.referenceSibling).to.deep.equal(node.identifier);
		expect(revertedChange.source.end.referenceSibling).to.deep.equal(node.identifier);
	});

	it('can revert multiple detached nodes', () => {
		const firstDetachedId = 0 as DetachedSequenceId;
		const firstNode = testTree.buildStableLeaf();
		const firstBuild = ChangeInternal.build([firstNode], firstDetachedId);
		const secondDetachedId = 1 as DetachedSequenceId;
		const secondNode = testTree.buildStableLeaf();
		const secondBuild = ChangeInternal.build([secondNode], secondDetachedId);
		const insertedNodeId = 2 as DetachedSequenceId;
		const insertedBuild = ChangeInternal.build([firstDetachedId, secondDetachedId], insertedNodeId);
		const insertChange = ChangeInternal.insert(insertedNodeId, {
			referenceTrait: testTree.left.traitLocation.stable,
			side: Side.After,
		});
		const result = expectDefined(
			revert([firstBuild, secondBuild, insertedBuild, insertChange], testTree.view, testTree)
		);
		expect(result.length).to.equal(1);
		const revertedChange = result[0] as DetachInternal;
		expect(revertedChange.source.start.referenceSibling).to.deep.equal(firstNode.identifier);
		expect(revertedChange.source.end.referenceSibling).to.deep.equal(secondNode.identifier);
	});

	describe('returns undefined for reverts that require more context than the view directly before the edit', () => {
		describe('because the edit conflicted', () => {
			it('when reverting a detach of a node that is not in the tree', () => {
				const nodeNotInTree = testTree.buildStableLeaf();
				const change = ChangeInternal.detach(StableRangeInternal_0_0_2.only(nodeNotInTree));
				const result = revert([change], testTree.view, testTree);
				expect(result).to.be.undefined;
			});

			it('when reverting a set value of a node that is not in the tree', () => {
				const nodeNotInTree = testTree.buildStableLeaf();
				const change = ChangeInternal.setPayload(nodeNotInTree, '42');
				const result = revert([change], testTree.view, testTree);
				expect(result).to.be.undefined;
			});
		});

		describe('because the edit was malformed', () => {
			it('when reverting an insert whose source is not insertable', () => {
				const detachedId = 0 as DetachedSequenceId;
				// Revert an insert where the source is not a valid detached sequence ID (nothing has been built/detached with that ID)
				expect(
					revert(
						[
							ChangeInternal.insert(
								detachedId,
								StablePlaceInternal_0_0_2.atStartOf(testTree.left.traitLocation.stable)
							),
						],
						testTree.view,
						testTree
					)
				).to.be.undefined;
				// Revert a duplicate insert (the source has already been inserted by a previous insert in the same edit)
				expect(
					revert(
						[
							ChangeInternal.build([testTree.buildStableLeaf()], detachedId),
							ChangeInternal.insert(
								detachedId,
								StablePlaceInternal_0_0_2.atStartOf(testTree.left.traitLocation.stable)
							),
							ChangeInternal.insert(
								detachedId,
								StablePlaceInternal_0_0_2.atStartOf(testTree.left.traitLocation.stable)
							),
						],
						testTree.view,
						testTree
					)
				).to.be.undefined;
			});

			it('when reverting a detach whose destination is already occupied', () => {
				const detachedId = 0 as DetachedSequenceId;
				// Revert a detach where the destination is already occupied due to a prior detach
				expect(
					revert(
						[
							ChangeInternal.detach(StableRangeInternal_0_0_2.only(testTree.left.stable), detachedId),
							ChangeInternal.detach(StableRangeInternal_0_0_2.only(testTree.left.stable), detachedId),
						],
						testTree.view,
						testTree
					)
				).to.be.undefined;
				// Revert a detach where the destination is already occupied due to a prior build
				expect(
					revert(
						[
							ChangeInternal.build([testTree.buildStableLeaf()], detachedId),
							ChangeInternal.detach(StableRangeInternal_0_0_2.only(testTree.left.stable), detachedId),
						],
						testTree.view,
						testTree
					)
				).to.be.undefined;
			});
		});
	});
});

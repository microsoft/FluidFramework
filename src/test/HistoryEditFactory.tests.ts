import { expect } from 'chai';
import { ChangeInternal, DetachInternal, revert, StablePlace, StableRange } from '../default-edits';
import { Side } from '../TreeView';
import { DetachedSequenceId } from '../Identifiers';
import { expectDefined, refreshTestTree } from './utilities/TestUtilities';

describe('revert', () => {
	const simpleTestTree = refreshTestTree();

	it('can revert a single detached node', () => {
		const firstDetachedId = 0 as DetachedSequenceId;
		const node = simpleTestTree.buildLeaf();
		const firstBuild = ChangeInternal.build([node], firstDetachedId);
		const insertedNodeId = 1 as DetachedSequenceId;
		const insertedBuild = ChangeInternal.build([firstDetachedId], insertedNodeId);
		const insertChange = ChangeInternal.insert(insertedNodeId, {
			referenceTrait: simpleTestTree.left.traitLocation,
			side: Side.After,
		});
		const result = expectDefined(revert([firstBuild, insertedBuild, insertChange], simpleTestTree.view));
		expect(result.length).to.equal(1);
		const revertedChange = result[0] as DetachInternal;
		expect(revertedChange.source.start.referenceSibling).to.deep.equal(node.identifier);
		expect(revertedChange.source.end.referenceSibling).to.deep.equal(node.identifier);
	});

	it('can revert multiple detached nodes', () => {
		const firstDetachedId = 0 as DetachedSequenceId;
		const firstNode = simpleTestTree.buildLeaf();
		const firstBuild = ChangeInternal.build([firstNode], firstDetachedId);
		const secondDetachedId = 1 as DetachedSequenceId;
		const secondNode = simpleTestTree.buildLeaf();
		const secondBuild = ChangeInternal.build([secondNode], secondDetachedId);
		const insertedNodeId = 2 as DetachedSequenceId;
		const insertedBuild = ChangeInternal.build([firstDetachedId, secondDetachedId], insertedNodeId);
		const insertChange = ChangeInternal.insert(insertedNodeId, {
			referenceTrait: simpleTestTree.left.traitLocation,
			side: Side.After,
		});
		const result = expectDefined(
			revert([firstBuild, secondBuild, insertedBuild, insertChange], simpleTestTree.view)
		);
		expect(result.length).to.equal(1);
		const revertedChange = result[0] as DetachInternal;
		expect(revertedChange.source.start.referenceSibling).to.deep.equal(firstNode.identifier);
		expect(revertedChange.source.end.referenceSibling).to.deep.equal(secondNode.identifier);
	});

	describe('returns undefined for reverts that require more context than the view directly before the edit', () => {
		describe('because the edit conflicted', () => {
			it('when reverting a detach of a node that is not in the tree', () => {
				const nodeNotInTree = simpleTestTree.buildLeaf();
				const change = ChangeInternal.detach(StableRange.only(nodeNotInTree));
				const result = revert([change], simpleTestTree.view);
				expect(result).to.be.undefined;
			});

			it('when reverting a set value of a node that is not in the tree', () => {
				const nodeNotInTree = simpleTestTree.buildLeaf();
				const change = ChangeInternal.setPayload(nodeNotInTree, '42');
				const result = revert([change], simpleTestTree.view);
				expect(result).to.be.undefined;
			});
		});

		describe('because the edit was malformed', () => {
			it('when reverting an insert whose source is not insertable', () => {
				const detachedId = 0 as DetachedSequenceId;
				// Revert an insert where the source is not a valid detached sequence ID (nothing has been built/detached with that ID)
				expect(
					revert(
						[ChangeInternal.insert(detachedId, StablePlace.atStartOf(simpleTestTree.left.traitLocation))],
						simpleTestTree.view
					)
				).to.be.undefined;
				// Revert a duplicate insert (the source has already been inserted by a previous insert in the same edit)
				expect(
					revert(
						[
							ChangeInternal.build([simpleTestTree.buildLeaf()], detachedId),
							ChangeInternal.insert(detachedId, StablePlace.atStartOf(simpleTestTree.left.traitLocation)),
							ChangeInternal.insert(detachedId, StablePlace.atStartOf(simpleTestTree.left.traitLocation)),
						],
						simpleTestTree.view
					)
				).to.be.undefined;
			});

			it('when reverting a detach whose destination is already occupied', () => {
				const detachedId = 0 as DetachedSequenceId;
				// Revert a detach where the destination is already occupied due to a prior detach
				expect(
					revert(
						[
							ChangeInternal.detach(StableRange.only(simpleTestTree.left), detachedId),
							ChangeInternal.detach(StableRange.only(simpleTestTree.left), detachedId),
						],
						simpleTestTree.view
					)
				).to.be.undefined;
				// Revert a detach where the destination is already occupied due to a prior build
				expect(
					revert(
						[
							ChangeInternal.build([simpleTestTree.buildLeaf()], detachedId),
							ChangeInternal.detach(StableRange.only(simpleTestTree.left), detachedId),
						],
						simpleTestTree.view
					)
				).to.be.undefined;
			});
		});
	});
});

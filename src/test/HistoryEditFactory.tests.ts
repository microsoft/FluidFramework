import { v4 as uuidv4 } from 'uuid';
import { expect } from 'chai';
import { ChangeInternal, DetachInternal, revert } from '../default-edits';
import { RevisionView, Side } from '../TreeView';
import { DetachedSequenceId, NodeId } from '../Identifiers';
import { makeEmptyNode, simpleTestTree, leftTraitLocation } from './utilities/TestUtilities';

describe('HistoryEditFactory tests', () => {
	const startingView = RevisionView.fromTree(simpleTestTree, true);
	it('can revert a single detached node', () => {
		const firstDetachedId = 0 as DetachedSequenceId;
		const nodeId = uuidv4() as NodeId;
		const firstBuild = ChangeInternal.build([makeEmptyNode(nodeId)], firstDetachedId);
		const insertedNodeId = 1 as DetachedSequenceId;
		const insertedBuild = ChangeInternal.build([firstDetachedId], insertedNodeId);
		const insertChange = ChangeInternal.insert(insertedNodeId, {
			referenceTrait: leftTraitLocation,
			side: Side.After,
		});
		const result = revert([firstBuild, insertedBuild, insertChange], startingView);
		expect(result.length).to.equal(1);
		const revertedChange = result[0] as DetachInternal;
		expect(revertedChange.source.start.referenceSibling).to.deep.equal(nodeId);
		expect(revertedChange.source.end.referenceSibling).to.deep.equal(nodeId);
	});

	it('can revert multiple detached nodes', () => {
		const firstDetachedId = 0 as DetachedSequenceId;
		const firstNodeId = uuidv4() as NodeId;
		const firstBuild = ChangeInternal.build([makeEmptyNode(firstNodeId)], firstDetachedId);
		const secondDetachedId = 1 as DetachedSequenceId;
		const secondNodeId = uuidv4() as NodeId;
		const secondBuild = ChangeInternal.build([makeEmptyNode(secondNodeId)], secondDetachedId);
		const insertedNodeId = 2 as DetachedSequenceId;
		const insertedBuild = ChangeInternal.build([firstDetachedId, secondDetachedId], insertedNodeId);
		const insertChange = ChangeInternal.insert(insertedNodeId, {
			referenceTrait: leftTraitLocation,
			side: Side.After,
		});
		const result = revert([firstBuild, secondBuild, insertedBuild, insertChange], startingView);
		expect(result.length).to.equal(1);
		const revertedChange = result[0] as DetachInternal;
		expect(revertedChange.source.start.referenceSibling).to.deep.equal(firstNodeId);
		expect(revertedChange.source.end.referenceSibling).to.deep.equal(secondNodeId);
	});
});

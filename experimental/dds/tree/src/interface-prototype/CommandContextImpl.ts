import { Change, ConstraintEffect } from '../default-edits';
import { OrderedEditSet } from '../EditLog';
import { Definition, NodeId, TraitLabel, EditId } from '../Identifiers';
import { Snapshot } from '../Snapshot';
import { RangeData, StableId, TreeNodeData } from './Anchors';
import { DetachedRange, Place, Range, TreeNode } from './TreeAnchors';
import { CommandContext, AnchorSet, Command, DecontextualizedAnchorSet } from './Checkout';
import { TreeDescriptor } from './TreeNodeDescriptor';

abstract class CommandContextImpl implements CommandContext {
	constructor(readonly history: OrderedEditSet<Change>) {}

	move(destination: Place, ...nodes: (TreeNode | Range)[]): Range {
		const range = this.detach(...nodes);
		return this.attach(range);
	}

	abstract attach(range: DetachedRange): Range;

	runCommand<TOptions extends unknown, TAnchorSet extends AnchorSet, TResult>(
		command: Command<TOptions, TAnchorSet, TResult>,
		parameters: TOptions,
		anchors: DecontextualizedAnchorSet<TAnchorSet>
	): TResult {
		throw new Error('Method not implemented.');
	}

	create(...descriptors: TreeDescriptor[]): DetachedRange {
		throw new Error('Method not implemented.');
	}

	detach(...nodes: (RangeData | TreeNodeData)[]): DetachedRange {
		throw new Error('Method not implemented.');
	}

	delete(...nodes: (RangeData | TreeNodeData)[]) {
		const range = this.detach(...nodes);
		throw new Error('Method not implemented.');
	}

	useAsConstraint(range: RangeData, effect: ConstraintEffect): void {
		throw new Error('Method not implemented.');
	}
	setValue(newValue: any): void {
		throw new Error('Method not implemented.');
	}
	stabilize(id: Definition | TraitLabel | NodeId | EditId): StableId {
		throw new Error('Method not implemented.');
	}
	loadDefinition(id: StableId): Definition {
		throw new Error('Method not implemented.');
	}
	loadTraitLabel(id: StableId): TraitLabel {
		throw new Error('Method not implemented.');
	}
	loadNodeId(id: StableId): NodeId {
		throw new Error('Method not implemented.');
	}
	loadEditId(id: StableId): EditId {
		throw new Error('Method not implemented.');
	}
	async getSnapshot(revision: number): Promise<Snapshot> {
		throw new Error('Method not implemented.');
	}
	getSnapshotInSession(revision: number): Snapshot {
		throw new Error('Method not implemented.');
	}
}

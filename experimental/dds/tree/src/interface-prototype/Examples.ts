import { v4 } from 'uuid';
// This file uses these as opaque id types:
// the user of these APIs should not know or care if they are short IDs or not, other than that they must be converted to StableId if stored for use outside of the shared tree it was acquired from.
// In practice, these would most likely be implemented as ShortId numbers.
import { Definition, TraitLabel } from '../Identifiers';
import { Side } from '../Snapshot';
import { StableId, TreeNodeData } from './Anchors';
import {
	anchorDataFromNodeId,
	Command,
	CommandContext,
	CommandId,
	CommandRegistry,
	PrefetchFilter,
	root,
	SharedTree,
	TreeNodeViewReadonly,
} from './Checkout';
import { Place, TreeNode } from './MutableAnchors';

//////////////// Command examples //////////////

// Inserts a node with the specified Definition and identifier at the specified Place, and return it.
export const insertExample = {
	id: 'f73f004c-3b3e-42fe-b7c9-2e5e8793ca45' as CommandId,
	run: (
		context: CommandContext,
		{ definition: def, identifier: id }: { definition: StableId; identifier: StableId },
		{ place }: { place: Place }
	): TreeNode => {
		const definition = context.loadDefinition(def);
		const identifier = context.loadNodeId(id);
		const range = place.insert({ definition, identifier, traits: {} });
		return range.start.adjacentNode(Side.After);
	},
};

function newNodeId(): StableId {
	return v4() as StableId;
}

export const doubleInsertExample = {
	id: '08bac27d-632f-48bb-834a-90af8d67ca60' as CommandId,
	run: (context: CommandContext, _: {}, { parent }: { parent: TreeNode }): TreeNode => {
		const a = context.runCommand(
			insertExample,
			{ definition: context.stabilize(bar), identifier: newNodeId() },
			{ place: parent.childrenFromTrait(testTrait).start }
		);

		return context.runCommand(
			insertExample,
			{ definition: context.stabilize(baz), identifier: newNodeId() },
			{ place: a.childrenFromTrait(testTrait).start }
		);
	},
};

const filterAll = () => true;

const fetchAll: PrefetchFilter = {
	value: filterAll,
	children: filterAll,
	traitChunks: filterAll,
};

const commands: CommandRegistry = [insertExample, doubleInsertExample];

// Some dummy schema related data.
const foo: Definition = 'Foo' as Definition;
const bar: Definition = 'Bar' as Definition;
const baz: Definition = 'Bar' as Definition;

const testTrait: TraitLabel = 'testTrait' as TraitLabel;

export async function exampleApp(tree: SharedTree): Promise<void> {
	// Perform a full checkout of all data.
	const checkout = await tree.checkout(commands, fetchAll);

	// Example app policy: this app just watches the tree, and adds bar(baz) subtree under any new `foo` node.
	checkout.on('viewChange', (before, after) => {
		const delta = before.delta(after);
		for (const added of delta.added) {
			const n: TreeNodeViewReadonly = checkout.contextualizeAnchor(anchorDataFromNodeId(added));
			if (n.definition === foo) {
				checkout.runCommand(doubleInsertExample, {}, { parent: n as TreeNodeData });
			}
		}
	});

	const treeRoot: TreeNodeViewReadonly = checkout.contextualizeAnchor(root);
	console.log(treeRoot.queryJsonSnapshot.subtree);
	await wait(10000);
	console.log(treeRoot.queryJsonSnapshot.subtree);
}

function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Note: Redo is the same as undoing an undo (at this level).
export const undo: Command<{ editId: StableId }, {}, void> = {
	id: '083ed8c8-9ee3-435f-b949-190a8eb9915c' as CommandId,
	run: (context: CommandContext, { editId }: { editId: StableId }, anchors: {}): void => {
		// TODO: need way to deal with history access being async sometimes, but sometimes require command to be synchronous.
		// For now just using "in session" methods which are synchronous. (TODO: proper errors when not in session, or support it)
		// TODO: need way to report failure (including localized strings).
		// TODO: actually implement.

		// This is what it looks like using the snapshot level API.
		const id = context.loadEditId(editId);
		const editIndex = context.getIndexOfId(id);
		const edit = context.getEditInSessionAtIndex(editIndex);
		const snapshotBefore = context.getSnapshotInSession(editIndex);

		// Apply the revert edit and set it as the new revertible edit.
		// TODO: actually implement this in a way a command can use.
		// return tree.editor.revert(edit, snapshotBefore);
	},
};

/*
sharedTree.submitChange(foo, fooId, { fooness: 42 }, { thePlace: place1 });
 */

// function foo(context: CommandContext, { fooness }: { fooness: number }, { thePlace }: { thePlace: Place }): void {
// 	// TODO: context.call returns void: what is this doing?
// 	// const sequence = context.call(bar, barId, { barness: fooness * 2 }, { theNode: node1, theRange: range1 });
// 	// context.insert(sequence, thePlace);
// 	// context.insert(context.create(SomeNodeBuilder(), thePlace);
// }

// function bar(
// 	context: CommandContext,
// 	{ barness }: { barness: number },
// 	{ theNode, theRange }: { theNode: TreeNode; theRange: Range }
// ): TreeNode | NodeSequence | undefined {
// 	// if (Splat.isInstance(theNode) && barness % 3) {
// 	// 	return context.remove(theRange);
// 	// }
// }

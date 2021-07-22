import { Serializable } from '@fluidframework/datastore-definitions';
import { v4 } from 'uuid';
import { CheckoutEvent } from '../Checkout';
import { fail } from '../Common';
import { ConstraintEffect } from '../default-edits';
// This file uses these as opaque id types:
// the user of these APIs should not know or care if they are short IDs or not, other than that they must be converted to StableId if stored for use outside of the shared tree it was acquired from.
// In practice, these would most likely be implemented as ShortId numbers.
import { Definition, TraitLabel } from '../Identifiers';
import { Side, Snapshot } from '../Snapshot';
import { StableId } from './Anchors';
import {
	anchorDataFromNodeId,
	Command,
	CommandContext,
	CommandId,
	commandInvalid,
	CommandRegistry,
	PrefetchFilter,
	root,
	SharedTree,
} from './Checkout';
import { ContentsConstraint, Place, Trait, Range, TreeNode } from './TreeAnchors';

// ////////////// Command examples //////////////

// Notes:
// A couple of these examples pass definitions and traitLabels into commands via the `options`.
// This is expected to be relatively rare when working with more realistic and/or strongly typed examples,
// however its worth showing as it demonstrates the how to use StableId in such cases to make sure that
// options does not contain data which will not work if deserialized on another client.
// Theoretically Serializable should be made to not admit the various ShortId types, so getting this wrong would be a type error,
// But this has not been done in this prototype.

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
		const range = context.move(place, context.create({ definition, identifier }));
		return range.start.adjacentNode(Side.After) ?? fail();
	},
};

function newNodeId(): StableId {
	return v4() as StableId;
}

type Empty = Record<string, never>;

export const doubleInsertExample = {
	id: '08bac27d-632f-48bb-834a-90af8d67ca60' as CommandId,
	run: (context: CommandContext, _: Empty, { parent }: { parent: TreeNode }): TreeNode => {
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
const baz: Definition = 'Baz' as Definition;

const testTrait: TraitLabel = 'testTrait' as TraitLabel;

/**
 * Collaborative applications generally do two things:
 * 1. They present some view based on reading the shared document. This includes responding to changes to the document.
 * 2. Allow changes to be made to the document.
 *
 * This example is a minimal applications that does both of these.
 * Rather than letting a user trigger changes, it just makes changes in response to incoming edits (this made for a smaller example, but is not very realistic).
 * It shows off how an application can view the tree using Anchors then use those same anchors to make edits using commands.
 */
export async function exampleApp(tree: SharedTree): Promise<void> {
	// Perform a full checkout of all data.
	const checkout = await tree.checkout(commands, fetchAll);

	// Example app policy: this app just watches the tree, and adds bar(baz) subtree under any new `foo` node.
	// Normally an App would just hook ViewChange up to its invalidation system, but this example doesn't even have a view to invalidate, so we just put everything in here.
	// TODO: Make TypedEventEmitter use strong types.
	checkout.on(CheckoutEvent.ViewChange, (before: Snapshot, after: Snapshot) => {
		const delta = before.delta(after);
		// Note that this only actually looks at the root of newly inserted roots.
		// Thus wouldn't be a good way to enforce any actual invariants about `foo` nodes,
		// its just a contrived example of responding to changes, observing trees and performing edits.
		for (const added of delta.added) {
			// Get an contextualized anchor from the delta.
			// Theoretically the delta should produce something suable as anchors directly, but this prototype is just reusing the existing delta APIs which don't know about anchors.
			const inserted: TreeNode = checkout.contextualizeAnchor(anchorDataFromNodeId(added));
			// Here we have an example of using the tree viewing APIs.
			// In this trivial case the only thing we do with them is check the definition, but real apps would use these APIs to walk the tree and build the document view for the user.
			if (inserted.definition === foo) {
				// This shows how the application can perform an edit.
				// Typically this would be done in response to some user action, but this example doesn't have any user interface, so we just perform it in response to an edit instead.
				checkout.runCommand(doubleInsertExample, {}, { parent: inserted });
			}
		}
	});

	const treeRoot: TreeNode = checkout.contextualizeAnchor(root);
	// Here this example 'app' just prints the tree, demonstrating getting a simple json compatible view of the tree.
	// A more realistic application would build a real view of the document here, which would be invalided using ViewChange.
	console.log(treeRoot.queryJsonSnapshot.subtree);
	// The app then waits a while (while maybe some other collaborator will perform edits triggering the logic above).
	await wait(10000);
	// Finally it prints the final tree.
	console.log(treeRoot.queryJsonSnapshot.subtree);
}

async function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export const deleteNode = {
	id: '710e8cce-c7fa-4d4e-ade2-1ed66bd9bdfc' as CommandId,
	run: (context: CommandContext, options: Empty, { target }: { target: TreeNode }): Place => {
		const before = target.adjacentPlace(Side.Before);
		const range = before.rangeTo(target.adjacentPlace(Side.After));

		// This particular delete command uses the policy that if the deleted tree was changed from when this command initially ran,
		// apply it anyway, but mark it for possible application level merge resolution if part of an offline merge.
		context.useAsConstraint(
			range.withContentsOrdered(ContentsConstraint.DeepEquality),
			ConstraintEffect.ValidRetryOffline
		);

		context.detach(range);
		// This requires `before` to use anchoring which is valid despite the delete having occurred.
		// Meeting this requirement may require anchoring Before (ex: to be a before(target) instead of a predecessor(target)):
		// depends on the default anchoring policy of adjacentPlace.
		return before;
	},
};

export const moveToFront = {
	id: '64cacbb8-a52c-47ce-bf68-88be3d2cbd80' as CommandId,
	run: (context: CommandContext, options: Empty, { target }: { target: TreeNode }): void => {
		const before = target.adjacentPlace(Side.Before);
		// Assuming iteratorFromEnd is anchored based on the end of the trait, not relative to what ever node is last.
		const end = target.parent.iteratorFromEnd().current();

		// This enforces that the move to front is not changing which trait the target is in.
		// If target is moved to another trait before moved before this gets applied, this will detect it and make it conflicted.
		// The application could then rerun this command to fix it, moving it to the end of its new trait.
		context.useAsConstraint(before.rangeTo(end), ConstraintEffect.InvalidAndDiscard);

		context.move(end, target);
	},
};

// This is not a command (since it takes in a comparison function), but could be called by one.
function sort(context: CommandContext, target: Range, cmp: (a: TreeNode, b: TreeNode) => number): void {
	// This marks this command as conflicted if the contents of the range have changed.
	context.useAsConstraint(target.withContents(), ConstraintEffect.InvalidAndDiscard);

	// Perform a sort in a way that will still merge correctly, even if the input nodes were reordered.
	// This works by sorting the nodes in temporary storage, then moving each one to be after its predecessor.
	const sorted = [...target].sort(cmp);
	for (let i = 1; i < sorted.length; i++) {
		const src = sorted[i].adjacentPlace(Side.Before).rangeTo(sorted[i].adjacentPlace(Side.After));
		context.move(sorted[i - 1].adjacentPlace(Side.After), src);
	}
}

// Example command using sort.
export const sortNumbers = {
	id: '7c16bdc0-f772-46a3-acc5-3504ae745880' as CommandId,
	run: (context: CommandContext, options: Empty, { target }: { target: Range }): void => {
		sort(context, target, (a, b) => requireNumber(a.value) - requireNumber(b.value));
	},
};

function requireNumber(n: Serializable): number {
	return typeof n === 'number' ? n : commandInvalid();
}

// Note: Redo is the same as undoing an undo (at this level).
// TODO: Maybe allow a kind of anchor to a Revision（and maybe definition and label?)
export const undo: Command<{ editId: StableId }, Empty, void> = {
	id: '083ed8c8-9ee3-435f-b949-190a8eb9915c' as CommandId,
	run: (context: CommandContext, { editId }: { editId: StableId }, anchors: Empty): void => {
		// TODO: need way to deal with history access being async sometimes, but sometimes require command to be synchronous.
		// For now just using "in session" methods which are synchronous. (TODO: proper errors when not in session, or support it)
		// TODO: need way to report failure (including localized strings).
		// TODO: actually implement.

		// This is what it looks like using the snapshot level API.
		const id = context.loadEditId(editId);
		const editIndex = context.history.getIndexOfId(id);
		const edit = context.history.getEditInSessionAtIndex(editIndex);
		const snapshotBefore = context.getSnapshotInSession(editIndex);

		// Apply the revert edit and set it as the new revertible edit.
		// TODO: actually implement this in a way a command can use.
		// return tree.editor.revert(edit, snapshotBefore);
	},
};

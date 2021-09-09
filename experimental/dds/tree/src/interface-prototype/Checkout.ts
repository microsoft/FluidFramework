import { Serializable } from '@fluidframework/datastore-definitions';
import { EventEmitterWithErrorHandling } from '@fluidframework/telemetry-utils';
import { ICheckoutEvents } from '../Checkout';
import { Change, ConstraintEffect } from '../default-edits';
import { OrderedEditSet } from '../EditLog';
import { initialTree } from '../InitialTree';
import { LogViewer } from '../LogViewer';
// This file uses these as opaque id types:
// the user of these APIs should not know or care if they are short IDs or not, other than that they must be converted to StableId if stored for use outside of the shared tree it was acquired from.
// In practice, these would most likely be implemented as ShortId numbers.
import { Definition, NodeId, TraitLabel, EditId } from '../Identifiers';

// TODO: we are just reusing the exiting Snapshot type.
// This existing type does not support partial checkout:
// It would be extended to support partial checkout by allowing it to return Placeholders when walking it.
// There would then be an API to asynchronously load a Placeholder.
// On top of this, we would provide two additional features:
// - A way to control where Placeholders are allowed to occur using the PrefetchingCheckout pattern
//   (preload enough chunks so that you only encounter Placeholders at explicitly allowed locations, ex: by Definition, TraitLabel etc).
// - An API (implemented using the other APIs) that appears synchronous, but may throw if a placeholder's content is needed but isn't available.
//
// Additionally we would will need to augment Snapshot with enough history to be able to resolve rebased anchors, and give it a nicer API,
// Probably something more like TreeNodeHandle and/or the non-mutating subset of TreeNode.
import { Snapshot } from '../Snapshot';
import { Anchor, AnchorData, PlaceData, RangeData, StableId, TreeNodeData } from './Anchors';
import { DetachedRange, Place, Range, TreeNode } from './TreeAnchors';
import { TreeDescriptor } from './TreeNodeDescriptor';
import { areSafelyAssignable, isTrue } from './TypeCheck';

// Some branded ID types.
export type CommandId = StableId & { readonly CommandId: 'b1b691dc-9142-4ea2-a1aa-5f04c3808fea' };
export type Branch = StableId & { readonly Branch: '424000db-aa8f-4cb3-81dc-dcd9585700f3' };

/**
 * Editing Operation that can be performed as part of a transaction.
 * Runs with Snapshot Isolation.
 *
 * A call to a particular command makes an edit at some level of abstraction.
 * The command performs this edit using the CommandContext to either make edits directly to the tree, or via nested commands.
 *
 * Merge resolution always starts with the low level tree edits.
 * When an Edit is applied, it produces result based on the `ConstraintEffect`s indicating how the edit went.
 * If the resulting result is one of the `Retry` versions, then the application may
 * try to create a new Edit by rerunning the commands that produced the original edit.
 *
 * Unlike the low level tree edits, commands are not required to be deterministic since only one client will rerun the command,
 * and the resulting low level deterministic tree changes will be packed up into an Edit for the other clients to apply.
 *
 * When retrying an edit, the application will be provided with a Command tree (now shown in this APi prototype),
 * and can replay it as the desired abstraction level. Note that the application might not have the required commands present,
 * or they might have changed somewhat since the command was originally ran.
 * An example app policy for this could be to apply it at the lowest level that is valid (raising the level every time it detects invalidity).
 * The other extreme would be to replay it at the highest possible level, lowering the abstraction only if the command is unavailable or invalid.
 * There are also priority based options (where some levels of abstraction could be preferred regardless of if they are higher or lower).
 * Eventually we expect to settle on a single policy that will work well for all apps and provide that as a library.
 */
export interface Command<TOptions extends Serializable, TAnchorSet extends AnchorSet, TResult> {
	run(context: CommandContext, options: TOptions, anchors: TAnchorSet): TResult;
	/**
	 * Long term stable identifier to this command.
	 * A command may be rerun at some point in the future (ex: as part of merge resolution),
	 * and will be identified using its id.
	 * Thus changes to the semantics of a command should include a new ID, but other changes to a command may or may not:
	 * While commands may get rerun, they are not required to produce exactly the same results,
	 * and may fail with CommandInvalid if they can not handle the context in which they are run.
	 */
	readonly id: CommandId;
	// TODO: Maybe include localized string information/metadata here?
	// There should be a way to generate human readable command descriptions for change history, undo etc.
}

// TODO: maybe add more things to this, or move it Anchor.
export interface CommandContext extends IdSerializer, LogViewer {
	readonly history: OrderedEditSet<Change>;

	runCommand<TOptions extends Serializable, TAnchorSet extends AnchorSet, TResult>(
		command: Command<TOptions, TAnchorSet, TResult>,
		parameters: TOptions,
		anchors: DecontextualizedAnchorSet<TAnchorSet> // Anchors will be contextualized into the tree provided to the command.
	): TResult;

	/**
	 * Construct a new {@link DetachedRange} containing descriptors.
	 *
	 * This range is externally anchored (it has an Id, allocated by create used to identity it).
	 * This means the anchoring does not refer to any of the nodes contained in this range,
	 * and any additional content inserted before or after contents of this range will be included in the range.
	 * This also means that moving the content from this range elsewhere will leave this range valid, but empty.
	 *
	 * Ranges created this way, as well as their start and end, are not valid to use as anchors across edits:
	 * they are only valid within the edit in which they were created.
	 *
	 * TODO: should external anchoring and/or validity outside this transaction be encoded in the types?
	 *
	 * TODO: Allow DetachedRange inside TreeDescriptor?
	 */
	create(...descriptors: TreeDescriptor[]): DetachedRange;

	/**
	 * Remove `nodes` from their current location, and insert them at `destination`.
	 * Any
	 */
	move(destination: PlaceData, ...nodes: (TreeNodeData | RangeData)[]): Range;

	/**
	 * Detach this range from the tree.
	 *
	 * This range will point to the detached nodes, but the same range is also returned as the a more strongly typed DetachedSequence.
	 */
	detach(...nodes: (TreeNodeData | RangeData)[]): DetachedRange;

	delete(...nodes: (TreeNodeData | RangeData)[]): void;

	// Add a a constraint that this range is valid to the current transaction.
	useAsConstraint(range: RangeData, effect: ConstraintEffect): void;

	setValue(node: TreeNodeData, newValue: Serializable): void;
}

// TODO: actually implement this as a NodeId based anchor using the standard root node id.
export const root: TreeNodeData = initialTree.identifier as unknown as TreeNodeData;
// Root detached range.
export const rootRange: RangeData = 'root' as unknown as RangeData;

/**
 * A view of a tree.
 *
 * This view may change over time as edits are applied.
 */
export interface Tree extends EventEmitterWithErrorHandling<ICheckoutEvents> {
	/**
	 * The current view of this tree as an immutable snapshot.
	 * This is updated copy on write, and thus may be held onto arbitrarily but will not update:
	 * to observe actual updates, either hold onto the Tree itself, subscribe to the ViewChange event, or use a mutable view provided by the specific Tree.
	 */
	readonly currentView: Snapshot;

	/**
	 * Get a handle into the tree from anchors which might have come from another context
	 * (ex: serialized, or just from another tree).
	 *
	 * Use {@lint root} to get the whole tree.
	 *
	 * Returned anchors will observe the current state of this tree, and update as this tree changes.
	 * They may be invalid, and the validity may change over time as the tree is edited.
	 *
	 * This converts PlaceData -> Place, RangeData -> Range etc.
	 */
	contextualizeAnchor<TData extends AnchorData>(anchor: TData): Contextualize<TData>;
}

type Contextualize<TData extends AnchorData> = TData extends PlaceData
	? Place
	: TData extends RangeData
	? Range
	: TData extends TreeNodeData
	? TreeNode
	: Anchor;

// We would use this more specific type, but it causes the mutable versions to not be subtypes of the views.
// export type ParentReadonly = Trait<TreeNodeViewReadonly, PlaceViewReadonly>;

isTrue<areSafelyAssignable<Place, Contextualize<Place>>>();
isTrue<areSafelyAssignable<Range, Contextualize<Range>>>();
isTrue<areSafelyAssignable<TreeNode, Contextualize<TreeNode>>>();

isTrue<areSafelyAssignable<Place, Contextualize<PlaceData>>>();
isTrue<areSafelyAssignable<Range, Contextualize<RangeData>>>();
isTrue<areSafelyAssignable<TreeNode, Contextualize<TreeNodeData>>>();

type Decontextualize<TData extends AnchorData> = TData extends PlaceData
	? PlaceData
	: TData extends RangeData
	? RangeData
	: TData extends TreeNodeData
	? TreeNodeData
	: AnchorData;

// ////////////////////////////////////////////////////////////////////////////////

// Document and Snapshots

export interface SharedTree extends Tree {
	/**
	 * Viewer for trees defined by editLog. This allows access to views of the tree at different revisions (various points in time).
	 */
	// TODO: this just uses the existing types. Might want to make a version of LogViewer using Tree, Anchor etc.
	// TODO: how do we want to expose querying for history of specific content (git blame style)?
	readonly logViewer: LogViewer;

	// Synchronously produce a checkout where placeholders show up wherever they are in the actual data.
	checkout(r: CommandRegistry): Checkout;

	// Get a checkout with control over where the placeholders are.
	checkout(r: CommandRegistry, prefetchFilter: PrefetchFilter): Promise<Checkout>;
	// TODO: maybe option to get checkout with different API for when enforcing no placeholders at all (aka prefetching everything)

	// If branching is a feature that gets added to fluid in general, then branch selection APIs will not be specific to SharedTree
	// (ex: they would either go on the container or SharedObject).
	// If branching is custom implemented for SharedTree, then the checkout APIs here could be used to checkout branches and/or revisions.
	// Checkout a Revision results in a git style headless state.
	// Branch APIs would looks something like:
	// checkout(r: CommandRegistry, options?: {target?: Revision | Branch, prefetchFilter: PrefetchFilter}): Promise<Checkout>;
	// mergeBranch(branch: Branch, options?: {squash: boolean, allowFF: boolean, strategy: ...}): ConstraintEffect; // Would be on checkout
	// deleteBranch(branch: Branch);
}

/**
 * Specifies what data to prefetch.
 * Where the filters return false, Placeholders are allowed.
 * Returning true for all with fetch everything and produce no placeholders.
 *
 * This typically is used to expose schema based information about where chunk edges are allowed into this other wise schemaless API layer.
 * An alternative approach would be to not expose pre-fetching at all at this layer, and instead implement it entirely at the schema based layer (not included in this prototype).
 * In such a setup, it may make sense to make chunks more explicit in the API, and/or not have the mutable anchor+view API at the non-schema based layer
 * (instead require looking up anchors in snapshots, with explicit handling on unloaded data),
 * and put the nice anchor+view mutable APIs at the schema aware level.
 *
 * TODO: should we focus on the schema aware/typed API, and make the non-schema aware one optimized for writing higher level APIs instead of end user use?
 */
export interface PrefetchFilter {
	value: Filter<Definition>;
	children: Filter<Definition>;
	traitChunks: Filter<TraitLabel>;
}

type Filter<T> = (_: T) => boolean;

interface Aborted {
	error: Error | string;
}

/**
 * Head of a branch. Provides APIs for:
 *  - Viewing the version of the tree (via `Tree`). Includes locating existing Anchors in this tree.
 *  - Notifications for changes (via `viewChange` event).
 *  - Modifying the tree via commands which add a transaction (via `runCommand`).
 */
export interface Checkout extends Tree {
	/**
	 * Run a command to transactionally modify the tree.
	 *
	 * TODO: decide if changes made during the transaction should be reflected in the output of the checkout while being applied.
	 * Maybe sometimes, but not always?
	 * Maybe different change event for during transactions, and/or annotate videChange with extra data about transaction?
	 * If receiver of the event tracks the before snapshot, this pattern might work better.
	 */
	runCommand<TOptions extends Serializable, TAnchorSet extends AnchorSet, TResult>(
		command: Command<TOptions, TAnchorSet, TResult>,
		parameters: TOptions,
		anchors: DecontextualizedAnchorSet<TAnchorSet>
	): { editId: EditId; result: TResult } | Aborted;

	// TODO: need API for async command application (runs async commands and also supports running synchronous commands with retry after loading data)
}

interface IdSerializer {
	// might want different entry points for different types
	stabilize(id: Definition | TraitLabel | NodeId | EditId): StableId;

	loadDefinition(id: StableId): Definition;
	loadTraitLabel(id: StableId): TraitLabel;
	loadNodeId(id: StableId): NodeId;
	loadEditId(id: StableId): EditId;
}
/**
 * This allows interop between snapshot and anchor APIs.
 * Eventually this should be unneeded because either:
 * - We stop exposing NodeId's at this API level, so we always already have TreeNodeData instead,
 * OR
 * - We make NodeId usable as a TreeNodeData directly.
 */
export function anchorDataFromNodeId(id: NodeId): TreeNodeData {
	// TODO: implement or make unneeded.
	throw new Error('not implemented');
}

// Misc things

export interface AnchorSet {
	[key: string]: Anchor;
}

export type DecontextualizedAnchorSet<TAnchorSet extends AnchorSet> = {
	[Property in keyof TAnchorSet]: Decontextualize<TAnchorSet[Property]>;
};

export class RecoverableError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'RecoverableError';
		if (Error.captureStackTrace !== undefined) {
			Error.captureStackTrace(this);
		}
	}
}

export class PlaceholderNotLoaded extends RecoverableError {
	public constructor(readonly placeholder: Anchor) {
		super('placeholder not loaded');
	}
}

// TODO: more metadata.
export class CommandInvalid extends RecoverableError {
	public constructor() {
		super('command is invalid');
	}
}

export function commandInvalid(): never {
	throw new CommandInvalid();
}

export type CommandRegistry = readonly Command<any, any, any>[];

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { FieldKey, PathVisitor, ProtoNodes, UpPath, topDownPath } from "../../core";
import { Events, ISubscribable } from "../../events";
import { brand, getOrCreate } from "../../util";
import { on } from "../untypedTree";
import { EditableTree } from "./editableTreeTypes";

/**
 * Binder events reflecting atomic data operations
 * @alpha
 */
export interface OperationBinderEvents {
	delete(context: DeleteBindingContext): void;
	insert(context: InsertBindingContext): void;
	batch(context: BatchBindingContext): void;
}

/**
 * Binder events signaling state invalidation
 * @alpha
 */
export interface InvalidationBinderEvents {
	invalidation(context: InvalidationBindingContext): void;
}

/**
 * Compare function, generic.
 *
 * @alpha
 */
export type CompareFunction<T> = (a: T, b: T) => number;

/**
 * Compare function for binder events.
 *
 * @alpha
 */
export type BinderEventsCompare = CompareFunction<VisitorBindingContext>;

/**
 * Compare function for anchors.
 *
 * @alpha
 */
export type AnchorsCompare = CompareFunction<UpPath>;

/**
 * Options to configure binder behavior.
 *
 * TODO: add more options:
 * `filterFn?: (context: BindingContext) => boolean;`
 * `pathPolicy?: "relative" | "absolute";`
 * @alpha
 */
export interface BinderOptions {
	sortFn?: BinderEventsCompare;
}

/**
 * Specialized binder options for flushable binders.
 *
 * @alpha
 */
export interface FlushableBinderOptions<E extends Events<E>> extends BinderOptions {
	autoFlush: boolean;
	autoFlushPolicy: keyof Events<E>;
	sortAnchorsFn?: AnchorsCompare;
}

/**
 * Match policy for binding: subtree or path.
 *
 * - `subtree` match policy means that path filtering would return events matching the exact path and its subpaths,
 * ie. changes to (nested) children would be allowed to bubble up to parent listeners.
 * - {@link SubtreePolicy} match policy is  equivalent with `subtree` match policy, while allowing to specify a maximum
 * depth for the subtree.
 * - `path` match policy means that path filtering would return events matching the _exact_ path only. In this case
 * _exact_ semantics include interpreting an `undefined` _index_ field in the {@link PathStep} as a wildcard.
 *
 *
 * @alpha
 */
export type MatchPolicy = SubtreePolicy | "subtree" | "path";

/**
 * Subtree match policy where max depth can be specified.
 *
 * @alpha
 */
export interface SubtreePolicy {
	maxDepth: number;
}

/**
 * The data binder interface
 *
 * @alpha
 */
export interface DataBinder<B extends OperationBinderEvents | InvalidationBinderEvents> {
	/**
	 * Register an event listener
	 *
	 * @param anchor - The anchor to register the listener on
	 * @param eventType - The {@link BindingType} to listen for.
	 * @param eventTrees - The {@link BindPolicy}s to filter on.
	 * @param listener - The listener to register
	 */
	register<K extends keyof Events<B>>(
		anchor: EditableTree,
		eventType: K,
		eventTrees: BindPolicy[],
		listener?: B[K],
	): void;

	/**
	 * Unregister all listeners.
	 */
	unregisterAll(): void;
}

/**
 * An interface describing the ability to flush.
 *
 * @alpha
 */
export interface Flushable<T> {
	flush(): T;
}

/**
 * An interface describing a flushable data binder.
 *
 * @alpha
 */
export interface FlushableDataBinder<B extends OperationBinderEvents | InvalidationBinderEvents>
	extends DataBinder<B>,
		Flushable<FlushableDataBinder<B>> {}

/**
 * A step in a bind path
 *
 * @alpha
 */
export interface PathStep {
	/**
	 * The field being traversed
	 */
	readonly field: FieldKey;

	/**
	 * The index of the element being navigated to
	 */
	readonly index?: number;
}

/**
 * The default type for a bind tree
 *
 * @alpha
 */
export type BindTreeDefault = BindTree;

/**
 * A bind tree is a compact representation of related {@link BindPath}s.
 *
 * @alpha
 */
export interface BindTree<T = BindTreeDefault> extends PathStep {
	readonly children: Map<FieldKey, T>;
}

/**
 * A bind policy is a combination of a {@link BindTree} and a {@link MatchPolicy}.
 *
 * @alpha
 */
export interface BindPolicy {
	readonly bindTree: BindTree;
	readonly matchPolicy: MatchPolicy;
}

/**
 * Index symbol for syntax tree
 *
 * @alpha
 */
export const indexSymbol = Symbol("editable-tree-binder:index");

/**
 * A syntax node for the bind language
 *
 * The bind language is a compact representation of related {@link BindPath}s. It can be used to
 * simplify usage and construction of {@link BindTree}s.
 *
 * see {@link BindTree}
 * see {@link compileSyntaxTree}
 *
 * @alpha
 */
export interface BindSyntaxTree {
	readonly [indexSymbol]?: number;
	readonly [key: string]: true | BindSyntaxTree;
}

/**
 * A top down path in a bind or path tree is a collection of {@link PathStep}s
 *
 * see {@link BindTree}
 * see {@link UpPath}
 *
 * @alpha
 */
export type DownPath = PathStep[];

/**
 * A bind path is a top down path in a bind tree
 *
 * @alpha
 */
export type BindPath = DownPath;

/**
 * A binding context specialized for {@link PathVisitor} triggered binding events.
 *
 * @alpha
 */
export type VisitorBindingContext = DeleteBindingContext | InsertBindingContext;

/**
 * Enumeration of binding categories
 *
 * @alpha
 */
export const BindingType = {
	Delete: "delete",
	Insert: "insert",
	Invalidation: "invalidation",
	Batch: "batch",
} as const;

/**
 * The type of a binding context
 *
 * @alpha
 */
export type BindingContextType = typeof BindingType[keyof typeof BindingType];

/**
 * The binding context attribution common to all binding events
 *
 * @alpha
 */
export interface BindingContext {
	readonly type: BindingContextType;
}

/**
 * The binding context for a delete event
 *
 * @alpha
 */
export interface DeleteBindingContext extends BindingContext {
	readonly type: typeof BindingType.Delete;
	readonly path: UpPath;
	readonly count: number;
}

/**
 * The binding context for an insert event
 *
 * @alpha
 */
export interface InsertBindingContext extends BindingContext {
	readonly type: typeof BindingType.Insert;
	readonly path: UpPath;
	readonly content: ProtoNodes;
}

/**
 * The binding context for an invalidation event
 *
 * @alpha
 */
export interface InvalidationBindingContext extends BindingContext {
	readonly type: typeof BindingType.Invalidation;
}

/**
 * The binding context for a batch event
 *
 * @alpha
 */
export interface BatchBindingContext extends BindingContext {
	readonly type: typeof BindingType.Batch;
	readonly events: VisitorBindingContext[];
}

/**
 * The listener interface. Internal.
 *
 * @alpha
 */
type Listener = (...args: unknown[]) => void;

/**
 * A call tree is a {@link BindTree} augmented with listeners. Internal.
 *
 * @alpha
 */
type CallTree = BindTree<CallTree> & { listeners: Set<Listener>; matchPolicy?: MatchPolicy };

/**
 * A generic implementation of a {@link PathVisitor} enabling the registration of listeners
 * categorized by {@link BindingContextType} and {@link BindPolicy}.
 */
abstract class AbstractPathVisitor implements PathVisitor {
	protected readonly registeredListeners: Map<BindingContextType, Map<FieldKey, CallTree>> =
		new Map();
	public constructor(protected readonly options: BinderOptions) {}
	public abstract onDelete(path: UpPath, count: number): void;
	public abstract onInsert(path: UpPath, content: ProtoNodes): void;
	public registerListener(
		contextType: BindingContextType,
		policies: BindPolicy[],
		listener: Listener,
	): () => void {
		const contextRoots = getOrCreate(this.registeredListeners, contextType, () => new Map());
		policies.forEach((policy) => {
			const tree = policy.bindTree;
			const currentRoot = this.findRoot(contextType, tree.field);
			if (currentRoot === undefined) {
				const newRoot: CallTree = {
					field: tree.field,
					index: tree.index,
					listeners: new Set(),
					children: new Map(),
					matchPolicy: policy.matchPolicy,
				};
				assert(contextRoots !== undefined, 0x6da /* expected contextRoots to be defined */);
				contextRoots.set(tree.field, newRoot);
				this.bindTree(contextType, tree, listener, newRoot);
			} else {
				this.bindTree(contextType, tree, listener, currentRoot);
			}
		});
		return () => {
			policies.forEach((policy) =>
				this.unregisterListener(contextType, policy.bindTree, listener),
			);
		};
	}

	private bindTree(
		contextType: BindingContextType,
		tree: BindTree,
		listener: Listener,
		callTree: CallTree,
	) {
		if (tree.children.size === 0) {
			callTree.listeners.add(listener);
		} else {
			tree.children.forEach((childTree, fieldKey) => {
				const childCallTree = getOrCreate(callTree.children, fieldKey, () => {
					const newChildCallTree: CallTree = {
						field: fieldKey,
						index: childTree.index,
						listeners: new Set(),
						children: new Map(),
					};
					callTree.children.set(fieldKey, newChildCallTree);
					return newChildCallTree;
				});
				this.bindTree(contextType, childTree, listener, childCallTree);
			});
		}
	}

	private findRoot(contextType: BindingContextType, field: FieldKey): CallTree | undefined {
		return this.registeredListeners.get(contextType)?.get(field);
	}

	private unregisterListener(
		contextType: BindingContextType,
		tree: BindTree,
		listener: Listener,
		callTree?: CallTree,
	) {
		const foundTree = callTree ?? this.findRoot(contextType, tree.field);
		if (foundTree !== undefined) {
			if (tree.children.size === 0) {
				foundTree.listeners.delete(listener);
			} else {
				tree.children.forEach((childTree, fieldKey) => {
					assert(foundTree !== undefined, 0x6db /* expected foundTree to be defined */);
					const childCallTree = foundTree.children.get(fieldKey);
					if (childCallTree !== undefined) {
						this.unregisterListener(contextType, childTree, listener, childCallTree);
					}
				});
			}
		}
	}

	protected getListeners(
		contextType: BindingContextType,
		downPath: DownPath,
	): Set<Listener> | undefined {
		const foundRoot = this.findRoot(contextType, downPath[0].field);
		if (foundRoot === undefined) {
			return undefined;
		} else {
			const subtreeMatch = (
				subtreePolicy: SubtreePolicy | undefined,
				depth: number,
			): boolean => {
				if (subtreePolicy?.maxDepth !== undefined && depth > subtreePolicy.maxDepth) {
					return false;
				}
				return true;
			};
			const accumulateMatching = (
				treeNode: CallTree,
				index: number,
				onMatch: (index: number, treeNode: CallTree) => void,
			): void => {
				const step = downPath[index];
				if (
					step === undefined ||
					treeNode.field !== step.field ||
					(treeNode.index !== undefined && step.index !== treeNode.index)
				) {
					return undefined;
				}
				for (const child of treeNode.children.values()) {
					accumulateMatching(child, index + 1, onMatch);
				}
				onMatch(index, treeNode);
			};
			const matchedNodes: Set<Listener> = new Set();
			if (foundRoot.matchPolicy === "path") {
				accumulateMatching(foundRoot, 0, (index: number, treeNode: CallTree): void => {
					if (index === downPath.length - 1) {
						treeNode.listeners.forEach((listener) => matchedNodes.add(listener));
					}
				});
			} else if (foundRoot.matchPolicy === "subtree") {
				accumulateMatching(foundRoot, 0, (index: number, treeNode: CallTree): void => {
					treeNode.listeners.forEach((listener) => matchedNodes.add(listener));
				});
			} else {
				const matchPolicy: SubtreePolicy | undefined = foundRoot.matchPolicy;
				accumulateMatching(foundRoot, 0, (index: number, treeNode: CallTree): void => {
					if (subtreeMatch(matchPolicy, downPath.length - 1)) {
						treeNode.listeners.forEach((listener) => matchedNodes.add(listener));
					}
				});
			}
			return matchedNodes.size > 0 ? matchedNodes : undefined;
		}
	}

	public hasRegisteredContextType(contextType: BindingContextType): boolean {
		return this.registeredListeners.has(contextType);
	}

	public dispose(): void {
		this.registeredListeners.clear();
	}
}

/**
 * A visitor that invokes listeners immediately when a path is traversed.
 */
class DirectPathVisitor extends AbstractPathVisitor {
	private processListeners(path: UpPath, listeners: Set<Listener>, otherArgs: object): void {
		for (const listener of listeners) {
			listener({
				path,
				...otherArgs,
			});
		}
	}

	private processRegisteredPaths(
		path: UpPath,
		type: BindingContextType,
		otherArgs: object,
	): void {
		const current = toDownPath(path);
		const listeners = this.getListeners(type, current);
		if (listeners !== undefined) {
			this.processListeners(path, listeners, otherArgs);
		}
	}

	public onDelete(path: UpPath, count: number): void {
		this.processRegisteredPaths(path, BindingType.Delete, {
			count,
			type: BindingType.Delete,
		});
	}

	public onInsert(path: UpPath, content: ProtoNodes): void {
		this.processRegisteredPaths(path, BindingType.Insert, {
			content,
			type: BindingType.Insert,
		});
	}
}

/**
 * A visitor that invokes listeners only once when flushed if any modifications detected on the registered paths.
 */
class InvalidatingPathVisitor
	extends AbstractPathVisitor
	implements Flushable<InvalidatingPathVisitor>
{
	private readonly listeners: Set<Listener> = new Set();

	private processRegisteredPaths(path: UpPath): void {
		const current = toDownPath(path);
		const listeners = this.getListeners(BindingType.Invalidation, current);
		if (listeners !== undefined) {
			for (const listener of listeners) {
				this.listeners.add(listener);
			}
		}
	}

	public onDelete(path: UpPath, count: number): void {
		this.processRegisteredPaths(path);
	}

	public onInsert(path: UpPath, content: ProtoNodes): void {
		this.processRegisteredPaths(path);
	}

	public flush(): InvalidatingPathVisitor {
		for (const listener of this.listeners) {
			listener({
				type: BindingType.Invalidation,
			});
		}
		this.listeners.clear();
		return this;
	}

	public override dispose(): void {
		this.flush();
		super.dispose();
	}
}

type CallableBindingContext = VisitorBindingContext & {
	listeners: Set<Listener>;
};

/**
 * A visitor that buffers all events which match the registered event categories and corresponding paths.
 * Listeners are invoked when flushed. Flushing has also the ability to sort and batch the events.
 */
class BufferingPathVisitor extends AbstractPathVisitor implements Flushable<BufferingPathVisitor> {
	private readonly eventQueue: CallableBindingContext[] = [];

	public onDelete(path: UpPath, count: number): void {
		const current = toDownPath(path);
		const listeners = this.getListeners(BindingType.Delete, current);
		if (listeners !== undefined) {
			this.eventQueue.push({
				path,
				count,
				type: BindingType.Delete,
				listeners,
			});
		}
	}

	public onInsert(path: UpPath, content: ProtoNodes): void {
		const current = toDownPath(path);
		const listeners = this.getListeners(BindingType.Insert, current);
		if (listeners !== undefined) {
			this.eventQueue.push({
				path,
				content,
				type: BindingType.Insert,
				listeners,
			});
		}
	}

	public flush(): BufferingPathVisitor {
		const sortedQueue: CallableBindingContext[] = nativeSort(
			this.eventQueue,
			this.options.sortFn ?? (() => 0),
		);
		const batchEventIndices = new Set<number>();
		const batchEvents: CallableBindingContext[] = [];
		const collected = new Set<Listener>();
		if (this.hasRegisteredContextType(BindingType.Batch)) {
			for (let i = 0; i < sortedQueue.length; i++) {
				const event = sortedQueue[i];
				const current = toDownPath(event.path);
				const listeners = this.getListeners(BindingType.Batch, current);
				if (listeners !== undefined && listeners.size > 0) {
					for (const listener of listeners) {
						collected.add(listener);
					}
					batchEvents.push(event);
					batchEventIndices.add(i);
				}
			}
		}
		for (const listener of collected) {
			listener({
				type: BindingType.Batch,
				events: batchEvents,
			});
		}
		for (let i = 0; i < sortedQueue.length; i++) {
			if (batchEventIndices.has(i)) {
				continue;
			}
			const { listeners, ...context } = sortedQueue[i];
			for (const listener of listeners) {
				listener({ ...context });
			}
		}
		this.eventQueue.length = 0;
		return this;
	}

	public override dispose(): void {
		this.flush();
		super.dispose();
	}
}

class AbstractDataBinder<
	B extends OperationBinderEvents | InvalidationBinderEvents,
	V extends AbstractPathVisitor,
	O extends BinderOptions,
> implements DataBinder<B>
{
	protected readonly visitors = new Map<EditableTree, V>();
	protected readonly visitorLocations = new Map<V, UpPath>();
	protected readonly unregisterHandles = new Set<() => void>();
	public constructor(
		protected readonly options: O,
		protected readonly visitorFactory: (anchor: EditableTree) => V,
	) {}

	public register<K extends keyof Events<B>>(
		anchor: EditableTree,
		eventType: K,
		eventTrees: BindPolicy[],
		listener: B[K],
	): void {
		// TODO: validate BindPath semantics against the schema
		const visitor = getOrCreate(this.visitors, anchor, () => {
			const newVisitor = this.visitorFactory(anchor);
			this.unregisterHandles.add(
				anchor[on]("subtreeChanging", (upPath: UpPath) => {
					assert(newVisitor !== undefined, 0x6dc /* visitor expected to be defined */);
					if (!this.visitorLocations.has(newVisitor)) {
						this.visitorLocations.set(newVisitor, upPath);
					}
					return newVisitor;
				}),
			);
			return newVisitor;
		});
		const contextType: BindingContextType = eventType as BindingContextType;
		this.unregisterHandles.add(
			visitor.registerListener(contextType, eventTrees, listener as unknown as Listener),
		);
	}
	public unregisterAll(): void {
		this.unregisterHandles.forEach((h) => h());
		this.unregisterHandles.clear();
		this.visitors.forEach((v) => v.dispose());
		this.visitors.clear();
	}

	public extractBindPaths(root: BindTree): BindPath[] {
		const result: BindPath[] = [];
		const depthFirst = (node: BindTree, path: PathStep[] = [root]): void => {
			if (node.children.size === 0) {
				result.push(path);
				return;
			}
			for (const [field, childNode] of node.children.entries()) {
				depthFirst(childNode, [...path, { field, index: childNode.index }]);
			}
		};
		depthFirst(root);
		return result;
	}
}

class BufferingDataBinder<E extends Events<E>>
	extends AbstractDataBinder<
		OperationBinderEvents,
		BufferingPathVisitor,
		FlushableBinderOptions<E>
	>
	implements FlushableDataBinder<OperationBinderEvents>
{
	protected readonly view: ISubscribable<E>;
	protected readonly autoFlushPolicy: keyof Events<E>;
	public constructor(view: ISubscribable<E>, options: FlushableBinderOptions<E>) {
		super(options, (anchor: EditableTree) => new BufferingPathVisitor(options));
		this.view = view;
		this.autoFlushPolicy = options.autoFlushPolicy;
		if (options.autoFlush) {
			this.enableAutoFlush();
		}
	}

	public flush(): FlushableDataBinder<OperationBinderEvents> {
		const unsortedVisitors: BufferingPathVisitor[] = Array.from(this.visitorLocations.keys());
		const sortFn = this.options.sortAnchorsFn ?? (() => 0);
		const compareFn = (a: BufferingPathVisitor, b: BufferingPathVisitor) => {
			const pathA = this.visitorLocations.get(a);
			const pathB = this.visitorLocations.get(b);
			assert(pathA !== undefined, 0x6dd /* pathA expected to be defined */);
			assert(pathB !== undefined, 0x6de /* pathB expected to be defined */);
			return sortFn(pathA, pathB);
		};
		const sortedVisitors: BufferingPathVisitor[] = nativeSort(unsortedVisitors, compareFn);
		for (const visitor of sortedVisitors) {
			visitor.flush();
		}
		return this;
	}

	private enableAutoFlush(): FlushableDataBinder<OperationBinderEvents> {
		const callbackFn = (() => {
			this.flush();
		}) as E[keyof Events<E>];
		const unregisterFlushing = this.view.on(this.autoFlushPolicy, callbackFn);
		this.unregisterHandles.add(unregisterFlushing);
		return this;
	}
}

class DirectDataBinder<E extends Events<E>> extends AbstractDataBinder<
	OperationBinderEvents,
	DirectPathVisitor,
	BinderOptions
> {
	public constructor(view: ISubscribable<E>, options: BinderOptions) {
		super(options, (anchor: EditableTree) => new DirectPathVisitor(options));
	}
}

class InvalidateDataBinder<E extends Events<E>>
	extends AbstractDataBinder<
		InvalidationBinderEvents,
		InvalidatingPathVisitor,
		FlushableBinderOptions<E>
	>
	implements FlushableDataBinder<InvalidationBinderEvents>
{
	protected readonly view: ISubscribable<E>;
	protected readonly autoFlushPolicy: keyof Events<E>;
	public constructor(view: ISubscribable<E>, options: FlushableBinderOptions<E>) {
		super(options, (anchor: EditableTree) => new InvalidatingPathVisitor(options));
		this.view = view;
		this.autoFlushPolicy = options.autoFlushPolicy;
		if (options.autoFlush) {
			this.enableAutoFlush();
		}
	}
	public flush(): FlushableDataBinder<InvalidationBinderEvents> {
		for (const visitor of this.visitors.values()) {
			visitor.flush();
		}
		return this;
	}
	private enableAutoFlush(): FlushableDataBinder<InvalidationBinderEvents> {
		const callbackFn = (() => {
			this.flush();
		}) as E[keyof Events<E>];
		const unregisterFlushing = this.view.on(this.autoFlushPolicy, callbackFn);
		this.unregisterHandles.add(unregisterFlushing);
		return this;
	}
}

/**
 * Compute a top-town {@link DownPath} from an {@link UpPath}.
 *
 * @alpha
 */
export function toDownPath(upPath: UpPath): DownPath {
	const downPath: UpPath[] = topDownPath(upPath);
	const stepDownPath: PathStep[] = downPath.map((u) => {
		return { field: u.parentField, index: u.parentIndex };
	});
	stepDownPath.shift(); // remove last step to the root node
	return stepDownPath;
}

/**
 * Create a buffering data binder.
 *
 * @alpha
 */
export function createDataBinderBuffering<E extends Events<E>>(
	view: ISubscribable<E>,
	options: FlushableBinderOptions<E>,
): FlushableDataBinder<OperationBinderEvents> {
	return new BufferingDataBinder(view, options);
}

/**
 * Create a direct data binder.
 *
 * @alpha
 */
export function createDataBinderDirect<E extends Events<E>>(
	view: ISubscribable<E>,
	options: BinderOptions,
): DataBinder<OperationBinderEvents> {
	return new DirectDataBinder(view, options);
}

/**
 * Create an invalidating data binder.
 *
 * @alpha
 */
export function createDataBinderInvalidating<E extends Events<E>>(
	view: ISubscribable<E>,
	options: FlushableBinderOptions<E>,
): FlushableDataBinder<InvalidationBinderEvents> {
	return new InvalidateDataBinder(view, options);
}

/**
 * Create binder options. If not specified, the default values are:
 * - sortFn: no sorting
 *
 * @alpha
 */
export function createBinderOptions({ sortFn }: { sortFn?: BinderEventsCompare }): BinderOptions {
	return { sortFn };
}

/**
 * Create flushable binder options. If not specified, the default values are:
 * - sortFn: no sorting
 * - sortAnchorsFn: no sorting
 * - autoFlush: true
 *
 * @alpha
 */
export function createFlushableBinderOptions<E extends Events<E>>({
	sortFn,
	sortAnchorsFn,
	autoFlush = true,
	autoFlushPolicy,
}: {
	sortFn?: BinderEventsCompare;
	sortAnchorsFn?: AnchorsCompare;
	autoFlush?: boolean;
	autoFlushPolicy: keyof Events<E>;
}): FlushableBinderOptions<E> {
	return {
		sortFn,
		sortAnchorsFn,
		autoFlush,
		autoFlushPolicy,
	};
}

/**
 * Utility to create a compare function from a list of compare functions.
 *
 * @param fns - a list of compare functions
 * @returns a compare function that can be used for sorting
 * @alpha
 */
export function comparePipeline<T>(...fns: CompareFunction<T>[]): CompareFunction<T> {
	return (a: T, b: T): number => {
		for (const fn of fns) {
			const result = fn(a, b);
			if (result !== 0) {
				return result;
			}
		}
		return 0;
	};
}

/**
 * Native sorting algorithm.
 *
 * @param arr - the array to sort
 * @param compareFn - the compare function
 * @returns the sorted array
 */
function nativeSort<T>(arr: T[], compareFn: CompareFunction<T>): T[] {
	return [...arr].sort(compareFn);
}

/**
 * Compiles a (user friendly) syntax tree into the internal binding structure.
 * The syntax tree is a compact representation of related {@link BindPath}s.
 * The match policy can be specified. If not specified, the default value is "path".
 * @returns a {@link BindPolicy} object
 * @alpha
 */
export function compileSyntaxTree(
	syntaxTree: BindSyntaxTree,
	matchPolicy?: MatchPolicy,
): BindPolicy {
	const entries = Object.entries(syntaxTree);
	if (entries.length === 1) {
		const [fieldName, childNode] = entries[0];
		const fieldKey: FieldKey = brand(fieldName);
		const bindTree = compileSyntaxTreeNode(childNode as BindSyntaxTree, fieldKey);
		return { matchPolicy: matchPolicy ?? "path", bindTree };
	} else throw new Error("Invalid BindSyntaxTree structure");
}

function compileSyntaxTreeNode(node: BindSyntaxTree | true, parentField: FieldKey): BindTree {
	if (node === true) return { field: parentField, children: new Map() };
	const pathStep: PathStep = {
		field: parentField,
		index: node[indexSymbol],
	};
	const children = new Map<FieldKey, BindTree>();
	for (const [key, value] of Object.entries(node)) {
		const fieldKey: FieldKey = brand(key);
		children.set(fieldKey, compileSyntaxTreeNode(value, fieldKey));
	}
	return {
		...pathStep,
		children,
	};
}

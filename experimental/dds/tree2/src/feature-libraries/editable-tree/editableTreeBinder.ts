/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import {
	FieldKey,
	PathVisitor,
	ProtoNodes,
	TreeValue,
	UpPath,
	getDepth,
	topDownPath,
} from "../../core";
import { Events, ISubscribable } from "../../events";
import { brand, getOrCreate } from "../../util";
import { EditableTree, on } from "./editableTreeTypes";

/**
 * Interface that describes generic binder events
 * @alpha
 */
export interface BinderEvents {}

/**
 * Binder events reflecting atomic data operations
 * @alpha
 */
export interface OperationBinderEvents extends BinderEvents {
	delete(context: DeleteBindingContext): void;
	insert(context: InsertBindingContext): void;
	setValue(context: SetValueBindingContext): void;
	batch(context: BatchBindingContext): void;
}

/**
 * Binder events signaling state invalidation
 * @alpha
 */
export interface InvalidationBinderEvents extends BinderEvents {
	invalidation(context: InvalidationBindingContext): void;
}

export type CompareFunction<T> = (a: T, b: T) => number;

export type BinderEventsCompare = CompareFunction<BindingContext>;

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
	matchPolicy: MatchPolicy;
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
 * Match categories for bind paths.
 *
 * @alpha
 */
export type MatchPolicy = "subtree" | "path";

/**
 * The data binder interface
 *
 * @alpha
 */
export interface DataBinder<B extends BinderEvents> {
	/**
	 * Listen to specific binder events filtered by anchor, event type and path.
	 */
	register<K extends keyof Events<B>>(
		anchor: EditableTree,
		eventType: K,
		eventTrees: BindTree[],
		listener?: B[K],
	): void;

	/**
	 * Unregister all listeners.
	 */
	unregister(): void;
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
export interface FlushableDataBinder<B extends BinderEvents>
	extends DataBinder<B>,
		Flushable<FlushableDataBinder<B>> {}

/**
 * A step in a bind path
 *
 * @alpha
 */
export interface PathStep {
	readonly field: FieldKey;
	readonly index?: number;
}
/**
 * A node in a bind path
 *
 * @alpha
 */
export interface BindTree extends PathStep {
	readonly children: Map<FieldKey, BindTree>;
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
 * @alpha
 */
export interface BindSyntaxTree {
	readonly [indexSymbol]?: number;
	readonly [key: string]: boolean | BindSyntaxTree | number | undefined;
}

/**
 * A down path
 *
 * @alpha
 */
export type DownPath = PathStep[];

/**
 * A bind path
 *
 * @alpha
 */
export type BindPath = DownPath;

/**
 * @alpha
 */
export type BindingContext = DeleteBindingContext | InsertBindingContext | SetValueBindingContext;

/**
 * @alpha
 */
export type BindingContextQueue = BindingContext[];

/**
 * @alpha
 */
export const BindingType = {
	Delete: "delete",
	Insert: "insert",
	SetValue: "setValue",
	Invalidation: "invalidation",
	Batch: "batch",
} as const;

/**
 * @alpha
 */
export type BindingContextType = typeof BindingType[keyof typeof BindingType];

/**
 * @alpha
 */
export interface AbstractBindingContext {
	readonly type: BindingContextType;
}

/**
 * @alpha
 */
export interface DeleteBindingContext extends AbstractBindingContext {
	readonly type: typeof BindingType.Delete;
	readonly path: UpPath;
	readonly count: number;
}

/**
 * @alpha
 */
export interface InsertBindingContext extends AbstractBindingContext {
	readonly type: typeof BindingType.Insert;
	readonly path: UpPath;
	readonly content: ProtoNodes;
}

/**
 * @alpha
 */
export interface SetValueBindingContext extends AbstractBindingContext {
	readonly type: typeof BindingType.SetValue;
	readonly path: UpPath;
	readonly value: TreeValue;
}

/**
 * @alpha
 */
export interface InvalidationBindingContext extends AbstractBindingContext {
	readonly type: typeof BindingType.Invalidation;
}

/**
 * @alpha
 */
export interface BatchBindingContext extends AbstractBindingContext {
	readonly type: typeof BindingType.Batch;
	readonly events: BindingContext[];
}

abstract class AbstractPathVisitor implements PathVisitor {
	protected readonly registeredPaths: Map<
		BindingContextType,
		Map<BindPath, Set<(...args: unknown[]) => any>>
	> = new Map();
	public constructor(protected readonly options: BinderOptions) {}
	public abstract onDelete(path: UpPath, count: number): void;
	public abstract onInsert(path: UpPath, content: ProtoNodes): void;
	public abstract onSetValue(path: UpPath, value: TreeValue): void;

	protected matchesPath(visitPath: BindPath | undefined, downPath: BindPath): boolean {
		if (visitPath !== undefined) {
			const matchPolicy = this.options.matchPolicy;
			switch (matchPolicy) {
				case "subtree":
					if (this.pathsMatchSubtree(visitPath, downPath)) {
						return true;
					}
					break;
				case "path":
					if (this.pathsMatchPath(visitPath, downPath)) {
						return true;
					}
					break;
				default:
					unreachableCase(matchPolicy);
			}
		}
		return false;
	}
	// TODO optimize loop to hash check
	protected pathsMatchPath(current: BindPath, other: BindPath) {
		if (current.length !== other.length) {
			return false;
		}
		return this.pathsMatchSubtree(current, other);
	}
	protected pathsMatchSubtree(current: BindPath, other: BindPath) {
		for (const [i, step] of current.entries()) {
			if (
				step.field !== other[i].field ||
				(step.index !== undefined && step.index !== other[i].index)
			) {
				return false;
			}
		}
		return true;
	}

	public registerPaths(
		contextType: BindingContextType,
		paths: BindPath[],
		listener: (...args: unknown[]) => any,
	): () => void {
		const contextPaths = getOrCreate(
			this.registeredPaths,
			contextType,
			() => new Map<BindPath, Set<(...args: unknown[]) => any>>(),
		);
		for (const path of paths) {
			const pathListeners = getOrCreate(contextPaths, path, () => new Set());
			pathListeners.add(listener);
			contextPaths.set(path, pathListeners);
		}
		this.registeredPaths.set(contextType, contextPaths);
		return () => {
			this.unregisterPaths(contextType, paths, listener);
		};
	}

	public unregisterPaths(
		contextType: BindingContextType,
		paths: BindPath[],
		listener: (...args: unknown[]) => any,
	): void {
		const contextPaths = this.registeredPaths.get(contextType);
		if (contextPaths === undefined) {
			return;
		}
		for (const path of paths) {
			const pathListeners = contextPaths.get(path);
			if (pathListeners === undefined) {
				continue;
			}
			pathListeners.delete(listener);
			if (pathListeners.size === 0) {
				contextPaths.delete(path);
			}
		}
		if (contextPaths.size === 0) {
			this.registeredPaths.delete(contextType);
		}
	}

	public hasRegisteredContextType(contextType: BindingContextType): boolean {
		return this.registeredPaths.has(contextType);
	}

	public getRegisteredPaths(
		contextType: BindingContextType,
	): Map<BindPath, Set<(...args: unknown[]) => any>> | undefined {
		const contextPaths = this.registeredPaths.get(contextType);
		if (contextPaths === undefined) {
			return undefined;
		}
		const registeredPaths: Map<BindPath, Set<(...args: unknown[]) => any>> = new Map();
		for (const [path, callbacks] of contextPaths.entries()) {
			registeredPaths.set(path, callbacks);
		}
		return registeredPaths;
	}

	public dispose(): void {
		this.registeredPaths.clear();
	}
}

class DirectPathVisitor extends AbstractPathVisitor {
	public constructor(options: BinderOptions) {
		super(options);
	}

	private processCallbacks(
		path: UpPath,
		callbacks: Set<(...args: unknown[]) => any>,
		otherArgs: object,
	): void {
		for (const callback of callbacks) {
			callback({
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
		const current = toDownPath<BindPath>(path);
		const visitPaths = this.getRegisteredPaths(type);
		if (visitPaths !== undefined) {
			for (const [visitPath, callbacks] of visitPaths.entries()) {
				if (this.matchesPath(visitPath, current)) {
					this.processCallbacks(path, callbacks, otherArgs);
				}
			}
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

	public onSetValue(path: UpPath, value: TreeValue): void {
		this.processRegisteredPaths(path, BindingType.SetValue, {
			value,
			type: BindingType.SetValue,
		});
	}
}

class InvalidatingPathVisitor
	extends AbstractPathVisitor
	implements Flushable<InvalidatingPathVisitor>
{
	private readonly callbacks: Set<(...args: unknown[]) => any> = new Set();

	public constructor(options: BinderOptions) {
		super(options);
	}

	private processRegisteredPaths(path: UpPath): void {
		const current = toDownPath<BindPath>(path);
		const visitPaths = this.getRegisteredPaths(BindingType.Invalidation);
		if (visitPaths !== undefined) {
			for (const [visitPath, callbacks] of visitPaths.entries()) {
				if (this.matchesPath(visitPath, current)) {
					for (const callback of callbacks) {
						this.callbacks.add(callback);
					}
				}
			}
		}
	}

	public onDelete(path: UpPath, count: number): void {
		this.processRegisteredPaths(path);
	}

	public onInsert(path: UpPath, content: ProtoNodes): void {
		this.processRegisteredPaths(path);
	}

	public onSetValue(path: UpPath, value: TreeValue): void {
		this.processRegisteredPaths(path);
	}

	public flush(): InvalidatingPathVisitor {
		for (const callback of this.callbacks) {
			callback({
				type: BindingType.Invalidation,
			});
		}
		this.callbacks.clear();
		return this;
	}
}

type CallableBindingContext = BindingContext & {
	callbacks: Set<(...args: unknown[]) => any>;
};

class BufferingPathVisitor extends AbstractPathVisitor implements Flushable<BufferingPathVisitor> {
	private readonly eventQueue: CallableBindingContext[] = [];

	public constructor(options: BinderOptions) {
		super(options);
	}
	public onDelete(path: UpPath, count: number): void {
		const current = toDownPath<BindPath>(path);
		const visitPaths = this.getRegisteredPaths(BindingType.Delete);
		if (visitPaths !== undefined) {
			for (const [visitPath, callbacks] of visitPaths.entries()) {
				if (this.matchesPath(visitPath, current)) {
					this.eventQueue.push({
						path,
						count,
						type: BindingType.Delete,
						callbacks,
					});
				}
			}
		}
	}

	public onInsert(path: UpPath, content: ProtoNodes): void {
		const current = toDownPath<BindPath>(path);
		const visitPaths = this.getRegisteredPaths(BindingType.Insert);
		if (visitPaths !== undefined) {
			for (const [visitPath, callbacks] of visitPaths.entries()) {
				if (this.matchesPath(visitPath, current)) {
					this.eventQueue.push({
						path,
						content,
						type: BindingType.Insert,
						callbacks,
					});
				}
			}
		}
	}

	public onSetValue(path: UpPath, value: TreeValue): void {
		const current = toDownPath<BindPath>(path);
		const visitPaths = this.getRegisteredPaths(BindingType.SetValue);
		if (visitPaths !== undefined) {
			for (const [visitPath, callbacks] of visitPaths.entries()) {
				if (this.matchesPath(visitPath, current)) {
					this.eventQueue.push({
						path,
						value,
						type: BindingType.SetValue,
						callbacks,
					});
				}
			}
		}
	}

	public flush(): BufferingPathVisitor {
		const sortedQueue: CallableBindingContext[] = nativeSort(
			this.eventQueue,
			this.options.sortFn ?? compareBinderEventsDeleteFirst,
		);
		if (this.hasRegisteredContextType(BindingType.Batch)) {
			const batchPaths = this.getRegisteredPaths(BindingType.Batch);
			assert(batchPaths !== undefined, "batch paths confirmed registered");
			const collected = new Set<(...args: unknown[]) => any>();
			const batchEvents = sortedQueue.filter((event) => {
				const current = toDownPath<BindPath>(event.path);
				let filtered = false;
				for (const [visitPath, callbacks] of batchPaths.entries()) {
					if (this.matchesPath(visitPath, current)) {
						callbacks.forEach((callback) => collected.add(callback));
						filtered = true;
						break;
					}
				}
				return filtered;
			});
			if (batchEvents.length > 0) {
				for (const callback of collected) {
					callback({
						type: BindingType.Batch,
						events: batchEvents,
					});
				}
			}
			for (const event of batchEvents) {
				const index = sortedQueue.indexOf(event);
				assert(index >= 0, "event confirmed in the queue");
				sortedQueue.splice(index, 1);
			}
		}
		for (const callableContext of sortedQueue) {
			switch (callableContext.type) {
				case BindingType.Delete:
					for (const callback of callableContext.callbacks) {
						// eslint-disable-next-line @typescript-eslint/no-unused-vars
						const { callbacks, ...context } = callableContext;
						const typedContext = { ...context, type: BindingType.Delete };
						callback(typedContext);
					}
					break;
				case BindingType.Insert:
					for (const callback of callableContext.callbacks) {
						// eslint-disable-next-line @typescript-eslint/no-unused-vars
						const { callbacks, ...context } = callableContext;
						const typedContext = { ...context, type: BindingType.Insert };
						callback(typedContext);
					}
					break;
				case BindingType.SetValue:
					for (const callback of callableContext.callbacks) {
						// eslint-disable-next-line @typescript-eslint/no-unused-vars
						const { callbacks, ...context } = callableContext;
						const typedContext = { ...context, type: BindingType.SetValue };
						callback(typedContext);
					}
					break;
				default:
					unreachableCase(callableContext);
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
	B extends BinderEvents,
	V extends AbstractPathVisitor,
	O extends BinderOptions,
> implements DataBinder<B>
{
	protected readonly visitors = new Map<EditableTree, V>();
	protected readonly visitorLocations = new Map<V, UpPath>();
	protected readonly unregisterHandles: Set<() => void> = new Set();
	public constructor(
		protected readonly options: O,
		protected readonly visitorFactory: (anchor: EditableTree) => V,
	) {}

	public register<K extends keyof Events<B>>(
		anchor: EditableTree,
		eventType: K,
		eventTrees: BindTree[],
		listener: B[K],
	): void {
		// TODO: validate BindPath semantics against the schema
		let visitor = this.visitors.get(anchor);
		if (visitor === undefined) {
			visitor = this.visitorFactory(anchor);
			this.visitors.set(anchor, visitor);
			this.unregisterHandles.add(
				anchor[on]("subtreeChanging", (upPath: UpPath) => {
					assert(visitor !== undefined, "visitor expected to be defined");
					if (!this.visitorLocations.has(visitor)) {
						this.visitorLocations.set(visitor, upPath);
					}
					return visitor;
				}),
			);
		}
		const contextType: BindingContextType = eventType as BindingContextType;
		for (const eventTree of eventTrees) {
			const bindPaths = this.extractBindPaths(eventTree);
			this.unregisterHandles.add(
				visitor.registerPaths(
					contextType,
					bindPaths,
					listener as unknown as (...args: unknown[]) => any,
				),
			);
		}
	}
	public unregister(): void {
		for (const unregisterHandle of this.unregisterHandles) {
			unregisterHandle();
		}
		this.unregisterHandles.clear();
		for (const visitor of this.visitors.values()) {
			visitor.dispose();
		}
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
		const sortFn = this.options.sortAnchorsFn ?? compareAnchorsDepthFirst;
		const compareFn = (a: BufferingPathVisitor, b: BufferingPathVisitor) => {
			const pathA = this.visitorLocations.get(a);
			const pathB = this.visitorLocations.get(b);
			assert(pathA !== undefined, "pathA expected to be defined");
			assert(pathB !== undefined, "pathB expected to be defined");
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
	protected readonly autoFlushPolicy;
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
 * @alpha
 */
export function toDownPath<T extends DownPath = DownPath>(upPath: UpPath): T {
	const downPath: UpPath[] = topDownPath(upPath);
	const stepDownPath: PathStep[] = downPath.map((u) => {
		return { field: u.parentField, index: u.parentIndex };
	});
	stepDownPath.shift(); // remove last step to the root node
	return stepDownPath as T;
}

/**
 * @alpha
 */
export function createDataBinderBuffering<E extends Events<E>>(
	view: ISubscribable<E>,
	options: FlushableBinderOptions<E>,
): FlushableDataBinder<OperationBinderEvents> {
	return new BufferingDataBinder(view, options);
}

/**
 * @alpha
 */
export function createDataBinderDirect<E extends Events<E>>(
	view: ISubscribable<E>,
	options: BinderOptions,
): DataBinder<OperationBinderEvents> {
	return new DirectDataBinder(view, options);
}

/**
 * @alpha
 */
export function createDataBinderInvalidating<E extends Events<E>>(
	view: ISubscribable<E>,
	options: FlushableBinderOptions<E>,
): FlushableDataBinder<InvalidationBinderEvents> {
	return new InvalidateDataBinder(view, options);
}

/**
 * @alpha
 */
export function createBinderOptions({
	matchPolicy = "path",
	sortFn,
}: {
	matchPolicy?: MatchPolicy;
	sortFn?: BinderEventsCompare;
}): BinderOptions {
	return { matchPolicy, sortFn };
}

/**
 * @alpha
 */
export function createFlushableBinderOptions<E extends Events<E>>({
	matchPolicy = "path",
	sortFn,
	sortAnchorsFn,
	autoFlush = true,
	autoFlushPolicy,
}: {
	matchPolicy?: MatchPolicy;
	sortFn?: BinderEventsCompare;
	sortAnchorsFn?: AnchorsCompare;
	autoFlush?: boolean;
	autoFlushPolicy: keyof Events<E>;
}): FlushableBinderOptions<E> {
	return {
		matchPolicy,
		sortFn,
		sortAnchorsFn,
		autoFlush,
		autoFlushPolicy,
	};
}

export function compareBinderEventsDeleteFirst(a: BindingContext, b: BindingContext): number {
	if (a.type === BindingType.Delete && b.type === BindingType.Delete) {
		return 0;
	}
	if (a.type === BindingType.Delete) {
		return -1;
	}
	if (b.type === BindingType.Delete) {
		return 1;
	}
	return 0;
}

export function compareAnchorsDepthFirst(a: UpPath, b: UpPath): number {
	return getDepth(a) - getDepth(b);
}

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

export function nativeSort<T>(arr: T[], compareFn: CompareFunction<T>): T[] {
	return [...arr].sort(compareFn);
}

export function compileSyntaxTree(syntaxTree: BindSyntaxTree): BindTree {
	const entries = Object.entries(syntaxTree);
	if (entries.length === 1) {
		const [fieldName, childNode] = entries[0];
		const fieldKey: FieldKey = brand(fieldName);
		return compileSyntaxTreeNode(childNode as BindSyntaxTree, fieldKey);
	} else throw new Error("Invalid BindSyntaxTree structure");
}

function compileSyntaxTreeNode(node: BindSyntaxTree, parentField: FieldKey): BindTree {
	const pathStep: PathStep = {
		field: parentField,
		index: node[indexSymbol],
	};
	const children = new Map<FieldKey, BindTree>();
	for (const [key, value] of Object.entries(node)) {
		const fieldKey: FieldKey = brand(key);
		if (typeof value === "object") {
			const childTree = compileSyntaxTreeNode(value, fieldKey);
			if (childTree !== undefined) {
				children.set(fieldKey, childTree);
			}
		} else if (value === true) {
			children.set(fieldKey, { field: fieldKey, children: new Map() });
		}
	}
	return {
		...pathStep,
		children,
	};
}

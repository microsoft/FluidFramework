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
import { Events, IEmitter, ISubscribable, createEmitter } from "../../events";
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
	invalidState(context: InvalidStateBindingContext): void;
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
	sort: boolean;
	sortFn?: BinderEventsCompare;
	matchPolicy: MatchPolicyType;
}

/**
 * Specialized binder options for flushable binders.
 *
 * @alpha
 */
export interface FlushableBinderOptions<E extends Events<E>> extends BinderOptions {
	autoFlush: boolean;
	autoFlushPolicy: keyof Events<E>;
	sortAnchors: boolean;
	sortAnchorsFn?: AnchorsCompare;
}

/**
 * Match categories for bind paths.
 *
 * @alpha
 */
export type MatchPolicyType = "subtree" | "path";

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
		eventPaths: BindPath[],
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
	InvalidState: "invalidState",
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
export interface InvalidStateBindingContext extends AbstractBindingContext {
	readonly type: typeof BindingType.InvalidState;
}

/**
 * @alpha
 */
export interface BatchBindingContext extends AbstractBindingContext {
	readonly type: typeof BindingType.Batch;
	readonly events: BindingContext[];
}

abstract class AbstractPathVisitor<B extends BinderEvents> implements PathVisitor {
	protected readonly registeredPaths: Map<BindingContextType, Set<BindPath>> = new Map();
	public constructor(
		protected readonly emitter: IEmitter<B>,
		protected readonly options: BinderOptions,
	) {}
	public abstract onDelete(path: UpPath, count: number): void;
	public abstract onInsert(path: UpPath, content: ProtoNodes): void;
	public abstract onSetValue(path: UpPath, value: TreeValue): void;

	protected matchesAny(visitPaths: Set<BindPath> | undefined, downPath: BindPath): boolean {
		if (visitPaths !== undefined) {
			const matchPolicy = this.options.matchPolicy;
			for (const path of visitPaths) {
				switch (matchPolicy) {
					case "subtree":
						if (this.pathsMatchSubtree(path, downPath)) {
							return true;
						}
						break;
					case "path":
						if (this.pathsMatchExact(path, downPath)) {
							return true;
						}
						break;
					default:
						unreachableCase(matchPolicy);
				}
			}
		}
		return false;
	}
	// TODO optimize loop to hash check
	protected pathsMatchExact(current: BindPath, other: BindPath) {
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

	public registerPaths(contextType: BindingContextType, paths: BindPath[]): void {
		this.registeredPaths.set(
			contextType,
			new Set([...(this.registeredPaths.get(contextType) ?? []), ...paths]),
		);
	}

	public hasRegisteredContextType(contextType: BindingContextType): boolean {
		return this.registeredPaths.has(contextType);
	}

	public getRegisteredPaths(contextType: BindingContextType): Set<BindPath> | undefined {
		return this.registeredPaths.get(contextType);
	}

	public dispose(): void {
		this.registeredPaths.clear();
	}
}

class DirectPathVisitor extends AbstractPathVisitor<OperationBinderEvents> {
	public constructor(emitter: IEmitter<OperationBinderEvents>, options: BinderOptions) {
		super(emitter, options);
	}

	public onDelete(path: UpPath, count: number): void {
		const current = toDownPath<BindPath>(path);
		const visitPaths = this.registeredPaths.get(BindingType.Delete);
		if (this.matchesAny(visitPaths, current)) {
			this.emitter.emit(BindingType.Delete, {
				path,
				count,
				type: BindingType.Delete,
			});
		}
	}

	public onInsert(path: UpPath, content: ProtoNodes): void {
		const current = toDownPath<BindPath>(path);
		const visitPaths = this.registeredPaths.get(BindingType.Insert);
		if (this.matchesAny(visitPaths, current)) {
			this.emitter.emit(BindingType.Insert, {
				path,
				content,
				type: BindingType.Insert,
			});
		}
	}

	public onSetValue(path: UpPath, value: TreeValue): void {
		const current = toDownPath<BindPath>(path);
		const visitPaths = this.registeredPaths.get(BindingType.SetValue);
		if (this.matchesAny(visitPaths, current)) {
			this.emitter.emit(BindingType.SetValue, {
				path,
				value,
				type: BindingType.SetValue,
			});
		}
	}
}

class InvalidatePathVisitor
	extends AbstractPathVisitor<InvalidationBinderEvents>
	implements Flushable<InvalidatePathVisitor>
{
	protected invalidState = false;
	public constructor(emitter: IEmitter<InvalidationBinderEvents>, options: BinderOptions) {
		super(emitter, options);
	}
	public onDelete(path: UpPath, count: number): void {
		const current = toDownPath<BindPath>(path);
		const visitPaths = this.registeredPaths.get(BindingType.InvalidState);
		if (this.matchesAny(visitPaths, current)) {
			this.invalidState = true;
		}
	}

	public onInsert(path: UpPath, content: ProtoNodes): void {
		const current = toDownPath<BindPath>(path);
		const visitPaths = this.registeredPaths.get(BindingType.InvalidState);
		if (this.matchesAny(visitPaths, current)) {
			this.invalidState = true;
		}
	}

	public onSetValue(path: UpPath, value: TreeValue): void {
		const current = toDownPath<BindPath>(path);
		const visitPaths = this.registeredPaths.get(BindingType.InvalidState);
		if (this.matchesAny(visitPaths, current)) {
			this.invalidState = true;
		}
	}

	public flush(): InvalidatePathVisitor {
		if (this.invalidState) {
			this.emitter.emit(BindingType.InvalidState, {
				type: BindingType.InvalidState,
			});
		}
		this.invalidState = false;
		return this;
	}
}

class BufferingPathVisitor
	extends AbstractPathVisitor<OperationBinderEvents>
	implements Flushable<BufferingPathVisitor>
{
	private readonly eventQueue: BindingContext[] = [];

	public constructor(emitter: IEmitter<OperationBinderEvents>, options: BinderOptions) {
		super(emitter, options);
	}
	public onDelete(path: UpPath, count: number): void {
		const current = toDownPath<BindPath>(path);
		const visitPaths = this.registeredPaths.get(BindingType.Delete);
		if (this.matchesAny(visitPaths, current)) {
			this.eventQueue.push({ type: BindingType.Delete, path, count });
		}
	}

	public onInsert(path: UpPath, content: ProtoNodes): void {
		const current = toDownPath<BindPath>(path);
		const visitPaths = this.registeredPaths.get(BindingType.Insert);
		if (this.matchesAny(visitPaths, current)) {
			this.eventQueue.push({ type: BindingType.Insert, path, content });
		}
	}

	public onSetValue(path: UpPath, value: TreeValue): void {
		const current = toDownPath<BindPath>(path);
		const visitPaths = this.registeredPaths.get(BindingType.SetValue);
		if (this.matchesAny(visitPaths, current)) {
			this.eventQueue.push({ type: BindingType.SetValue, path, value });
		}
	}

	public flush(): BufferingPathVisitor {
		if (this.options.sort) {
			const sortFn = this.options.sortFn ?? compareBinderEventsDeleteFirst;
			this.eventQueue.sort(sortFn);
		}
		if (this.hasRegisteredContextType(BindingType.Batch)) {
			const batchPaths = this.getRegisteredPaths(BindingType.Batch);
			assert(batchPaths !== undefined, "batch paths confirmed registered");
			const batchEvents = this.eventQueue.filter((event) => {
				const current = toDownPath<BindPath>(event.path);
				return this.matchesAny(batchPaths, current);
			});
			if (batchEvents.length > 0) {
				this.emitter.emit(BindingType.Batch, {
					type: BindingType.Batch,
					events: batchEvents,
				});
			}
			for (const event of batchEvents) {
				const index = this.eventQueue.indexOf(event);
				assert(index >= 0, "event confirmed in the queue");
				this.eventQueue.splice(index, 1);
			}
		}
		for (const cmd of this.eventQueue) {
			switch (cmd.type) {
				case BindingType.Delete:
					this.emitter.emit(BindingType.Delete, cmd);
					break;
				case BindingType.Insert:
					this.emitter.emit(BindingType.Insert, cmd);
					break;
				case BindingType.SetValue:
					this.emitter.emit(BindingType.SetValue, cmd);
					break;
				default:
					unreachableCase(cmd);
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
	V extends AbstractPathVisitor<B>,
	O extends BinderOptions,
> implements DataBinder<B>
{
	protected readonly visitors = new Map<EditableTree, V>();
	protected readonly visitorLocations = new Map<V, UpPath>();
	protected readonly unregisterHandles: Set<() => void> = new Set();
	public constructor(
		protected readonly events: IEmitter<B> & ISubscribable<B>,
		protected readonly options: O,
		protected readonly visitorFactory: (anchor: EditableTree) => V,
	) {}

	public register<K extends keyof Events<B>>(
		anchor: EditableTree,
		eventType: K,
		eventPaths: BindPath[],
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
		visitor.registerPaths(contextType, eventPaths);
		this.unregisterHandles.add(this.events.on(eventType, listener));
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
		const events = createEmitter<OperationBinderEvents>();
		super(events, options, (anchor: EditableTree) => new BufferingPathVisitor(events, options));
		this.view = view;
		this.autoFlushPolicy = options.autoFlushPolicy;
		if (options.autoFlush) {
			this.enableAutoFlush();
		}
	}

	public flush(): FlushableDataBinder<OperationBinderEvents> {
		if (this.options.sortAnchors) {
			const sortFn = this.options.sortAnchorsFn ?? compareAnchorsDepthFirst;
			const sortedVisitors: BufferingPathVisitor[] = Array.from(
				this.visitorLocations.keys(),
			).sort((a, b) => {
				const pathA = this.visitorLocations.get(a);
				const pathB = this.visitorLocations.get(b);
				assert(pathA !== undefined, "pathA expected to be defined");
				assert(pathB !== undefined, "pathB expected to be defined");
				return sortFn(pathA, pathB);
			});
			for (const visitor of sortedVisitors) {
				visitor.flush();
			}
		} else {
			for (const visitor of this.visitors.values()) {
				visitor.flush();
			}
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
		const events = createEmitter<OperationBinderEvents>();
		super(events, options, (anchor: EditableTree) => new DirectPathVisitor(events, options));
	}
}

class InvalidateDataBinder<E extends Events<E>>
	extends AbstractDataBinder<
		InvalidationBinderEvents,
		InvalidatePathVisitor,
		FlushableBinderOptions<E>
	>
	implements FlushableDataBinder<InvalidationBinderEvents>
{
	protected readonly view: ISubscribable<E>;
	protected readonly autoFlushPolicy;
	public constructor(view: ISubscribable<E>, options: FlushableBinderOptions<E>) {
		const events = createEmitter<InvalidationBinderEvents>();
		super(
			events,
			options,
			(anchor: EditableTree) => new InvalidatePathVisitor(events, options),
		);
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
export function createDataBinderInvalidate<E extends Events<E>>(
	view: ISubscribable<E>,
	options: FlushableBinderOptions<E>,
): FlushableDataBinder<InvalidationBinderEvents> {
	return new InvalidateDataBinder(view, options);
}

/**
 * @alpha
 */
export function createBinderOptionsDefault(
	sortFn?: (a: BindingContext, b: BindingContext) => number,
): BinderOptions {
	return { matchPolicy: "path", sort: true, sortFn };
}

/**
 * @alpha
 */
export function createBinderOptionsSubtree(
	sortFn?: (a: BindingContext, b: BindingContext) => number,
): BinderOptions {
	return { matchPolicy: "subtree", sort: true, sortFn };
}

/**
 * @alpha
 */
export function createFlushableBinderOptionsDefault<E extends Events<E>>({
	flushEvent,
	sortFn,
	sortAnchorsFn,
}: {
	flushEvent: keyof Events<E>;
	sortFn?: BinderEventsCompare;
	sortAnchorsFn?: AnchorsCompare;
}): FlushableBinderOptions<E> {
	const options = createBinderOptionsDefault(sortFn);
	return {
		...options,
		autoFlush: true,
		autoFlushPolicy: flushEvent,
		sortAnchors: true,
		sortAnchorsFn,
	};
}

/**
 * @alpha
 */
export function createFlushableBinderOptionsSubtree<E extends Events<E>>({
	flushEvent,
	sortFn,
	sortAnchorsFn,
}: {
	flushEvent: keyof Events<E>;
	sortFn?: BinderEventsCompare;
	sortAnchorsFn?: AnchorsCompare;
}): FlushableBinderOptions<E> {
	const options = createBinderOptionsSubtree(sortFn);
	return {
		...options,
		autoFlush: true,
		autoFlushPolicy: flushEvent,
		sortAnchors: true,
		sortAnchorsFn,
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

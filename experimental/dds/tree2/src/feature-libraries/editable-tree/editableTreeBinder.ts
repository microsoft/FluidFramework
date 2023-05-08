/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
import { FieldKey, PathVisitor, ProtoNodes, TreeValue, UpPath, topDownPath } from "../../core";
import { IEmitter, ISubscribable, createEmitter } from "../../events";
import { ISharedTreeView } from "../../shared-tree";
import { EditableTree, on } from "./editableTreeTypes";

/**
 * Union of supported binder events
 *
 * TODO:
 * - split invalidState into separate interface
 * - parametrize DataBinder so that specialized binders can validate subsets of events (eg. only invalidState for InvalidateDataBinder)
 */
export interface BinderEvents {
	delete(context: DeleteBindingContext): void;
	insert(context: InsertBindingContext): void;
	setValue(context: SetValueBindingContext): void;
	invalidState(context: InvalidStateBindingContext): void;
}

/**
 * Options to configure binder behavior.
 * TODO: add more options:
 * `filterFn?: (context: BindingContext) => boolean;`
 * `pathPolicy?: "relative" | "absolute";`
 * @alpha
 */
export interface BinderOptions {
	sortFn?: (a: BindingContext, b: BindingContext) => number;
	matchPolicy: MatchPolicyType;
}

export interface FlushableBinderOptions extends BinderOptions {
	autoFlush: boolean;
	autoFlushPolicy: AutoFlushPolicyType;
}

export type MatchPolicyType = "subtree" | "path";
export type AutoFlushPolicyType = "afterBatch";

export interface DataBinder {
	register<K extends keyof BinderEvents>(
		anchor: EditableTree,
		eventName: K,
		eventPaths: BindPath[],
		listener: BinderEvents[K],
	): void;
	unregister(): void;
}

export interface Flushable<T> {
	flush(): T;
}

export interface FlushableDataBinder extends DataBinder, Flushable<FlushableDataBinder> {}

export interface PathStep {
	readonly field: FieldKey;
	readonly index?: number;
}

export type BindPath = PathStep[];

export type BindingContext = DeleteBindingContext | InsertBindingContext | SetValueBindingContext;

export type BindingContextQueue = BindingContext[];

export const BindingType = {
	Delete: "delete",
	Insert: "insert",
	SetValue: "setValue",
	InvalidState: "invalidState",
} as const;

export type BindingContextType = typeof BindingType[keyof typeof BindingType];

export interface AbstractBindingContext {
	readonly type: BindingContextType;
}

export interface DeleteBindingContext extends AbstractBindingContext {
	readonly type: typeof BindingType.Delete;
	readonly path: UpPath;
	readonly count: number;
}

export interface InsertBindingContext extends AbstractBindingContext {
	readonly type: typeof BindingType.Insert;
	readonly path: UpPath;
	readonly content: ProtoNodes;
}

export interface SetValueBindingContext extends AbstractBindingContext {
	readonly type: typeof BindingType.SetValue;
	readonly path: UpPath;
	readonly value: TreeValue;
}

export interface InvalidStateBindingContext extends AbstractBindingContext {
	readonly type: typeof BindingType.InvalidState;
}

abstract class AbstractPathVisitor implements PathVisitor {
	protected readonly registeredPaths: Map<BindingContextType, Set<BindPath>> = new Map();
	public constructor(
		protected readonly emitter: IEmitter<BinderEvents>,
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

	public dispose(): void {
		this.registeredPaths.clear();
	}
}

class DirectPathVisitor extends AbstractPathVisitor {
	public constructor(emitter: IEmitter<BinderEvents>, options: BinderOptions) {
		super(emitter, options);
	}

	public onDelete(path: UpPath, count: number): void {
		const current = toBindPath(path);
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
		const current = toBindPath(path);
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
		const current = toBindPath(path);
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
	extends AbstractPathVisitor
	implements Flushable<InvalidatePathVisitor>
{
	protected invalidState = false;
	public constructor(emitter: IEmitter<BinderEvents>, options: BinderOptions) {
		super(emitter, options);
	}
	public onDelete(path: UpPath, count: number): void {
		const current = toBindPath(path);
		const visitPaths = this.registeredPaths.get(BindingType.InvalidState);
		if (this.matchesAny(visitPaths, current)) {
			this.invalidState = true;
		}
	}

	public onInsert(path: UpPath, content: ProtoNodes): void {
		const current = toBindPath(path);
		const visitPaths = this.registeredPaths.get(BindingType.InvalidState);
		if (this.matchesAny(visitPaths, current)) {
			this.invalidState = true;
		}
	}

	public onSetValue(path: UpPath, value: TreeValue): void {
		const current = toBindPath(path);
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

class BufferingPathVisitor extends AbstractPathVisitor implements Flushable<BufferingPathVisitor> {
	private readonly eventQueue: BindingContext[] = [];

	public constructor(emitter: IEmitter<BinderEvents>, options: BinderOptions) {
		super(emitter, options);
	}
	public onDelete(path: UpPath, count: number): void {
		const current = toBindPath(path);
		const visitPaths = this.registeredPaths.get(BindingType.Delete);
		if (this.matchesAny(visitPaths, current)) {
			this.eventQueue.push({ type: BindingType.Delete, path, count });
		}
	}

	public onInsert(path: UpPath, content: ProtoNodes): void {
		const current = toBindPath(path);
		const visitPaths = this.registeredPaths.get(BindingType.Insert);
		if (this.matchesAny(visitPaths, current)) {
			this.eventQueue.push({ type: BindingType.Insert, path, content });
		}
	}

	public onSetValue(path: UpPath, value: TreeValue): void {
		const current = toBindPath(path);
		const visitPaths = this.registeredPaths.get(BindingType.SetValue);
		if (this.matchesAny(visitPaths, current)) {
			this.eventQueue.push({ type: BindingType.SetValue, path, value });
		}
	}

	public flush(): BufferingPathVisitor {
		if (this.options.sortFn) {
			this.eventQueue.sort(this.options.sortFn);
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
		super.dispose();
		this.flush();
	}
}

class AbstractDataBinder<V extends AbstractPathVisitor> implements DataBinder {
	protected readonly visitors = new Map<EditableTree, V>();
	protected readonly unregisterHandles: Set<() => void> = new Set();
	public constructor(
		protected readonly events: IEmitter<BinderEvents> & ISubscribable<BinderEvents>,
		protected readonly options: BinderOptions,
		protected readonly visitorFactory: (anchor: EditableTree) => V,
	) {}

	public register<K extends keyof BinderEvents>(
		anchor: EditableTree,
		eventName: K,
		eventPaths: BindPath[],
		listener: BinderEvents[K],
	): void {
		// TODO: validate BindPath semantics against the schema
		let visitor = this.visitors.get(anchor);
		if (visitor === undefined) {
			visitor = this.visitorFactory(anchor);
			this.visitors.set(anchor, visitor);
			this.unregisterHandles.add(anchor[on]("subtreeChanging", () => visitor));
		}
		visitor.registerPaths(eventName, eventPaths);
		this.unregisterHandles.add(this.events.on(eventName, listener));
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

class BufferingDataBinder
	extends AbstractDataBinder<BufferingPathVisitor>
	implements FlushableDataBinder
{
	protected readonly view: ISharedTreeView;
	protected readonly autoFlushPolicy;
	public constructor(view: ISharedTreeView, options: FlushableBinderOptions) {
		const events = createEmitter<BinderEvents>();
		super(events, options, (anchor: EditableTree) => new BufferingPathVisitor(events, options));
		this.view = view;
		this.autoFlushPolicy = options.autoFlushPolicy;
		if (options.autoFlush) {
			this.enableAutoFlush();
		}
	}

	public flush(): FlushableDataBinder {
		for (const visitor of this.visitors.values()) {
			visitor.flush();
		}
		return this;
	}

	private enableAutoFlush(): FlushableDataBinder {
		const unregisterFlushing = this.view.events.on(this.autoFlushPolicy, () => {
			this.flush();
		});
		this.unregisterHandles.add(unregisterFlushing);
		return this;
	}
}

class DirectDataBinder extends AbstractDataBinder<DirectPathVisitor> {
	public constructor(view: ISharedTreeView, options: BinderOptions) {
		const events = createEmitter<BinderEvents>();
		super(events, options, (anchor: EditableTree) => new DirectPathVisitor(events, options));
	}
}

class InvalidateDataBinder
	extends AbstractDataBinder<InvalidatePathVisitor>
	implements FlushableDataBinder
{
	protected readonly view: ISharedTreeView;
	protected readonly autoFlushPolicy;
	public constructor(view: ISharedTreeView, options: FlushableBinderOptions) {
		const events = createEmitter<BinderEvents>();
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
	public flush(): FlushableDataBinder {
		for (const visitor of this.visitors.values()) {
			visitor.flush();
		}
		return this;
	}
	private enableAutoFlush(): FlushableDataBinder {
		const unregisterFlushing = this.view.events.on(this.autoFlushPolicy, () => {
			this.flush();
		});
		this.unregisterHandles.add(unregisterFlushing);
		return this;
	}
}

export function toBindPath(upPath: UpPath): BindPath {
	const downPath: UpPath[] = topDownPath(upPath);
	const stepDownPath: BindPath = downPath.map((u) => {
		return { field: u.parentField, index: u.parentIndex };
	});
	stepDownPath.shift(); // remove last step to the root node
	return stepDownPath;
}

export function createDataBinderBuffering(
	view: ISharedTreeView,
	options: FlushableBinderOptions,
): FlushableDataBinder {
	return new BufferingDataBinder(view, options);
}

export function createDataBinderDirect(view: ISharedTreeView, options: BinderOptions): DataBinder {
	return new DirectDataBinder(view, options);
}

export function createDataBinderInvalidate(
	view: ISharedTreeView,
	options: FlushableBinderOptions,
): FlushableDataBinder {
	return new InvalidateDataBinder(view, options);
}

export function createBinderOptionsDefault(
	sortFn?: (a: BindingContext, b: BindingContext) => number,
): BinderOptions {
	return { matchPolicy: "path", sortFn };
}

export function createBinderOptionsSubtree(
	sortFn?: (a: BindingContext, b: BindingContext) => number,
): BinderOptions {
	return { matchPolicy: "subtree", sortFn };
}

export function createFlushableBinderOptionsDefault(
	sortFn?: (a: BindingContext, b: BindingContext) => number,
): FlushableBinderOptions {
	const options = createBinderOptionsDefault(sortFn);
	return { ...options, autoFlush: true, autoFlushPolicy: "afterBatch" };
}

export function createFlushableBinderOptionsSubtree(
	sortFn?: (a: BindingContext, b: BindingContext) => number,
): FlushableBinderOptions {
	const options = createBinderOptionsSubtree(sortFn);
	return { ...options, autoFlush: true, autoFlushPolicy: "afterBatch" };
}

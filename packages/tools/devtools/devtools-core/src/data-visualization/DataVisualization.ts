/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Indexed-object style is used to ease documentation.
/* eslint-disable @typescript-eslint/consistent-indexed-object-style */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { DataObject, TreeDataObject } from "@fluidframework/aqueduct/internal";
import type {
	IDisposable,
	IEvent,
	IFluidHandle,
	IFluidLoadable,
} from "@fluidframework/core-interfaces";
// eslint-disable-next-line import/no-deprecated
import type { IProvideFluidHandle } from "@fluidframework/core-interfaces/internal";
import type { ISharedDirectory } from "@fluidframework/map/internal";
import type { ISharedObject, SharedObject } from "@fluidframework/shared-object-base/internal";

import type { FluidObjectId } from "../CommonInterfaces.js";
import { getKeyForFluidObject } from "../FluidObjectKey.js";

import {
	visualizeDataObject,
	visualizeTreeDataObject,
	visualizeUnknownSharedObject,
} from "./DefaultVisualizers.js";
import {
	type FluidObjectNode,
	type Primitive,
	type RootHandleNode,
	type VisualChildNode,
	VisualNodeKind,
	createHandleNode,
	unknownObjectNode,
} from "./VisualTree.js";

// Ideas:
// - Hold onto previous summary and only transmit diff?

// TODOs:
// - Dependency tracking
//   - When a particular DDS is no longer reachable via the input data, we need to remove it from the map and stop
//     emitting updates.

/**
 * The type of a shared object.
 *
 * @remarks
 *
 * This can be acquired via {@link @fluidframework/datastore-definitions#IChannelFactory.Type} field of
 * your shared object's factory class.
 */
export type SharedObjectType = string;

/**
 * Generates a visual description of the provided {@link @fluidframework/shared-object-base#ISharedObject}'s
 * current state.
 *
 * @param sharedObject - The object whose data will be rendered.
 * @param visualizeChildData - Callback to render child content of the shared object.
 *
 * @returns A visual tree representation of the provided `sharedObject`.
 *
 * @internal
 */
export type VisualizeSharedObject = (
	sharedObject: ISharedObject,
	visualizeChildData: VisualizeChildData,
) => Promise<FluidObjectNode>;

/**
 * Recursively renders child contents of a {@link @fluidframework/shared-object-base#ISharedObject}.
 *
 * @param data - The child data to render.
 * Since this is child data of a DDS (and must be serializable), we know that it must be one of the following:
 *
 * - Primitive data
 *
 * - A serializable Record
 *
 * - A handle to another Fluid object
 *
 * @returns A visual tree representation of the input `data`.
 *
 * @internal
 */
export type VisualizeChildData = (data: unknown) => Promise<VisualChildNode>;

/**
 * Utility type for a union of things that can be visualized.
 */
export type VisualizableFluidObject = ISharedObject | DataObject | TreeDataObject<unknown>;

/**
 * Specifies renderers for different {@link @fluidframework/shared-object-base#ISharedObject} types.
 *
 * @remarks
 *
 * - `key`: The type of Shared object ({@link @fluidframework/datastore-definitions#IChannelFactory.Type}).
 *
 * - `value`: A renderer that takes a {@link @fluidframework/shared-object-base#ISharedObject} of the
 * specified type and generates a corresponding {@link VisualizerNode} for it.
 */
export interface SharedObjectVisualizers {
	/**
	 * Individual Fluid object visualizers, keyed by {@link SharedObjectType}.
	 */
	[k: SharedObjectType]: VisualizeSharedObject;
}

/**
 * Data visualization update events.
 */
export interface DataVisualizerEvents extends IEvent {
	/**
	 * Emitted whenever the associated {@link @fluidframework/shared-object-base#ISharedObject}'s data is updated.
	 *
	 * @param visualTree - The updated visual tree representing the shared object's state.
	 *
	 * @eventProperty
	 */
	(event: "update", listener: (visualTree: FluidObjectNode) => void): unknown;
}

/**
 * Manages {@link VisualizerNode | visualizers} for shared objects reachable by
 * the provided {@link DataVisualizerGraph.rootData}.
 *
 * @remarks
 *
 * {@link VisualizerNode}s are initialized lazily.
 *
 * Consumers can begin tree visualization by calling {@link DataVisualizerGraph.renderRootHandles}.
 * The returned handle nodes provide the IDs required to make subsequent calls to {@link DataVisualizerGraph.render}
 * to visualize subtrees as needed.
 */
export class DataVisualizerGraph
	extends TypedEventEmitter<DataVisualizerEvents>
	implements IDisposable
{
	/**
	 * Map of registered {@link VisualizerNode}s, keyed by their corresponding {@link FluidObjectId}.
	 *
	 * @privateRemarks TODO: Dependency tracking so we don't leak memory.
	 */
	private readonly visualizerNodes: Map<FluidObjectId, VisualizerNode>;

	/**
	 * Private {@link VisualizerNode.disposed} tracking.
	 */
	private _disposed: boolean;

	/**
	 * Handler for a visualizer node's "update" event.
	 * Bubbles up the event to graph subscribers.
	 */
	private readonly onVisualUpdateHandler = (visualTree: FluidObjectNode): boolean => {
		this.emitVisualUpdate(visualTree);
		return true;
	};

	public constructor(
		/**
		 * {@inheritDoc IContainerDevtools.containerData}
		 */
		private readonly rootData: Record<string, IFluidLoadable>,

		/**
		 * Policy object for visualizing different kinds of shared objects.
		 */
		private readonly visualizers: SharedObjectVisualizers,
	) {
		super();

		this.visualizerNodes = new Map<FluidObjectId, VisualizerNode>();

		this._disposed = false;
	}

	/**
	 * {@inheritDoc IDisposable.disposed}
	 */
	public get disposed(): boolean {
		return this._disposed;
	}

	/**
	 * Emits a visual tree update from one of the registered visualizer nodes.
	 */
	private emitVisualUpdate(visualTree: FluidObjectNode): void {
		this.emit("update", visualTree);
	}

	/**
	 * Generates and returns visual descriptions ({@link FluidHandleNode}s) for each of the specified
	 * {@link DataVisualizerGraph.rootData | root shared objects}.
	 */
	public async renderRootHandles(): Promise<Record<string, RootHandleNode>> {
		// TODO: We should be rendering the DataObject from the root, but this requires change in the devtools package in general.

		// Rendering the root entries amounts to initializing visualizer nodes for each of them, and returning
		// a list of handle nodes. Consumers can request data for each of these handles as needed.
		const rootDataEntries = Object.entries(this.rootData);

		const result: Record<string, RootHandleNode> = {};
		await Promise.all(
			rootDataEntries.map(async ([key, value]) => {
				if (value.handle === undefined) {
					console.error(
						`Container data includes a non-Fluid object under key ${key}. Cannot visualize!`,
					);
					result[key] = unknownObjectNode;
				} else {
					const fluidObjectId = await this.registerVisualizerForHandle(value.handle);
					result[key] =
						fluidObjectId === undefined ? unknownObjectNode : createHandleNode(fluidObjectId);
				}
			}),
		);
		return result;
	}

	/**
	 * Generates and returns a visual description of the specified Fluid object if it exists in the graph.
	 * If no such object exists in the graph, returns `undefined`.
	 */
	public async render(fluidObjectId: FluidObjectId): Promise<FluidObjectNode | undefined> {
		// If we don't have anything registered for the requested Fluid object, return `undefined`.
		// This could indicate a stale data request from an external consumer, or could indicate a bug,
		// but this library isn't capable of telling the difference.
		return this.visualizerNodes.get(fluidObjectId)?.render() ?? undefined;
	}

	/**
	 * Adds a visualizer node to the collection for the specified
	 * {@link VisualizableFluidObject} if one does not already exist.
	 */
	private registerVisualizerForVisualizableObject(
		visualizableObject: VisualizableFluidObject,
	): FluidObjectId {
		// Store type check results to avoid recomputing
		const isDataObj = isDataObject(visualizableObject);
		const isTreeDataObj = isTreeDataObject(visualizableObject);

		let visualizationFunction: VisualizeSharedObject;
		let rootSharedObject: ISharedObject;
		let objectId: FluidObjectId;

		if (isDataObj) {
			rootSharedObject = (visualizableObject as unknown as { readonly root: ISharedDirectory })
				.root;
			objectId = getKeyForFluidObject(rootSharedObject);
			visualizationFunction = visualizeDataObject;
		} else if (isTreeDataObj) {
			rootSharedObject = (
				visualizableObject as unknown as { readonly sharedTree: ISharedObject }
			).sharedTree;
			objectId = getKeyForFluidObject(rootSharedObject);
			visualizationFunction = visualizeTreeDataObject;
		} else {
			rootSharedObject = visualizableObject;
			objectId = getKeyForFluidObject(visualizableObject);
			visualizationFunction =
				(this.visualizers[visualizableObject.attributes.type] as VisualizeSharedObject) ??
				visualizeUnknownSharedObject;
		}

		if (!this.visualizerNodes.has(objectId)) {
			const visualizerNode = new VisualizerNode(
				rootSharedObject,
				visualizationFunction,
				async (handle) => this.registerVisualizerForHandle(handle),
			);

			// Register event handler so we can bubble up update events
			visualizerNode.on("update", this.onVisualUpdateHandler);

			// Add the visualizer node to our collection
			this.visualizerNodes.set(objectId, visualizerNode);
		}

		return objectId;
	}

	/**
	 * Adds a visualizer node to the collection for the specified {@link @fluidframework/core-interfaces#(IFluidHandle:interface)}
	 * if one does not already exist.
	 *
	 * @returns
	 *
	 * The ID of object associated with the provided handle, if the handle resolves to a {@link ISharedObject}.
	 * If the handle resolves to something else, this sytem has no way to reason about it sufficiently to generate
	 * visual descriptors from it.
	 * In this case, we return `undefined`.
	 */
	private async registerVisualizerForHandle(
		handle: IFluidHandle,
	): Promise<FluidObjectId | undefined> {
		const resolvedObject = await handle.get();

		if (isDataObject(resolvedObject) || isTreeDataObject(resolvedObject)) {
			return this.registerVisualizerForVisualizableObject(resolvedObject);
		}

		// TODO: is this the right type check for this?
		const sharedObject = resolvedObject as Partial<ISharedObject>;
		if (isSharedObject(sharedObject)) {
			return this.registerVisualizerForVisualizableObject(sharedObject);
		} else {
			// Unknown data.
			console.warn(
				"Fluid Handle resolved to data that is not a SharedObject or a DataObject.",
			);
			return undefined;
		}
	}

	/**
	 * {@inheritDoc IDisposable.dispose}
	 */
	public dispose(): void {
		if (!this._disposed) {
			// Dispose visualizer nodes.
			for (const visualizerNode of this.visualizerNodes.values()) {
				visualizerNode.dispose();
			}
			this.visualizerNodes.clear();

			this._disposed = true;
		}
	}
}

/**
 * Wraps a {@link @fluidframework/shared-object-base#ISharedObject} and encapsulates policy for
 * generating visual tree representations of its data.
 *
 * @remarks
 *
 * A visual representation can be requested via {@link VisualizerNode.render}.
 *
 * Additionally, whenever the associated `ISharedObject` is updated (i.e. whenever its "op" event is emitted),
 * an updated visual tree will be emitted via this object's {@link SharedObjectListenerEvents | "update" event}.
 */
export class VisualizerNode
	extends TypedEventEmitter<DataVisualizerEvents>
	implements IDisposable
{
	/**
	 * Handler for {@link VisualizerNode.sharedObject}'s "op" event.
	 * Will broadcast an updated visual tree representation of the DDS's data via the
	 * {@link SharedObjectListenerEvents | "update"} event.
	 */
	private readonly onOpHandler = async (): Promise<boolean> => {
		try {
			await this.emitVisualUpdate();
			return true;
		} catch (error) {
			console.error(error);
			return false;
		}
	};

	/**
	 * Private {@link VisualizerNode.disposed} tracking.
	 */
	private _disposed: boolean;

	/**
	 * Handles the returned promise for {@link onOpHandler}.
	 */
	private readonly syncOpHandler = (): void => {
		this.onOpHandler().catch((error) => console.error(error));
	};

	public constructor(
		/**
		 * The Fluid object whose data will be emitted in visualized form when requested / whenever its data is updated.
		 */
		public readonly sharedObject: ISharedObject,

		/**
		 * Callback for visualizing {@link VisualizerNode.sharedObject}.
		 * Encapsulates the policies for rendering different kinds of DDSs.
		 */
		private readonly visualizeSharedObject: VisualizeSharedObject,

		/**
		 * Registers some child handle to a Fluid object for future rendering.
		 *
		 * @remarks
		 *
		 * Called during {@link VisualizerNode.render} whenever a Fluid handle is encountered.
		 * Ensures that the consumer of this object's visual tree will be able to request a rendering of the handle's
		 * corresponding DDS as needed.
		 */
		private readonly registerHandle: (
			handle: IFluidHandle,
		) => Promise<FluidObjectId | undefined>,
	) {
		super();

		this.sharedObject.on?.("op", this.syncOpHandler);

		this._disposed = false;
	}

	/**
	 * {@inheritDoc IDisposable.disposed}
	 */
	public get disposed(): boolean {
		return this._disposed;
	}

	/**
	 * Emits a {@link VisualizerNode.render | visual tree representation} of
	 * {@link VisualizerNode.sharedObject}'s current state as an
	 * {@link SharedObjectListenerEvents | "update"} event.
	 */
	private async emitVisualUpdate(): Promise<void> {
		try {
			const visualTree: FluidObjectNode = await this.render();
			this.emit("update", visualTree);
		} catch (error) {
			console.log(error);
		}
	}

	/**
	 * Generates a visual description of the associated {@link VisualizerNode.sharedObject}'s
	 * current state.
	 *
	 * @remarks
	 *
	 * Will recursively render child contents of {@link VisualizerNode.sharedObject}, terminating at
	 * primitive data and handles to other Fluid objects.
	 *
	 * @returns A visual tree representation of {@link VisualizerNode.sharedObject}.
	 */
	public async render(): Promise<FluidObjectNode> {
		return this.visualizeSharedObject(this.sharedObject, async (data) =>
			this.renderChildData(data),
		);
	}

	/**
	 * {@inheritDoc VisualizeChildData}
	 */
	private async renderChildData(data: unknown): Promise<VisualChildNode> {
		return visualizeChildData(data, this.registerHandle);
	}

	/**
	 * {@inheritDoc IDisposable.dispose}
	 */
	public dispose(): void {
		if (!this._disposed) {
			this.sharedObject.off("op", this.syncOpHandler);
			this._disposed = true;
		}
	}
}

/**
 * See {@link VisualizeChildData}.
 *
 * @param data - The child data to (recursively) render.
 * @param resolveHandle - Function which accepts an {@link @fluidframework/core-interfaces#(IFluidHandle:interface)}
 * and returns its resolved object ID.
 *
 * @privateRemarks Exported from this module for testing purposes. This is not intended to be exported by the package.
 */
export async function visualizeChildData(
	data: unknown,
	resolveHandle: (handle: IFluidHandle) => Promise<FluidObjectId | undefined>,
): Promise<VisualChildNode> {
	// Special case for `null` because `typeof null === "object"`.
	if (data === null) {
		return {
			value: data,
			typeMetadata: "null",
			nodeKind: VisualNodeKind.ValueNode,
		};
	}

	if (typeof data !== "object" && typeof data !== "function") {
		// Render primitives and falsy types via their string representation
		return {
			value: data as Primitive,
			typeMetadata: typeof data,
			nodeKind: VisualNodeKind.ValueNode,
		};
	}

	// eslint-disable-next-line import/no-deprecated
	if ((data as IProvideFluidHandle)?.IFluidHandle !== undefined) {
		// If we encounter a Fluid handle, register it for future rendering, and return a node with its ID.
		const handle = data as IFluidHandle;
		const fluidObjectId = await resolveHandle(handle);
		// If no ID was found, then the data is not a SharedObject.
		// In this case, return an "Unknown Data" node so consumers can note this (as desired) to the user.
		return fluidObjectId === undefined ? unknownObjectNode : createHandleNode(fluidObjectId);
	}

	// Assume any other data must be a record of some kind (since DDS contents must be serializable)
	// and simply recurse over its keys.
	const childEntries = Object.entries(data as Record<string | number | symbol, unknown>);

	const children: Record<string, VisualChildNode> = {};
	await Promise.all(
		childEntries.map(async ([key, value]) => {
			const childNode = await visualizeChildData(value, resolveHandle);
			children[key] = childNode;
		}),
	);

	return {
		children,
		nodeKind: VisualNodeKind.TreeNode,
		typeMetadata: "object",
	};
}

/**
 * Determines whether or not the provided value is an {@link ISharedObject}, for the purposes of this library.
 * @remarks Implemented by checking for the particular properties / methods we use in this module.
 */
function isSharedObject(value: unknown): value is ISharedObject {
	return (
		(value as SharedObject).id !== undefined &&
		(value as SharedObject).attributes?.type !== undefined &&
		(value as SharedObject).on !== undefined
	);
}

/**
 * Determines whether or not the provided value is an {@link DataObject} using `instanceof`, for the purposes of this library.
 * @remarks
 * Uses `instanceof` over checking specific properties or methods, because we decided that a version mix-up with
 * {@link @fluidframework/aqueduct#} is unlikely between devtools and end-user applications, and we don't support it anyway.
 */
function isDataObject(value: unknown): value is DataObject {
	if (
		value instanceof DataObject ||
		(typeof (value as DataObject).initializeInternal === "function" &&
			typeof (value as { getUninitializedErrorString(): string })
				.getUninitializedErrorString) === "function"
	) {
		// If root is missing, throw an error instead of returning false
		const root = (value as { readonly root?: ISharedDirectory }).root;
		if (!root) {
			throw new Error("DataObject must have a `root` property, but it was undefined.");
		}

		return true;
	}

	return false;
}

/**
 * Determines whether or not the provided value is a {@link TreeDataObject} using `instanceof`, for the purposes of this library.
 * @remarks
 * Tries to use `instanceof` because we decided that a version mix-up with
 * {@link @fluidframework/aqueduct#} is unlikely between devtools and end-user applications, and we don't support it anyway.
 * In addition, we check for the presence of key properties that make a `TreeDataObject` unique:
 * - {@link TreeDataObject#sharedTree | sharedTree} getter
 * - {@link TreeDataObject#treeView | treeView} getter
 * - {@link TreeDataObject#initializeInternal | initializeInternal} method
 */
function isTreeDataObject(value: unknown): value is TreeDataObject<unknown> {
	if (
		value instanceof TreeDataObject ||
		(typeof (value as TreeDataObject<unknown>).initializeInternal === "function" &&
			Object.getOwnPropertyDescriptor(Object.getPrototypeOf(value), "sharedTree")?.get !==
				undefined)
	) {
		const tree = (value as { readonly sharedTree?: ISharedObject }).sharedTree;
		if (tree === undefined) {
			throw new Error(
				"TreeDataObject must have a `sharedTree` property, but it was undefined.",
			);
		}

		return true;
	}

	return false;
}

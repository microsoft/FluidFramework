/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable, IEvent } from "@fluidframework/common-definitions";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { IFluidHandle, IFluidLoadable, IProvideFluidHandle } from "@fluidframework/core-interfaces";
import { ISharedObject } from "@fluidframework/shared-object-base";
import { visualizeUnknownSharedObject } from "./DefaultVisualizers";

import {
	createHandleNode,
	FluidHandleNode,
	FluidObjectId,
	FluidObjectNode,
	NodeKind,
	ValueNode,
	VisualParentNode,
	VisualTreeNode,
} from "./VisualTree";

// Ideas:
// - Hold onto previous summary and only transmit diff?

// TODOs:
// - Needs to be disposable so we can unbind listeners when the thing is no longer referenced.
// - We need a structure that manages the cross-DDS dependencies such that...
//   - Callers can request data for a specific DDS by its ID
//   - We know when a particular DDS is no longer reachable, so we can remove it from the map
//     - Note: the same DDS can be referenced in multiple places, so we have to be careful here
//   - We know when a new DDS is referenced, so we can add it to the map

/**
 * The type of a shared object.
 * Can be acquired via {@link @fluidframework/datastore-definitions#IChannelFactory.Type} field of
 * your shared-object's factory class.
 *
 * @privateRemarks TODO: can we do something better here?
 */
export type SharedObjectType = string;

/**
 * TODO
 */
export type VisualizeSharedObject = (
	sharedObject: ISharedObject,
	label: string,
	visualizeChildData: VisualizeChildData,
) => Promise<FluidObjectNode>;

/**
 * TODO
 */
export type VisualizeChildData = (data: unknown, label: string) => Promise<VisualTreeNode>;

/**
 * Specifies renderers for different {@link @fluidframework/shared-object-base#ISharedObject} types.
 *
 * @remarks
 *
 * - `key`: The type of Shared object ({@link @fluidframework/datastore-definitions#IChannelFactory.Type}).
 *
 * - `value`: A renderer that takes a {@link @fluidframework/shared-object-base#ISharedObject} of the
 * specified type and generates a corresponding {@link SharedObjectVisualizerNode} for it.
 */
export interface SharedObjectVisualizers {
	/**
	 * Individual Fluid object visualizers, keyed by {@link SharedObjectType}.
	 */
	[k: SharedObjectType]: VisualizeSharedObject;
}

/**
 * Manages {@link SharedObjectVisualizerNode | visualizers} for shared objects reachable by
 * the provided {@link DataVisualizerGraph.rootData}.
 *
 * @remarks
 *
 * {@link SharedObjectVisualizerNode}s are initialized lazily.
 */
export class DataVisualizerGraph {
	/**
	 * {@inheritDoc IFluidClientDebugger.containerData}
	 */
	private readonly rootData: Record<string, IFluidLoadable>;

	/**
	 * TODO
	 */
	private readonly visualizerSchema: SharedObjectVisualizers;

	// TODO: weak ref + related cleanup
	private readonly visualizerNodes: Map<FluidObjectId, SharedObjectVisualizerNode>;
	private readonly handles: Map<FluidObjectId, IFluidHandle>;

	// TODO: take in a callback for emitting automatic updates, and wire that up to the individual visualizer nodes.
	public constructor(
		rootData: Record<string, IFluidLoadable>,
		visualizerMap: SharedObjectVisualizers,
	) {
		this.rootData = rootData;
		this.visualizerSchema = visualizerMap;

		this.visualizerNodes = new Map<FluidObjectId, SharedObjectVisualizerNode>();
		this.handles = new Map<FluidObjectId, IFluidHandle>();
	}

	/**
	 * Generates and returns visual descriptions ({@link FluidHandleNode}s) for each of the specified
	 * {@link DataVisualizerGraph.rootData | root shared objects}.
	 */
	public async renderRootHandles(): Promise<FluidHandleNode[]> {
		// Rendering the root entries amounts to initializing visualizer nodes for each of them, and returning
		// a list of handle nodes. Consumers can request data for each of these handles as needed.
		const rootDataEntries = Object.entries(this.rootData);
		return Promise.all(
			rootDataEntries.map(async ([key, value]) => {
				const fluidObjectId = await this.registerVisualizerForHandle(value.handle, key);
				return createHandleNode(fluidObjectId, key);
			}),
		);
	}

	/**
	 * Generates and returns a visual description of the specified Fluid object if it exists in the graph.
	 * If no such object exists in the graph, returns `undefined`.
	 */
	public async render(fluidObjectId: FluidObjectId): Promise<FluidObjectNode | undefined> {
		if (!this.visualizerNodes.has(fluidObjectId)) {
			// We don't have anything registered for the requested Fluid object.
			// This could indicate a stale data request from an external consumer, or could indicate a bug.
			return undefined;
		}

		// Checked above.
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const visualizerNode = this.visualizerNodes.get(fluidObjectId)!;
		return visualizerNode.render();
	}

	private registerHandle(id: FluidObjectId, handle: IFluidHandle): void {
		if (!this.handles.has(id)) {
			this.handles.set(id, handle);
		}
	}

	private registerVisualizerForSharedObject(sharedObject: ISharedObject, label: string): void {
		if (!this.visualizerNodes.has(sharedObject.id)) {
			const visualizer =
				this.visualizerSchema[sharedObject.attributes.type] !== undefined
					? this.visualizerSchema[sharedObject.attributes.type]
					: visualizeUnknownSharedObject;
			this.visualizerNodes.set(
				sharedObject.id,
				new SharedObjectVisualizerNode(
					sharedObject,
					label,
					visualizer,
					async (_handle, _label) => this.registerVisualizerForHandle(_handle, _label),
				),
			);
		}
	}

	/**
	 * Adds a visualizer node to the collection for the specified `handle` if one does not
	 * already exist.
	 *
	 * @throws This method will throw if the provided `handle` does not resolve to an
	 * {@link @fluidframework/shared-object-base#ISharedObject}.
	 */
	private async registerVisualizerForHandle(
		handle: IFluidHandle,
		label: string,
	): Promise<FluidObjectId> {
		const resolvedObject = await handle.get();

		// TODO: is this the right type check for this?
		const sharedObject = resolvedObject as ISharedObject;
		if (sharedObject?.id !== undefined) {
			this.registerHandle(sharedObject.id, handle);
			this.registerVisualizerForSharedObject(sharedObject, label);
			return sharedObject.id;
		} else {
			// Unknown data.
			throw new Error(`Encountered unrecognized kind of Fluid data under "${label}"`);
		}
	}
}

/**
 * Events emitted by {@link SharedObjectListener}.
 */
export interface SharedObjectListenerEvents extends IEvent {
	/**
	 * Emitted whenever the associated {@link @fluidframework/shared-object-base#ISharedObject}'s data is updated.
	 *
	 * @param visualTree - The updated visual tree representing the shared object's state.
	 */
	(event: "update", listener: (visualTree: FluidObjectNode) => void);
}

/**
 * Wraps a {@link @fluidframework/shared-object-base#ISharedObject} and encapsulates policy for
 * generating visual tree representations of its data.
 *
 * @remarks
 *
 * A visual representation can be requested via {@link SharedObjectVisualizerNode.render}.
 *
 * Additionally, whenever the associated `ISharedObject` is updated (i.e. whenever its "op" event is emitted),
 * an updated visual tree will be emitted via this object's {@link SharedObjectListenerEvents | "update" event}.
 */
export class SharedObjectVisualizerNode
	extends TypedEventEmitter<SharedObjectListenerEvents>
	implements IDisposable
{
	/**
	 * The Fluid object whose data will be emitted in visualized form when requested / whenever its data is updated.
	 */
	public readonly sharedObject: ISharedObject;

	/**
	 * Label corresponding to the shared object.
	 *
	 * @remarks Generally, this will be the associated property name, map key, etc.
	 */
	public readonly label: string;

	/**
	 * Callback for visualizing {@link SharedObjectVisualizerNode.sharedObject}.
	 * Encapsulates the policies for rendering different kinds of DDSs.
	 */
	private readonly visualizeSharedObject: VisualizeSharedObject;

	/**
	 * Registers some child handle to a Fluid object for future rendering.
	 *
	 * @remarks
	 *
	 * Called during {@link SharedObjectVisualizerNode.render} whenever a Fluid handle is encountered.
	 * Ensures that the consumer of this object's visual tree will be able to request a rendering of the handle's
	 * corresponding DDS as needed.
	 */
	private readonly registerHandle: (
		handle: IFluidHandle,
		label: string,
	) => Promise<FluidObjectId>;

	/**
	 * Handler for {@link SharedObjectVisualizerNode.sharedObject}'s "op" event.
	 * Will broadcast an updated visual tree representation of the DDS's data via the
	 * {@link SharedObjectListenerEvents | "update"} event.
	 */
	private readonly onOpHandler = (): boolean => {
		this.emitVisualUpdate();
		return true;
	};

	/**
	 * Private {@link SharedObjectVisualizerNode.disposed} tracking.
	 */
	private _disposed: boolean;

	public constructor(
		sharedObject: ISharedObject,
		label: string,
		visualizeSharedObject: VisualizeSharedObject,
		registerHandle: (handle: IFluidHandle, label: string) => Promise<FluidObjectId>,
	) {
		super();

		this.sharedObject = sharedObject;
		this.label = label;
		this.visualizeSharedObject = visualizeSharedObject;
		this.registerHandle = registerHandle;

		this.sharedObject.on("op", this.onOpHandler);

		this._disposed = false;
	}

	/**
	 * {@inheritDoc IDisposable.disposed}
	 */
	public get disposed(): boolean {
		return this._disposed;
	}

	/**
	 * Emits a {@link SharedObjectVisualizerNode.render | visual tree representation} of
	 * {@link SharedObjectVisualizerNode.sharedObject}'s current state as an
	 * {@link SharedObjectListenerEvents | "update"} event.
	 */
	private emitVisualUpdate(): void {
		const visualTree = this.render();
		this.emit("update", visualTree);
	}

	/**
	 * Generates a visual description of the associated {@link SharedObjectVisualizerNode.sharedObject}'s
	 * current state.
	 *
	 * @remarks
	 *
	 * Will recursively render child contents of {@link SharedObjectVisualizerNode.sharedObject}, terminating at
	 * primitive data and handles to other Fluid objects.
	 */
	public async render(): Promise<FluidObjectNode> {
		return this.visualizeSharedObject(this.sharedObject, this.label, async (_data, _label) =>
			this.renderChildData(_data, _label),
		);
	}

	/**
	 * Recursively renders child contents of {@link SharedObjectVisualizerNode.sharedObject}.
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
	 * @param label - The corresponding label (e.g. property name) to associate with the visual tree
	 * generated for `data`.
	 *
	 * @returns A visual tree representation of the input `data`.
	 */
	private async renderChildData(data: unknown, label: string): Promise<VisualTreeNode> {
		if (typeof data !== "object") {
			// Render primitives and falsy types via their string representation
			const result: ValueNode = {
				label,
				value: `${data}`,
				typeMetadata: typeof data,
				nodeKind: NodeKind.ValueNode,
			};
			return result;
		} else if ((data as IProvideFluidHandle)?.IFluidHandle !== undefined) {
			// If we encounter a Fluid handle, register it for future rendering, and return a node with its ID.
			const handle = data as IFluidHandle;
			const fluidObjectId = await this.registerHandle(handle, label);
			return createHandleNode(fluidObjectId, label);
		} else {
			// Assume any other data must be a record of some kind (since DDS contents must be serializable)
			// and simply recurse over its keys.
			const childEntries = Object.entries(data as Record<string | number | symbol, unknown>);

			const renderedChildren = await Promise.all(
				// eslint-disable-next-line @typescript-eslint/promise-function-async
				childEntries.map(([key, value]) => this.renderChildData(value, key)),
			);

			const result: VisualParentNode = {
				label,
				children: renderedChildren,
				nodeKind: NodeKind.ParentNode,
				typeMetadata: "object",
			};
			return result;
		}
	}

	/**
	 * {@inheritDoc IDisposable.dispose}
	 */
	public dispose(): void {
		if (!this._disposed) {
			this.sharedObject.off("op", this.onOpHandler);
			this._disposed = true;
		}
	}
}

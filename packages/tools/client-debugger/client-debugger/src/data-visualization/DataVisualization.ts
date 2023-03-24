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
 * TODO
 */
export class FluidDataVisualizer {
	/**
	 * TODO
	 */
	private readonly rootData: Record<string, IFluidLoadable>;

	/**
	 * TODO
	 */
	private readonly visualizerSchema: SharedObjectVisualizers;

	// TODO: weak ref + related cleanup
	private readonly visualizerNodes: Map<FluidObjectId, SharedObjectVisualizerNode>;
	private readonly handles: Map<FluidObjectId, IFluidHandle>;

	public constructor(
		rootData: Record<string, IFluidLoadable>,
		visualizerMap: SharedObjectVisualizers,
	) {
		this.rootData = rootData;
		this.visualizerSchema = visualizerMap;

		// TODO: populate with `rootData`, and remove that property (store list of IDs instead?)
		this.visualizerNodes = new Map<FluidObjectId, SharedObjectVisualizerNode>();
		this.handles = new Map<FluidObjectId, IFluidHandle>();
	}
	
	/**
	 * Generates and returns visual descriptions ({@link FluidHandleNode}s) for each of the specified
	 * {@link FluidDataVisualizer.rootData | root shared objects}.
	 */
	public async renderRootHandles(): Promise<FluidHandleNode[]> {
		// Rendering the root entries amounts to initializing visualizer nodes for each of them, and returning
		// a list of handle nodes. Consumers can request data for each of these handles as needed.
		const rootDataEntries = Object.entries(this.rootData);
		return Promise.all(rootDataEntries.map(async ([key, value]) => {
			const fluidObjectId = await this.registerVisualizerForHandle(value.handle, key);
			return createHandleNode(fluidObjectId, key);
		}));
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
	 * TODO
	 */
	(event: "update", listener: (visualTree: FluidObjectNode) => void);
}

/**
 * TODO
 */
export class SharedObjectVisualizerNode extends TypedEventEmitter<SharedObjectListenerEvents> implements IDisposable {
	/**
	 * TODO
	 */
	public readonly sharedObject: ISharedObject;

	/**
	 * Label corresponding to the shared object.
	 *
	 * @remarks Generally, this will be the associated property name, map key, etc.
	 */
	public readonly label: string;

	/**
	 * TODO
	 */
	private readonly visualizeSharedObject: VisualizeSharedObject;

	/**
	 * TODO
	 */
	private readonly registerHandle: (
		handle: IFluidHandle,
		label: string,
	) => Promise<FluidObjectId>;

	/**
	 * TODO
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

	private emitVisualUpdate(): void {
		const visualTree = this.render();
		this.emit("update", visualTree);
	}

	/**
	 * TODO
	 */
	public async render(): Promise<FluidObjectNode> {
		return this.visualizeSharedObject(this.sharedObject, this.label, async (_data, _label) =>
			this.renderData(_data, _label),
		);
	}

	private async renderData(data: unknown, label: string): Promise<VisualTreeNode> {
		if (typeof data !== "object") {
			// Render primitives and falsy types via their string representation
			const result: ValueNode = {
				label,
				value: `${data}`,
				typeMetadata: typeof data,
				nodeType: NodeKind.ValueNode,
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
				childEntries.map(([key, value]) => this.renderData(value, key)),
			);

			const result: VisualParentNode = {
				label,
				children: renderedChildren,
				nodeType: NodeKind.ParentNode,
			};
			return result;
		}
	}
	
	public dispose(): void {
		if (!this._disposed) {
			this.sharedObject.off("op", this.onOpHandler);
			this._disposed = true;
		}
	}
}

function createHandleNode(id: FluidObjectId, label: string): FluidHandleNode {
	return {
		label,
		fluidObjectId: id,
		typeMetadata: "Fluid Handle",
		nodeType: NodeKind.FluidHandleNode,
	}
}
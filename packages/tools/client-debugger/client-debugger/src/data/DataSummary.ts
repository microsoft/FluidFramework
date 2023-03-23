/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEvent } from "@fluidframework/common-definitions";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { SharedCounter } from "@fluidframework/counter";
import { ISharedObject } from "@fluidframework/shared-object-base";

import { FluidObjectNode } from "./VisualTree";

/**
 * Events emitted by {@link SharedObjectListener}.
 */
interface SharedObjectListenerEvents extends IEvent {
	/**
	 * TODO
	 */
	(event: "update", listener: (visualTree: FluidObjectNode) => void);
}

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
 * TODO
 */
export abstract class SharedObjectVisualizer<TFluidObject extends ISharedObject>
	extends TypedEventEmitter<SharedObjectListenerEvents>
{
	/**
	 * TODO
	 */
	protected readonly sharedObject: TFluidObject;

	private readonly onOpHandler = (): boolean => {
		this.emitVisualUpdate();
		return true;
	};

	protected constructor(sharedObject: TFluidObject) {
		super();

		this.sharedObject = sharedObject;

		this.sharedObject.on("op", this.onOpHandler);
	}

	private emitVisualUpdate(): void {
		const visualTree = this.generateVisualTree();
		this.emit("update", visualTree);
	}
	
	/**
	 * TODO
	 */
	protected abstract generateVisualTree(): FluidObjectNode;
}

/**
 * {@link SharedObjectVisualizer} for {@link @fluidframework/counter#SharedCounter}s.
 */
export class SharedCounterVisualizer extends SharedObjectVisualizer<SharedCounter> {
	public constructor(sharedCounter: SharedCounter) {
		super(sharedCounter);
	}
	
	public generateVisualTree(): FluidObjectNode {
		return {
			fluidObjectId: this.sharedObject.id,
		}
	}
}
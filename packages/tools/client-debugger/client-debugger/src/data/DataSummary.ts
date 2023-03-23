/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEvent } from "@fluidframework/common-definitions";
import { TypedEventEmitter } from "@fluidframework/common-utils";
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

export class SharedCounterVisualizer extends SharedObjectVisualizer<SharedCounter> {
	public constructor(sharedCounter: SharedCounter) {
		super(sharedCounter);
	}
	
	public generateVisualTree(): FluidObjectNode {
		return {
			
		}
	}
}
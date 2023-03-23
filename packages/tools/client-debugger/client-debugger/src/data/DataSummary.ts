/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable, IEvent } from "@fluidframework/common-definitions";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { ISharedObject } from "@fluidframework/shared-object-base";
import { FluidObjectNode } from "./VisualTree";


type GenerateVisualTree = (object: ISharedObject) => FluidObjectNode;

/**
 * Events emitted by {@link SharedObjectListener}.
 */
interface SharedObjectListenerEvents extends IEvent {
	/**
	 *
	 */
	(event: "update", listener: (visualTree: FluidObjectNode) => void);
}

// Ideas:
// - Hold onto previous summary and only transmit diff?

class SharedObjectListener
	extends TypedEventEmitter<SharedObjectListenerEvents>
	implements IDisposable
{
	private readonly sharedObject: ISharedObject;
	private readonly generateDebugSummary: GenerateVisualTree;
	private _disposed: boolean;

	private readonly onOpHandler = (): boolean => {
		this.emitDebugSummary();
		return true;
	};

	public constructor(sharedObject: ISharedObject, generateDebugSummary: GenerateVisualTree) {
		super();

		this.sharedObject = sharedObject;
		this.generateDebugSummary = generateDebugSummary;

		this.sharedObject.on("op", this.onOpHandler);

		this._disposed = false;
	}

	public emitDebugSummary(): void {
		const debugSummary = this.generateDebugSummary(this.sharedObject);
		this.emit("update", debugSummary);
	}

	public get disposed(): boolean {
		return this._disposed;
	}

	public dispose(): void {
		this._disposed = true;
		this.sharedObject.off("op", this.onOpHandler);
	}
}

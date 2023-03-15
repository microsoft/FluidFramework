/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable, IEvent } from "@fluidframework/common-definitions";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { ISharedObject } from "@fluidframework/shared-object-base";

/**
 * Unique identifier for the shared object.
 *
 * Point to IChannel.id
 */
interface SharedObjectReference {
	id: string;
}

/**
 * TODO
 */
export interface DataSummary {
	/**
	 * {@inheritDoc SharedObjectId}
	 */
	objectId: SharedObjectReference;

	/**
	 * Summary of the associated shared object, to be provided by the debugger for use by consumers in their views.
	 */
	debugSummary: DebugSummary;
}

interface DebugSummary {
	[key: string | number | symbol]:
		| DebugSummary
		| SharedObjectReference
		| undefined
		// eslint-disable-next-line @rushstack/no-new-null
		| null
		| boolean
		| number
		| string;
}

type GenerateDebugSummary = (object: ISharedObject) => DataSummary;

/**
 * Events emitted by {@link SharedObjectListener}.
 */
interface SharedObjectListenerEvents extends IEvent {
	/**
	 *
	 */
	(event: "update", listener: (debugSummary: DebugSummary) => void);
}

// Ideas:
// - Hold onto previous summary and only transmit diff?

class SharedObjectListener
	extends TypedEventEmitter<SharedObjectListenerEvents>
	implements IDisposable
{
	private readonly sharedObject: ISharedObject;
	private readonly generateDebugSummary: GenerateDebugSummary;
	private _disposed: boolean;

	private readonly onOpHandler = (): boolean => {
		this.emitDebugSummary();
		return true;
	};

	public constructor(sharedObject: ISharedObject, generateDebugSummary: GenerateDebugSummary) {
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

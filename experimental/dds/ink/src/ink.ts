/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IFluidDataStoreRuntime,
	IChannelStorageService,
	IChannelAttributes,
} from "@fluidframework/datastore-definitions";
import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions";
import { readAndParse } from "@fluidframework/driver-utils";
import {
	createSingleBlobSummary,
	IFluidSerializer,
	SharedObject,
} from "@fluidframework/shared-object-base";
import { v4 as uuid } from "uuid";
import { InkFactory } from "./inkFactory";
import {
	IClearOperation,
	ICreateStrokeOperation,
	IInk,
	IInkOperation,
	IInkPoint,
	IInkStroke,
	IPen,
	IStylusOperation,
	IInkEvents,
} from "./interfaces";
import { InkData, ISerializableInk } from "./snapshot";

/**
 * Filename where the snapshot is stored.
 */
const snapshotFileName = "header";

/**
 * {@inheritDoc IInk}
 * @sealed
 * @alpha
 */
export class Ink extends SharedObject<IInkEvents> implements IInk {
	/**
	 * Create a new Ink.
	 * @param runtime - Data Store runtime the new Ink belongs to
	 * @param id - Optional name of the Ink; will be assigned a unique ID if not provided
	 * @returns Newly create Ink object (but not attached yet)
	 */
	public static create(runtime: IFluidDataStoreRuntime, id?: string) {
		return runtime.createChannel(id, InkFactory.Type) as Ink;
	}

	/**
	 * Get a factory for Ink to register with the data store.
	 * @returns A factory that creates and loads Ink
	 */
	public static getFactory() {
		return new InkFactory();
	}

	/**
	 * The current ink snapshot.
	 */
	private inkData: InkData = new InkData();

	/**
	 * Create a new Ink.
	 * @param runtime - The runtime the Ink will be associated with
	 * @param id - Unique ID for the Ink
	 */
	constructor(runtime: IFluidDataStoreRuntime, id: string, attributes: IChannelAttributes) {
		super(id, runtime, attributes, "fluid_ink_");
	}

	/**
	 * {@inheritDoc IInk.createStroke}
	 */
	public createStroke(pen: IPen): IInkStroke {
		const createStrokeOperation: ICreateStrokeOperation = {
			id: uuid(),
			pen,
			time: Date.now(),
			type: "createStroke",
		};
		this.submitLocalMessage(createStrokeOperation, undefined);
		return this.executeCreateStrokeOperation(createStrokeOperation);
	}

	/**
	 * {@inheritDoc IInk.appendPointToStroke}
	 */
	public appendPointToStroke(point: IInkPoint, id: string): IInkStroke {
		const stylusOperation: IStylusOperation = {
			id,
			point,
			type: "stylus",
		};
		this.submitLocalMessage(stylusOperation, undefined);
		return this.executeStylusOperation(stylusOperation);
	}

	/**
	 * {@inheritDoc IInk.clear}
	 */
	public clear(): void {
		const clearOperation: IClearOperation = {
			time: Date.now(),
			type: "clear",
		};
		this.submitLocalMessage(clearOperation, undefined);
		this.executeClearOperation(clearOperation);
	}

	/**
	 * {@inheritDoc IInk.getStrokes}
	 */
	public getStrokes(): IInkStroke[] {
		return this.inkData.getStrokes();
	}

	/**
	 * {@inheritDoc IInk.getStroke}
	 */
	public getStroke(key: string): IInkStroke {
		return this.inkData.getStroke(key);
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.summarizeCore}
	 */
	protected summarizeCore(serializer: IFluidSerializer): ISummaryTreeWithStats {
		const blobContent = JSON.stringify(this.inkData.getSerializable());
		return createSingleBlobSummary(snapshotFileName, blobContent);
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
	 */
	protected async loadCore(storage: IChannelStorageService): Promise<void> {
		const content = await readAndParse<ISerializableInk>(storage, snapshotFileName);
		this.inkData = new InkData(content);
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.processCore}
	 */
	protected processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	): void {
		if (message.type === MessageType.Operation && !local) {
			const operation = message.contents as IInkOperation;
			switch (operation.type) {
				case "clear": {
					this.executeClearOperation(operation);
					break;
				}
				case "createStroke": {
					this.executeCreateStrokeOperation(operation);
					break;
				}
				case "stylus": {
					this.executeStylusOperation(operation);
					break;
				}
				default: {
					break;
				}
			}
		}
	}

	/**
	 * {@inheritDoc @fluidframework/shared-object-base#SharedObject.onDisconnect}
	 */
	protected onDisconnect(): void {
		return;
	}

	/**
	 * Update the model for a clear operation.
	 * @param operation - The operation object
	 */
	private executeClearOperation(operation: IClearOperation): void {
		this.inkData.clear();
		this.emit("clear", operation);
	}

	/**
	 * Update the model for a create stroke operation.
	 * @param operation - The operation object
	 * @returns The stroke that was created
	 */
	private executeCreateStrokeOperation(operation: ICreateStrokeOperation): IInkStroke {
		const stroke: IInkStroke = {
			id: operation.id,
			points: [],
			pen: operation.pen,
		};
		this.inkData.addStroke(stroke);
		this.emit("createStroke", operation);
		return stroke;
	}

	/**
	 * Update the model for a stylus operation.  These represent updates to an existing stroke.
	 * @param operation - The operation object
	 * @returns The stroke that was updated
	 */
	private executeStylusOperation(operation: IStylusOperation): IInkStroke {
		// Need to make sure the stroke is still there (hasn't been cleared) before appending the down/move/up.
		const stroke = this.getStroke(operation.id);
		if (stroke !== undefined) {
			stroke.points.push(operation.point);
			this.emit("stylus", operation);
		}
		return stroke;
	}

	protected applyStashedOp() {
		throw new Error("not implemented");
	}
}

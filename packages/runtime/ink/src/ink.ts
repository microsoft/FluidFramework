/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { fromBase64ToUtf8 } from "@fluidframework/common-utils";
import {
    FileMode,
    ISequencedDocumentMessage,
    ITree,
    MessageType,
    TreeEntry,
} from "@fluidframework/protocol-definitions";
import {
    IComponentRuntime,
    IObjectStorageService,
    IChannelAttributes,
} from "@fluidframework/component-runtime-definitions";
import { SharedObject } from "@fluidframework/shared-object-base";
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
 * Inking data structure.
 * @sealed
 */
export class Ink extends SharedObject<IInkEvents> implements IInk {
    /**
     * Create a new Ink.
     * @param runtime - Component runtime the new Ink belongs to
     * @param id - Optional name of the Ink; will be assigned a unique ID if not provided
     * @returns Newly create Ink object (but not attached yet)
     */
    public static create(runtime: IComponentRuntime, id?: string) {
        return runtime.createChannel(id, InkFactory.Type) as Ink;
    }

    /**
     * Get a factory for Ink to register with the component.
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
    constructor(runtime: IComponentRuntime, id: string, attributes: IChannelAttributes) {
        super(id, runtime, attributes);
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
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.snapshot}
     */
    public snapshot(): ITree {
        const tree: ITree = {
            entries: [
                {
                    mode: FileMode.File,
                    path: snapshotFileName,
                    type: TreeEntry[TreeEntry.Blob],
                    value: {
                        contents: JSON.stringify(this.inkData.getSerializable()),
                        encoding: "utf-8",
                    },
                },
            ],
            // eslint-disable-next-line no-null/no-null
            id: null,
        };

        return tree;
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
     */
    protected async loadCore(
        branchId: string,
        storage: IObjectStorageService,
    ): Promise<void> {
        const header = await storage.read(snapshotFileName);
        if (header !== undefined) {
            this.inkData = new InkData(
                JSON.parse(fromBase64ToUtf8(header)) as ISerializableInk,
            );
        }
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.processCore}
     */
    protected processCore(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown): void {
        if (message.type === MessageType.Operation && !local) {
            const operation = message.contents as IInkOperation;
            if (operation.type === "clear") {
                this.executeClearOperation(operation);
            } else if (operation.type === "createStroke") {
                this.executeCreateStrokeOperation(operation);
            } else if (operation.type === "stylus") {
                this.executeStylusOperation(operation);
            }
        }
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.registerCore}
     */
    protected registerCore(): void {
        return;
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
        this.emit("clear", operation);
        this.inkData.clear();
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
}

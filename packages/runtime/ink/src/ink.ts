/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { fromBase64ToUtf8 } from "@microsoft/fluid-core-utils";
import { FileMode, ISequencedDocumentMessage, ITree, MessageType, TreeEntry } from "@microsoft/fluid-protocol-definitions";
import { IComponentRuntime, IObjectStorageService } from "@microsoft/fluid-runtime-definitions";
import { SharedObject } from "@microsoft/fluid-shared-object-base";
// tslint:disable-next-line:no-submodule-imports
import * as uuid from "uuid/v4";
import { InkFactory } from "./inkFactory";
import {
    IClearOperation,
    ICreateStrokeOperation,
    IInk,
    IInkOperation,
    IInkStroke,
    IPen,
    IPoint,
    IStylusOperation,
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
export class Ink extends SharedObject implements IInk {
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
     * Generate a new create stroke operation.
     * @param pen - Description of the pen used to create the stroke
     * @returns The new create stroke operation
     */
    public static makeCreateStrokeOperation(pen: IPen): ICreateStrokeOperation {
        const id: string = uuid();
        const time: number = new Date().getTime();

        return {
            id,
            pen,
            time,
            type: "createStroke",
        };
    }

    /**
     * Generate a new clear operation.
     * @returns The new clear operation
     */
    public static makeClearOperation(): IClearOperation {
        const time: number = new Date().getTime();

        return {
            time,
            type: "clear",
        };
    }

    /**
     * Generate a new stylus operation.  These represent updates to an existing stroke.  To be valid, the id must
     * match an already-existing stroke.
     * @param point - Location of the stylus
     * @param pressure - The pressure applied
     * @param id - Unique ID of the stroke this operation is associated with
     * @returns The new stylus operation
     */
    public static makeStylusOperation(
        point: IPoint,
        pressure: number,
        id: string,
    ): IStylusOperation {
        const time: number = new Date().getTime();

        return {
            id,
            point,
            pressure,
            time,
            type: "stylus",
        };
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
    constructor(runtime: IComponentRuntime, id: string) {
        super(id, runtime, InkFactory.Attributes);
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
     * {@inheritDoc IInk.submitOperation}
     */
    public submitOperation(operation: IInkOperation): void {
        this.submitLocalMessage(operation);
        this.processOperation(operation);
    }

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.snapshot}
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
            id: null,
        };

        return tree;
    }

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.loadCore}
     */
    protected async loadCore(
        branchId: string,
        storage: IObjectStorageService,
    ): Promise<void> {

        const header = await storage.read(snapshotFileName);
        if (header) {
            this.inkData = new InkData(
                JSON.parse(fromBase64ToUtf8(header)) as ISerializableInk,
            );
        }
    }

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.processCore}
     */
    protected processCore(message: ISequencedDocumentMessage, local: boolean): void {
        if (message.type === MessageType.Operation && !local) {
            this.processOperation(message.contents as IInkOperation);
        }
    }

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.registerCore}
     */
    protected registerCore(): void {
        return;
    }

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.onDisconnect}
     */
    protected onDisconnect(): void {
        return;
    }

    /**
     * Check operation type and route appropriately.
     * @param operation - Operation to process (might be local or remote)
     */
    private processOperation(operation: IInkOperation): void {
        if (operation.type === "clear") {
            this.processClearOp(operation);
        } else if (operation.type === "createStroke") {
            this.processCreateStrokeOp(operation);
        } else if (operation.type === "stylus") {
            this.processStylusOp(operation);
        }
    }

    /**
     * Process a clear operation.
     * @param operation - The operation object
     */
    private processClearOp(operation: IClearOperation): void {
        this.inkData.clear();
    }

    /**
     * Process a create stroke operation.
     * @param operation - The operation object
     */
    private processCreateStrokeOp(operation: ICreateStrokeOperation): void {
        const stroke: IInkStroke = {
            id: operation.id,
            operations: [],
            pen: operation.pen,
        };
        this.inkData.addStroke(stroke);
    }

    /**
     * Process a stylus operation.  These represent updates to an existing stroke.
     * @param operation - The operation object
     */
    private processStylusOp(operation: IStylusOperation): void {
        // Need to make sure the stroke is still there (hasn't been cleared) before appending the down/move/up.
        const stroke = this.getStroke(operation.id);
        if (stroke !== undefined) {
            stroke.operations.push(operation);
        }
    }
}

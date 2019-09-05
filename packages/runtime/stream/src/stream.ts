/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    FileMode,
    ISequencedDocumentMessage,
    ITree,
    MessageType,
    TreeEntry,
} from "@prague/protocol-definitions";
import {
    IComponentRuntime,
    IObjectStorageService,
} from "@prague/runtime-definitions";
import { SharedObject } from "@prague/shared-object-common";
// tslint:disable-next-line:no-submodule-imports
import * as uuid from "uuid/v4";
import {
    IClearOperation,
    ICreateStrokeOperation,
    IInkOperation,
    IInkStroke,
    IPen,
    IPoint,
    IStream,
    IStylusOperation,
} from "./interfaces";
import { IInkSnapshot, InkSnapshot } from "./snapshot";
import { StreamFactory } from "./streamFactory";

/**
 * Filename where the snapshot is stored.
 */
const snapshotFileName = "header";

/**
 * Inking data structure.
 */
export class Stream extends SharedObject implements IStream {
    /**
     * Create a new shared stream
     *
     * @param runtime - component runtime the new shared stream belongs to
     * @param id - optional name of the shared stream
     * @returns newly create shared stream (but not attached yet)
     */
    public static create(runtime: IComponentRuntime, id?: string) {
        return runtime.createChannel(SharedObject.getIdForCreate(id), StreamFactory.Type) as Stream;
    }

    /**
     * Get a factory for SharedStream to register with the component.
     *
     * @returns a factory that creates and load SharedStream
     */
    public static getFactory() {
        return new StreamFactory();
    }

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
     * @param time - Time, in milliseconds, that the operation occurred on the originating device
     */
    public static makeClearOperation(): IClearOperation {
        const time: number = new Date().getTime();

        return {
            time,
            type: "clear",
        };
    }

    /**
     * @param point - Location of the down
     * @param pressure - The ink pressure applied
     * @param id - Unique ID for the stroke
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
    private inkSnapshot: InkSnapshot = new InkSnapshot();

    /**
     * Create a new Stream.
     *
     * @param runtime - The runtime the Stream will attach to
     * @param id - UUID for the stream
     */
    constructor(runtime: IComponentRuntime, id: string) {
        super(id, runtime, StreamFactory.Attributes);
    }

    /**
     * Get the ink strokes from the snapshot.
     */
    public getStrokes(): IInkStroke[] {
        return this.inkSnapshot.getStrokes();
    }

    /**
     * Get a specific stroke from the snapshot.
     *
     * @param key - The UUID for the stroke
     */
    public getStroke(key: string): IInkStroke {
        return this.inkSnapshot.getStroke(key);
    }

    /**
     * Send the op and process it
     * @param operation - op to submit
     */
    public submitOperation(operation: IInkOperation) {
        this.submitLocalMessage(operation);
        this.processOperation(operation);
    }

    /**
     * Get a snapshot of the current content as an ITree.
     */
    public snapshot(): ITree {
        const tree: ITree = {
            entries: [
                {
                    mode: FileMode.File,
                    path: snapshotFileName,
                    type: TreeEntry[TreeEntry.Blob],
                    value: {
                        contents: JSON.stringify(this.inkSnapshot),
                        encoding: "utf-8",
                    },
                },
            ],
            id: null,
        };

        return tree;
    }

    /**
     * Initialize the stream with a snapshot from the given storage.
     *
     * @param branchId - Branch ID. Not used
     * @param storage - Storage service to read from
     */
    protected async loadCore(
        branchId: string,
        storage: IObjectStorageService): Promise<void> {

        const header = await storage.read(snapshotFileName);
        if (header) {
            this.inkSnapshot = new InkSnapshot(
                JSON.parse(Buffer.from(header, "base64").toString("utf-8")) as IInkSnapshot,
            );
        }
    }

    /**
     * Process a delta to the snapshot.
     *
     * @param message - The message containing the delta to process
     * @param local - Whether the message is local
     */
    protected processCore(message: ISequencedDocumentMessage, local: boolean) {
        if (message.type === MessageType.Operation && !local) {
            this.processOperation(message.contents as IInkOperation);
        }
    }

    /**
     * Perform custom processing once an attach has happened.  Nothing for Stream
     */
    protected registerCore() {
        return;
    }

    /**
     * Nothing to do when the object has disconnected from the delta stream
     */
    protected onDisconnect() {
        return;
    }

    /**
     * Check operation type and route appropriately.
     * @param operation - operation to process (might be local or remote)
     */
    private processOperation(operation: IInkOperation) {
        if (operation.type === "clear") {
            this.processClearOp(operation);
        } else if (operation.type === "createStroke") {
            this.processCreateStrokeOp(operation);
        } else if (operation.type === "stylus") {
            this.processStylusOp(operation);
        }
    }

    private processClearOp(operation: IClearOperation) {
        this.inkSnapshot.clear();
    }

    private processCreateStrokeOp(operation: ICreateStrokeOperation) {
        const stroke: IInkStroke = {
            id: operation.id,
            operations: [],
            pen: operation.pen,
        };
        this.inkSnapshot.addStroke(stroke);
    }

    private processStylusOp(operation: IStylusOperation) {
        // Need to make sure the stroke is still there (hasn't been cleared) before appending the down/move/up.
        const stroke = this.getStroke(operation.id);
        if (stroke !== undefined) {
            stroke.operations.push(operation);
        }
    }
}

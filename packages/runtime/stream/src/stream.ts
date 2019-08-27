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
    IInkOperation,
    IInkStroke,
    IPen,
    IPoint,
    IStream,
    IStylusDownOperation,
    IStylusMoveOperation,
    IStylusUpOperation,
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

    public static createNewStroke(id: string = uuid()) {
        const stroke: IInkStroke = {
            id,
            operations: [],
        };

        return stroke;
    }

    /**
     * @param time - Time, in milliseconds, that the operation occurred on the originating device
     */
    public static makeClearOperation(time: number = new Date().getTime()): IClearOperation {
        return {
            time,
            type: "clear",
        };
    }

    /**
     * @param point - Location of the down
     * @param pressure - The ink pressure applied
     * @param pen - Drawing characteristics of the pen
     */
    public static makeDownOperation(
        point: IPoint,
        pressure: number,
        pen: IPen,
    ): IStylusDownOperation {
        const id: string = uuid();
        const time: number = new Date().getTime();

        return {
            id,
            pen,
            point,
            pressure,
            time,
            type: "down",
        };
    }

    /**
     * @param point - Location of the move
     * @param pressure - The ink pressure applied
     * @param id - Unique ID for the stroke
     */
    public static makeMoveOperation(
        point: IPoint,
        pressure: number,
        id: string,
    ): IStylusMoveOperation {
        const time: number = new Date().getTime();

        return {
            id,
            point,
            pressure,
            time,
            type: "move",
        };
    }

    /**
     * @param point - Location of the up
     * @param pressure - The ink pressure applied
     * @param id - Unique ID for the stroke
     */
    public static makeUpOperation(
        point: IPoint,
        pressure: number,
        id: string,
    ): IStylusUpOperation {
        const time: number = new Date().getTime();

        return {
            id,
            point,
            pressure,
            time,
            type: "up",
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

    private processOperation(operation: IInkOperation) {
        if (operation.type === "clear") {
            this.inkSnapshot.clear();
            return;
        }

        if (operation.type === "down") {
            this.inkSnapshot.addStroke(Stream.createNewStroke(operation.id));
        }

        // Need to make sure the stroke is still there (hasn't been cleared) before appending the down/move/up.
        const stroke = this.getStroke(operation.id);
        if (stroke !== undefined) {
            stroke.operations.push(operation);
        }
    }
}

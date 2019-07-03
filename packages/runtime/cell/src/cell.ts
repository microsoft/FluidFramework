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
} from "@prague/container-definitions";
import {
    IComponentRuntime,
    IObjectStorageService,
} from "@prague/runtime-definitions";
import { ISharedObjectExtension, SharedObject } from "@prague/shared-object-common";
import { debug } from "./debug";
import { CellExtension } from "./extension";
import { ISharedCell } from "./interfaces";

/**
 * Description of a cell delta operation
 */
type ICellOperation = ISetCellOperation | IDeleteCellOperation;

interface ISetCellOperation {
    type: "setCell";
    value: ICellValue;
}

interface IDeleteCellOperation {
    type: "deleteCell";
}

enum CellValueType {
    // The value is another shared object
    Shared,

    // The value is a plain JavaScript object
    Plain,
}

interface ICellValue {
    // The type of the value
    type: string;

    // The actual value
    value: any;
}

const snapshotFileName = "header";

/**
 * Implementation of a cell shared object
 */
export class SharedCell extends SharedObject implements ISharedCell {
    /**
     * Create a new shared cell
     *
     * @param runtime - component runtime the new shared map belongs to
     * @param id - optional name of the shared map
     * @returns newly create shared map (but not attached yet)
     */
    public static create(runtime: IComponentRuntime, id?: string) {
        return runtime.createChannel(SharedObject.getIdForCreate(id), CellExtension.Type) as SharedCell;
    }

    /**
     * Get a factory for SharedCell to register with the component.
     *
     * @returns a factory that creates and load SharedCell
     */
    public static getFactory(): ISharedObjectExtension {
        return new CellExtension();
    }
    /**
     * The data held by this cell.
     */
    private data: any;

    /**
     * Tracks the most recent clientSequenceNumber of any pending op, or -1 if there is no pending op.
     */
    private pendingClientSequenceNumber: number;

    /**
     * Constructs a new shared cell. If the object is non-local an id and service interfaces will
     * be provided
     *
     * @param runtime - component runtime the shared map belongs to
     * @param id - optional name of the shared map
     */
    constructor(id: string, runtime: IComponentRuntime) {
        super(id, runtime, CellExtension.Type);
        this.pendingClientSequenceNumber = -1;
    }

    /**
     * {@inheritDoc ISharedCell.get}
     */
    public get() {
        return this.data;
    }

    /**
     * {@inheritDoc ISharedCell.set}
     */
    public set(value: any) {
        let operationValue: ICellValue;
        /* tslint:disable:no-unsafe-any */
        if (SharedObject.is(value)) {
            // Convert any local shared objects to our internal storage format
            if (!this.isLocal()) {
                value.register();
            }

            operationValue = {
                type: CellValueType[CellValueType.Shared],
                value: value.id,
            };
        } else {
            operationValue = {
                type: CellValueType[CellValueType.Plain],
                value,
            };
        }

        const op: ISetCellOperation = {
            type: "setCell",
            value: operationValue,
        };

        this.setCore(value);
        this.submitCellMessage(op);
    }

    /**
     * {@inheritDoc ISharedCell.delete}
     */
    public delete() {
        const op: IDeleteCellOperation = {
            type: "deleteCell",
        };

        this.deleteCore();
        this.submitCellMessage(op);
    }

    /**
     * {@inheritDoc ISharedCell.empty}
     */
    public empty() {
        return this.data === undefined;
    }

    /**
     * Create a snapshot for the cell
     *
     * @returns the snapshot of the current state of the cell
     */
    public snapshot(): ITree {
        // Get a serializable form of data
        let content: ICellValue;
        if (SharedObject.is(this.data)) {
            content = {
                type: CellValueType[CellValueType.Shared],
                value: this.data.id, // (this.data as ISharedObject).id,
            };
        } else {
            content = {
                type: CellValueType[CellValueType.Plain],
                value: this.data,
            };
        }

        // And then construct the tree for it
        const tree: ITree = {
            entries: [
                {
                    mode: FileMode.File,
                    path: snapshotFileName,
                    type: TreeEntry[TreeEntry.Blob],
                    value: {
                        contents: JSON.stringify(content),
                        encoding: "utf-8",
                    },
                },
            ],
            id: null,
        };

        return tree;
    }

    /**
     * Load cell from snapshot
     *
     * @param minimumSequenceNumber - Not used
     * @param headerOrigin - Not used
     * @param storage - the storage to get the snapshot from
     * @returns - promise that resolved when the load is completed
     */
    protected async loadCore(
        minimumSequenceNumber: number,
        headerOrigin: string,
        storage: IObjectStorageService): Promise<void> {

        const rawContent = await storage.read(snapshotFileName);

        // tslint:disable-next-line:strict-boolean-expressions
        const content = rawContent
            ? JSON.parse(Buffer.from(rawContent, "base64")
                .toString("utf-8")) as ICellValue
            : { type: CellValueType[CellValueType.Plain], value: undefined };

        this.data = content.type === CellValueType[CellValueType.Shared]
            ? await this.runtime.getChannel(content.value)
            : content.value;
    }

    /**
     * Initialize a local instance of cell
     */
    protected initializeLocalCore() {
        this.data = undefined;
    }

    /**
     * Process the cell value on register
     */
    protected registerCore() {
        return;
    }

    /**
     * Call back on disconnect
     */
    protected onDisconnect() {
        debug(`Cell ${this.id} is now disconnected`);
    }

    /**
     * Prepare a cell operation
     *
     * @param message - the message to prepare
     * @param local - whether the message was sent by the local client
     * @returns - promise that resolve the value of the prepare, which will be passed as the context of process
     */
    protected async prepareCore(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        if (message.type === MessageType.Operation && !local) {
            const op: ICellOperation = message.contents;
            if (op.type === "setCell") {
                /* tslint:disable:no-return-await */
                return op.value.type === CellValueType[CellValueType.Shared]
                    ? await this.runtime.getChannel(op.value.value)
                    : op.value.value;
            }
        }
    }

    /**
     * Process a cell operation
     *
     * @param message - the message to prepare
     * @param local - whether the message was sent by the local client
     * @param context - the value returned by prepareCore
     */
    protected processCore(message: ISequencedDocumentMessage, local: boolean, context: any) {
        if (this.pendingClientSequenceNumber !== -1) {
            // We are waiting for an ACK on our change to this cell - we will ignore all messages until we get it.
            if (local && message.clientSequenceNumber === this.pendingClientSequenceNumber) {
                // This is the ACK, so clear pending
                this.pendingClientSequenceNumber = -1;
            }
            return;
        }

        if (message.type === MessageType.Operation && !local) {
            const op: ICellOperation = message.contents;

            switch (op.type) {
                case "setCell":
                    this.setCore(context);
                    break;

                case "deleteCell":
                    this.deleteCore();
                    break;

                default:
                    throw new Error("Unknown operation");
            }
        }
    }

    private setCore(value: any) {
        this.data = value;
        this.emit("valueChanged", value);
    }

    private deleteCore() {
        this.data = undefined;
        this.emit("delete");
    }

    private submitCellMessage(op: ICellOperation): void {
        // We might already have a pendingClientSequenceNumber, but it doesn't matter - last one wins.
        this.pendingClientSequenceNumber = this.submitLocalMessage(op);
    }
}

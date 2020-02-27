/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISerializedHandle } from "@microsoft/fluid-component-core-interfaces";
import { fromBase64ToUtf8 } from "@microsoft/fluid-common-utils";
import {
    FileMode,
    ISequencedDocumentMessage,
    ITree,
    MessageType,
    TreeEntry,
} from "@microsoft/fluid-protocol-definitions";
import { IComponentRuntime, IObjectStorageService } from "@microsoft/fluid-runtime-definitions";
import { ISharedObjectFactory, SharedObject, ValueType } from "@microsoft/fluid-shared-object-base";
import { CellFactory } from "./cellFactory";
import { debug } from "./debug";
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
        return runtime.createChannel(id, CellFactory.Type) as SharedCell;
    }

    /**
     * Get a factory for SharedCell to register with the component.
     *
     * @returns a factory that creates and load SharedCell
     */
    public static getFactory(): ISharedObjectFactory {
        return new CellFactory();
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
        super(id, runtime, CellFactory.Attributes);
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
        if (SharedObject.is(value)) {
            throw new Error("SharedObject sets are no longer supported. Instead set the SharedObject handle.");
        }

        const operationValue: ICellValue = {
            type: ValueType[ValueType.Plain],
            value: this.toSerializable(value),
        };

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
        const content: ICellValue = {
            type: ValueType[ValueType.Plain],
            value: this.toSerializable(this.data),
        };

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
            // eslint-disable-next-line no-null/no-null
            id: null,
        };

        return tree;
    }

    /**
     * Load cell from snapshot
     *
     * @param branchId - Not used
     * @param storage - the storage to get the snapshot from
     * @returns - promise that resolved when the load is completed
     */
    protected async loadCore(
        branchId: string,
        storage: IObjectStorageService): Promise<void> {

        const rawContent = await storage.read(snapshotFileName);

        // tslint:disable-next-line:strict-boolean-expressions
        const content = rawContent
            ? JSON.parse(fromBase64ToUtf8(rawContent)) as ICellValue
            : { type: ValueType[ValueType.Plain], value: undefined };

        this.data = this.fromSerializable(content);
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
        if (SharedObject.is(this.data)) {
            this.data.register();
        }
    }

    /**
     * Call back on disconnect
     */
    protected onDisconnect() {
        debug(`Cell ${this.id} is now disconnected`);
    }

    /**
     * Process a cell operation
     *
     * @param message - the message to prepare
     * @param local - whether the message was sent by the local client
     */
    protected processCore(message: ISequencedDocumentMessage, local: boolean) {
        if (this.pendingClientSequenceNumber !== -1) {
            // We are waiting for an ACK on our change to this cell - we will ignore all messages until we get it.
            if (local && message.clientSequenceNumber === this.pendingClientSequenceNumber) {
                // This is the ACK, so clear pending
                this.pendingClientSequenceNumber = -1;
            }
            return;
        }

        if (message.type === MessageType.Operation && !local) {
            const op = message.contents as ICellOperation;

            switch (op.type) {
                case "setCell":
                    const value = this.fromSerializable(op.value);
                    this.setCore(value);
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

    private toSerializable(value: any) {
        if (value === undefined) {
            return value;
        }

        // Stringify to convert to the serialized handle values - and then parse in order to create
        // a POJO for the op
        const stringified = this.runtime.IComponentSerializer.stringify(
            value,
            this.runtime.IComponentHandleContext,
            this.handle);
        return JSON.parse(stringified);
    }

    private fromSerializable(operation: ICellValue) {
        let value = operation.value;

        // Convert any stored shared object to updated handle
        if (operation.type === ValueType[ValueType.Shared]) {
            const handle: ISerializedHandle = {
                type: "__fluid_handle__",
                url: operation.value as string,
            };
            value = handle;
        }

        return value !== undefined
            ? this.runtime.IComponentSerializer.parse(JSON.stringify(value), this.runtime.IComponentHandleContext)
            : value;
    }
}

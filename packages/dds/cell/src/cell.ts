/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ISerializedHandle } from "@fluidframework/core-interfaces";
import { fromBase64ToUtf8 } from "@fluidframework/common-utils";
import {
    FileMode,
    ISequencedDocumentMessage,
    ITree,
    MessageType,
    TreeEntry,
} from "@fluidframework/protocol-definitions";
import {
    IChannelAttributes,
    IFluidDataStoreRuntime,
    IChannelStorageService,
    IChannelFactory,
    Serializable,
} from "@fluidframework/datastore-definitions";
import { SharedObject, ValueType } from "@fluidframework/shared-object-base";
import { CellFactory } from "./cellFactory";
import { debug } from "./debug";
import { ISharedCell, ISharedCellEvents } from "./interfaces";

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
export class SharedCell<T extends Serializable = any> extends SharedObject<ISharedCellEvents<T>>
    implements ISharedCell<T> {
    /**
     * Create a new shared cell
     *
     * @param runtime - data store runtime the new shared map belongs to
     * @param id - optional name of the shared map
     * @returns newly create shared map (but not attached yet)
     */
    public static create(runtime: IFluidDataStoreRuntime, id?: string) {
        return runtime.createChannel(id, CellFactory.Type) as SharedCell;
    }

    /**
     * Get a factory for SharedCell to register with the data store.
     *
     * @returns a factory that creates and load SharedCell
     */
    public static getFactory(): IChannelFactory {
        return new CellFactory();
    }
    /**
     * The data held by this cell.
     */
    private data: T | undefined;

    /**
     * This is used to assign a unique id to outgoing messages. It is used to track messages until
     * they are ack'd.
     */
    private messageId: number = -1;

    /**
     * This keeps track of the messageId of messages that have been ack'd. It is updated every time
     * we a message is ack'd with it's messageId.
     */
    private messageIdObserved: number = -1;

    /**
     * Constructs a new shared cell. If the object is non-local an id and service interfaces will
     * be provided
     *
     * @param runtime - data store runtime the shared map belongs to
     * @param id - optional name of the shared map
     */
    constructor(id: string, runtime: IFluidDataStoreRuntime, attributes: IChannelAttributes) {
        super(id, runtime, attributes);
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
    public set(value: T) {
        if (SharedObject.is(value)) {
            throw new Error("SharedObject sets are no longer supported. Instead set the SharedObject handle.");
        }

        // Serialize the value if required.
        const operationValue: ICellValue = {
            type: ValueType[ValueType.Plain],
            value: this.toSerializable(value),
        };

        // Set the value locally.
        this.setCore(value);

        // If we are not attached, don't submit the op.
        if (!this.isAttached()) {
            return;
        }

        const op: ISetCellOperation = {
            type: "setCell",
            value: operationValue,
        };
        this.submitLocalMessage(op, ++this.messageId);
    }

    /**
     * {@inheritDoc ISharedCell.delete}
     */
    public delete() {
        // Delete the value locally.
        this.deleteCore();

        // If we are not attached, don't submit the op.
        if (!this.isAttached()) {
            return;
        }

        const op: IDeleteCellOperation = {
            type: "deleteCell",
        };
        this.submitLocalMessage(op, ++this.messageId);
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
                    type: TreeEntry.Blob,
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
        branchId: string | undefined,
        storage: IChannelStorageService): Promise<void> {
        const rawContent = await storage.read(snapshotFileName);

        const content = rawContent !== undefined
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
            this.data.bindToContext();
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
     * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
     * For messages from a remote client, this will be undefined.
     */
    protected processCore(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) {
        if (this.messageId !== this.messageIdObserved) {
            // We are waiting for an ACK on our change to this cell - we will ignore all messages until we get it.
            if (local) {
                const messageIdReceived = localOpMetadata as number;
                assert(messageIdReceived !== undefined && messageIdReceived <= this.messageId,
                    "messageId is incorrect from from the local client's ACK");

                // We got an ACK. Update messageIdObserved.
                this.messageIdObserved = localOpMetadata as number;
            }
            return;
        }

        if (message.type === MessageType.Operation && !local) {
            const op = message.contents as ICellOperation;

            switch (op.type) {
                case "setCell":
                    this.setCore(this.fromSerializable(op.value));
                    break;

                case "deleteCell":
                    this.deleteCore();
                    break;

                default:
                    throw new Error("Unknown operation");
            }
        }
    }

    private setCore(value: T) {
        this.data = value;
        this.emit("valueChanged", value);
    }

    private deleteCore() {
        this.data = undefined;
        this.emit("delete");
    }

    private toSerializable(value: T | undefined) {
        if (value === undefined) {
            return value;
        }

        // Stringify to convert to the serialized handle values - and then parse in order to create
        // a POJO for the op
        const stringified = this.runtime.IFluidSerializer.stringify(
            value,
            this.runtime.IFluidHandleContext,
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
            ? this.runtime.IFluidSerializer.parse(JSON.stringify(value), this.runtime.IFluidHandleContext)
            : value;
    }
}

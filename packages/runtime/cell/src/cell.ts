/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISerializedHandle } from "@fluidframework/component-core-interfaces";
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
    IComponentRuntime,
    IObjectStorageService,
} from "@fluidframework/component-runtime-definitions";
import { strongAssert } from "@fluidframework/runtime-utils";
import { ISharedObjectFactory, SharedObject, ValueType } from "@fluidframework/shared-object-base";
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
export class SharedCell extends SharedObject<ISharedCellEvents> implements ISharedCell {
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

    private messageId: number = -1;
    private messageIdObserved: number = -1;

    /**
     * Constructs a new shared cell. If the object is non-local an id and service interfaces will
     * be provided
     *
     * @param runtime - component runtime the shared map belongs to
     * @param id - optional name of the shared map
     */
    constructor(id: string, runtime: IComponentRuntime, attributes: IChannelAttributes) {
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
    public set(value: any) {
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

        // If we are in local state, don't submit the op.
        if (this.isLocal()) {
            return;
        }

        const op: ISetCellOperation = {
            type: "setCell",
            value: operationValue,
        };
        this.submitCellMessage(op);
    }

    /**
     * {@inheritDoc ISharedCell.delete}
     */
    public delete() {
        // Delete the value locally.
        this.deleteCore();

        // If we are in local state, don't submit the op.
        if (this.isLocal()) {
            return;
        }

        const op: IDeleteCellOperation = {
            type: "deleteCell",
        };
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
     * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
     * For messages from a remote client, this will be undefined.
     */
    protected processCore(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) {
        if (this.messageId !== this.messageIdObserved) {
            // We are waiting for an ACK on our change to this cell - we will ignore all messages until we get it.
            if (local) {
                const messageIdReceived = localOpMetadata as number;
                strongAssert(messageIdReceived !== undefined && messageIdReceived <= this.messageId,
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

    private setCore(value: any) {
        this.data = value;
        this.emit("valueChanged", value);
    }

    private deleteCore() {
        this.data = undefined;
        this.emit("delete");
    }

    private submitCellMessage(op: ICellOperation): void {
        this.submitLocalMessage(op, ++this.messageId);
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

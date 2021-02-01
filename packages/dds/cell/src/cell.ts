/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert , bufferToString } from "@fluidframework/common-utils";
import { IFluidSerializer, ISerializedHandle } from "@fluidframework/core-interfaces";

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
 * The SharedCell distributed data structure can be used to store a single serializable value.
 *
 * @remarks
 * ### Creation
 *
 * To create a `SharedCell`, call the static create method:
 *
 * ```typescript
 * const myCell = SharedCell.create(this.runtime, id);
 * ```
 *
 * ### Usage
 *
 * The value stored in the cell can be set with the `.set()` method and retrieved with the `.get()` method:
 *
 * ```typescript
 * myCell.set(3);
 * console.log(myCell.get()); // 3
 * ```
 *
 * The value must only be plain JS objects or `SharedObject` handles (e.g. to another DDS or Fluid object).
 * In collaborative scenarios, the value is settled with a policy of _last write wins_.
 *
 * The `.delete()` method will delete the stored value from the cell:
 *
 * ```typescript
 * myCell.delete();
 * console.log(myCell.get()); // undefined
 * ```
 *
 * The `.empty()` method will check if the value is undefined.
 *
 * ```typescript
 * if (myCell.empty()) {
 *   // myCell.get() will return undefined
 * } else {
 *   // myCell.get() will return a non-undefined value
 * }
 * ```
 *
 * ### Eventing
 *
 * `SharedCell` is an `EventEmitter`, and will emit events when other clients make modifications. You should
 * register for these events and respond appropriately as the data is modified. `valueChanged` will be emitted
 * in response to a `set`, and `delete` will be emitted in response to a `delete`.
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
            value: this.toSerializable(value, this.serializer),
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
    protected snapshotCore(serializer: IFluidSerializer): ITree {
        // Get a serializable form of data
        const content: ICellValue = {
            type: ValueType[ValueType.Plain],
            value: this.toSerializable(this.data, serializer),
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
        };

        return tree;
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
     */
    protected async loadCore(storage: IChannelStorageService): Promise<void> {
        const blob = await storage.readBlob(snapshotFileName);
        const rawContent = bufferToString(blob, "utf8");

        const content = rawContent !== undefined
            ? JSON.parse(rawContent) as ICellValue
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

    private toSerializable(value: T | undefined, serializer: IFluidSerializer) {
        if (value === undefined) {
            return value;
        }

        // Stringify to convert to the serialized handle values - and then parse in order to create
        // a POJO for the op
        const stringified = serializer.stringify(value, this.handle);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
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

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return value !== undefined
            ? this.serializer.parse(JSON.stringify(value))
            : value;
    }
}

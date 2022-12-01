/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import {
    IChannelAttributes,
    IFluidDataStoreRuntime,
    IChannelStorageService,
    IChannelFactory,
    Serializable,
} from "@fluidframework/datastore-definitions";
import { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions";
import { readAndParse } from "@fluidframework/driver-utils";
import { createSingleBlobSummary, IFluidSerializer, SharedObject } from "@fluidframework/shared-object-base";
import { CellFactory } from "./cellFactory";
import {
    ISharedCell,
    ISharedCellEvents,
    ICellLocalOpMetadata,
} from "./interfaces";

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
    // The actual value contained in the cell which needs to be wrapped to handle undefined
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
export class SharedCell<T = any> extends SharedObject<ISharedCellEvents<T>>
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
    private data: Serializable<T> | undefined;

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

    private readonly pendingMessageIds: number[] = [];

    /**
     * Constructs a new shared cell. If the object is non-local an id and service interfaces will
     * be provided
     *
     * @param runtime - data store runtime the shared map belongs to
     * @param id - optional name of the shared map
     */
    constructor(id: string, runtime: IFluidDataStoreRuntime, attributes: IChannelAttributes) {
        super(id, runtime, attributes, "fluid_cell_");
    }

    /**
     * {@inheritDoc ISharedCell.get}
     */
    public get(): Serializable<T> | undefined {
        return this.data;
    }

    /**
     * {@inheritDoc ISharedCell.set}
     */
    public set(value: Serializable<T>) {
        // Serialize the value if required.
        const operationValue: ICellValue = {
            value: this.serializer.encode(value, this.handle),
        };

        // Set the value locally.
        const previousValue = this.setCore(value);

        // If we are not attached, don't submit the op.
        if (!this.isAttached()) {
            return;
        }

        const op: ISetCellOperation = {
            type: "setCell",
            value: operationValue,
        };
        this.submitCellMessage(op, previousValue);
    }

    /**
     * {@inheritDoc ISharedCell.delete}
     */
    public delete() {
        // Delete the value locally.
        const previousValue = this.deleteCore();

        // If we are not attached, don't submit the op.
        if (!this.isAttached()) {
            return;
        }

        const op: IDeleteCellOperation = {
            type: "deleteCell",
        };
        this.submitCellMessage(op, previousValue);
    }

    /**
     * {@inheritDoc ISharedCell.empty}
     */
    public empty() {
        return this.data === undefined;
    }

    /**
     * Create a summary for the cell
     *
     * @returns the summary of the current state of the cell
     */
    protected summarizeCore(serializer: IFluidSerializer): ISummaryTreeWithStats {
        const content: ICellValue = { value: this.data };
        return createSingleBlobSummary(snapshotFileName, serializer.stringify(content, this.handle));
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
     */
    protected async loadCore(storage: IChannelStorageService): Promise<void> {
        const content = await readAndParse<ICellValue>(storage, snapshotFileName);

        this.data = this.decode(content);
    }

    /**
     * Initialize a local instance of cell
     */
    protected initializeLocalCore() {
        this.data = undefined;
    }

    /**
     * Call back on disconnect
     */
    protected onDisconnect() { }

    /**
     * Apply inner op
     * @param content - ICellOperation content
     */
    private applyInnerOp(content: ICellOperation) {
        switch (content.type) {
            case "setCell":
                return this.setCore(this.decode(content.value));

            case "deleteCell":
                return this.deleteCore();

            default:
                throw new Error("Unknown operation");
        }
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
        const cellOpMetadata = localOpMetadata as ICellLocalOpMetadata;
        if (this.messageId !== this.messageIdObserved) {
            // We are waiting for an ACK on our change to this cell - we will ignore all messages until we get it.
            if (local) {
                const messageIdReceived = cellOpMetadata.pendingMessageId;
                assert(messageIdReceived !== undefined && messageIdReceived <= this.messageId,
                    0x00c /* "messageId is incorrect from from the local client's ACK" */);
                assert(this.pendingMessageIds !== undefined &&
                    this.pendingMessageIds[0] === cellOpMetadata.pendingMessageId,
                    "Unexpected pending message received");
                this.pendingMessageIds.shift();
                // We got an ACK. Update messageIdObserved.
                this.messageIdObserved = cellOpMetadata.pendingMessageId;
            }
            return;
        }

        if (message.type === MessageType.Operation && !local) {
            const op = message.contents as ICellOperation;
            this.applyInnerOp(op);
        }
    }

    private setCore(value: Serializable<T>): Serializable<T> | undefined {
        const previousLocalValue = this.get();
        this.data = value;
        this.emit("valueChanged", value);
        return previousLocalValue;
    }

    private deleteCore(): Serializable<T> | undefined {
        const previousLocalValue = this.get();
        this.data = undefined;
        this.emit("delete");
        return previousLocalValue;
    }

    private decode(cellValue: ICellValue) {
        const value = cellValue.value;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this.serializer.decode(value);
    }

    private createLocalOpMetadata(op: ICellOperation, previousValue?: Serializable<T>): ICellLocalOpMetadata {
        const pendingMessageId = ++this.messageId;
        this.pendingMessageIds.push(pendingMessageId);
        const localMetadata: ICellLocalOpMetadata = {
            pendingMessageId, previousValue,
        };
        return localMetadata;
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObjectCore.applyStashedOp}
     * @internal
     */
    protected applyStashedOp(content: unknown): unknown {
        const cellContent = content as ICellOperation;
        const previousValue = this.applyInnerOp(cellContent);
        return this.createLocalOpMetadata(cellContent, previousValue);
    }

    /**
     * Rollback a local op
     * @param content - The operation to rollback
     * @param localOpMetadata - The local metadata associated with the op.
     */
    protected rollback(content: any, localOpMetadata: unknown) {
        const cellOpMetadata = localOpMetadata as ICellLocalOpMetadata;
        if (content.type === "setCell" || content.type === "deleteCell") {
            if (cellOpMetadata.previousValue === undefined) {
                this.deleteCore();
            } else {
                this.setCore(cellOpMetadata.previousValue);
            }

            const lastPendingMessageId = this.pendingMessageIds.pop();
            if (lastPendingMessageId !== cellOpMetadata.pendingMessageId) {
                throw new Error("Rollback op does not match last pending");
            }
        } else {
            throw new Error("Unsupported op for rollback");
        }
    }

     /**
     * Submit a cell message to remote clients.
     * @param op - The cell message
     * @param previousValue - The value of the cell before this op
     */
    private submitCellMessage(op: ICellOperation, previousValue?: any): void {
        const localMetadata = this.createLocalOpMetadata(op, previousValue);
        this.submitLocalMessage(op, localMetadata);
    }
}

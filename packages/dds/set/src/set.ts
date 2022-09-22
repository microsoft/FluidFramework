/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    ISequencedDocumentMessage,
    MessageType,
} from "@fluidframework/protocol-definitions";
import {
    IChannelAttributes,
    IFluidDataStoreRuntime,
    IChannelStorageService,
    IChannelFactory,
} from "@fluidframework/datastore-definitions";
import { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions";
import { readAndParse } from "@fluidframework/driver-utils";
import {
    createSingleBlobSummary,
    IFluidSerializer,
    SharedObject,
} from "@fluidframework/shared-object-base";
import { SetFactory } from "./setFactory";
import { ISharedSet, ISharedSetEvents } from "./interfaces";

/**
 * Description of a set delta operation
 */
type ISetOperation = ISetSetOperation | IDeleteSetOperation;
type isDeleted = boolean;

interface ISetSetOperation {
    type: "setSet";
    value: ISetValue;
}

interface IDeleteSetOperation {
    type: "deleteSet";
}

interface ISetValue {
    // The actual value contained in the set which needs to be wrapped to handle undefined
    value: any;
}

const snapshotFileName = "header";

/**
 * The SharedSet distributed data structure can be used to store a single serializable value.
 *
 * @remarks
 * ### Creation
 *
 * To create a `SharedSet`, call the static create method:
 *
 * ```typescript
 * const mySet = SharedSet.create(this.runtime, id);
 * ```
 *
 * ### Usage
 *
 * The value stored in the set can be set with the `.set()` method and retrieved with the `.get()` method:
 *
 * ```typescript
 * mySet.set(3);
 * console.log(mySet.get()); // 3
 * ```
 *
 * The value must only be plain JS objects or `SharedObject` handles (e.g. to another DDS or Fluid object).
 * In collaborative scenarios, the value is settled with a policy of _last write wins_.
 *
 * The `.delete()` method will delete the stored value from the set:
 *
 * ```typescript
 * mySet.delete();
 * console.log(mySet.get()); // undefined
 * ```
 *
 * The `.empty()` method will check if the value is undefined.
 *
 * ```typescript
 * if (mySet.empty()) {
 *   // mySet.get() will return undefined
 * } else {
 *   // mySet.get() will return a non-undefined value
 * }
 * ```
 *
 * ### Eventing
 *
 * `SharedSet` is an `EventEmitter`, and will emit events when other clients make modifications. You should
 * register for these events and respond appropriately as the data is modified. `valueChanged` will be emitted
 * in response to a `set`, and `delete` will be emitted in response to a `delete`.
 */
export class SharedSet<T = any>
    extends SharedObject<ISharedSetEvents<T>>
    implements ISharedSet<T> {
    /**
     * Create a new shared set
     *
     * @param runtime - data store runtime the new shared map belongs to
     * @param id - optional name of the shared map
     * @returns newly create shared map (but not attached yet)
     */
    public static create(runtime: IFluidDataStoreRuntime, id?: string) {
        return runtime.createChannel(id, SetFactory.Type) as SharedSet;
    }

    /**
     * Get a factory for SharedSet to register with the data store.
     *
     * @returns a factory that creates and load SharedSet
     */
    public static getFactory(): IChannelFactory {
        return new SetFactory();
    }
    /**
     * The data held by this set.
     */
    private data: Map<string, isDeleted> = new Map<string, isDeleted>();

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
     * Constructs a new shared set. If the object is non-local an id and service interfaces will
     * be provided
     *
     * @param runtime - data store runtime the shared map belongs to
     * @param id - optional name of the shared map
     */
    constructor(
        id: string,
        runtime: IFluidDataStoreRuntime,
        attributes: IChannelAttributes,
    ) {
        super(id, runtime, attributes, "fluid_set_");
    }

    private hash(value: T) {
        return JSON.stringify(value);
    }

    /**
     * {@inheritDoc ISharedSet.get}
     */
    public get(): Map<string, boolean> {
        return this.data;
    }

    /**
     * Check if a key exists in the map.
     * @param key - The key to check
     * @returns True if the key exists, false otherwise
     */
    public has(value: T): boolean {
        return this.data.has(this.hash(value));
    }

    /**
     * {@inheritDoc ISharedSet.add}
     */
    public add(value: T) {
        // Serialize the value if required.
        const operationValue: ISetValue = {
            value: this.serializer.encode(value, this.handle),
        };

        // Set the value locally.
        this.setCore(this.hash(value));
        console.log(this.data);

        // If we are not attached, don't submit the op.
        if (!this.isAttached()) {
            return;
        }

        const op: ISetSetOperation = {
            type: "setSet",
            value: operationValue,
        };
        this.submitLocalMessage(op, ++this.messageId);
    }

    /**
     * {@inheritDoc ISharedSet.delete}
     */
    public delete() {
        // Delete the value locally.
        this.deleteCore();

        // If we are not attached, don't submit the op.
        if (!this.isAttached()) {
            return;
        }

        const op: IDeleteSetOperation = {
            type: "deleteSet",
        };
        this.submitLocalMessage(op, ++this.messageId);
    }

    /**
     * {@inheritDoc ISharedSet.empty}
     */
    public empty() {
        return this.data === undefined;
    }

    /**
     * Create a summary for the set
     *
     * @returns the summary of the current state of the set
     */
    protected summarizeCore(
        serializer: IFluidSerializer,
    ): ISummaryTreeWithStats {
        const content: ISetValue = { value: this.data };
        return createSingleBlobSummary(
            snapshotFileName,
            serializer.stringify(content, this.handle),
        );
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
     */
    protected async loadCore(storage: IChannelStorageService): Promise<void> {
        const content = await readAndParse<ISetValue>(
            storage,
            snapshotFileName,
        );

        this.data = this.decode(content);
    }

    /**
     * Initialize a local instance of set
     */
    protected initializeLocalCore() {
        this.data = new Map<string, boolean>();
    }

    /**
     * Call back on disconnect
     */
    protected onDisconnect() {}

    /**
     * Apply inner op
     * @param content - ISetOperation content
     */
    private applyInnerOp(content: ISetOperation) {
        switch (content.type) {
            case "setSet":
                this.setCore(this.decode(content.value));
                break;

            case "deleteSet":
                this.deleteCore();
                break;

            default:
                throw new Error("Unknown operation");
        }
    }

    /**
     * Process a set operation
     *
     * @param message - the message to prepare
     * @param local - whether the message was sent by the local client
     * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
     * For messages from a remote client, this will be undefined.
     */
    protected processCore(
        message: ISequencedDocumentMessage,
        local: boolean,
        localOpMetadata: unknown,
    ) {
        if (this.messageId !== this.messageIdObserved) {
            // We are waiting for an ACK on our change to this set - we will ignore all messages until we get it.
            if (local) {
                const messageIdReceived = localOpMetadata as number;
                assert(
                    messageIdReceived !== undefined &&
                        messageIdReceived <= this.messageId,
                    0x00c, /* "messageId is incorrect from from the local client's ACK" */
                );

                // We got an ACK. Update messageIdObserved.
                this.messageIdObserved = localOpMetadata as number;
            }
            return;
        }

        if (message.type === MessageType.Operation && !local) {
            const op = message.contents as ISetOperation;
            this.applyInnerOp(op);
        }
    }

    private setCore(key: string, isDeleted: boolean = false) {
        this.data[key] = isDeleted;
        this.emit("valueChanged", key);
    }

    private deleteCore() {
        this.data = new Map<string, isDeleted>();
        this.emit("delete");
    }

    private decode(setValue: ISetValue) {
        const value = setValue.value;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this.serializer.decode(value);
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObjectCore.applyStashedOp}
     * @internal
     */
    protected applyStashedOp(content: unknown): unknown {
        const setContent = content as ISetOperation;
        this.applyInnerOp(setContent);
        ++this.messageId;
        return this.messageId;
    }
}

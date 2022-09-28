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
type ISetOperation = IAddOperation | IDeleteOperation | IClearOperation;
interface IAddOperation {
    type: "add";
    value: ISetValue;
}

interface IDeleteOperation {
    type: "delete";
    value: ISetValue;
}

interface IClearOperation {
    type: "clear";
}
// The actual value contained in the set which needs to be wrapped to handle undefined
type ISetValue = any;

const snapshotFileName = "header";

/**
 * The SharedSet distributed data structure can be used to store a Set.
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
 * console.log(mySet.has(3)); // false
 * mySet.add(3);
 * console.log(mySet.has(3)); // true
 * ```
 *
 * The value must only be plain JS objects or `SharedObject` handles (e.g. to another DDS or Fluid object).
 * In collaborative scenarios, the value is settled with a policy of _last write wins_.
 *
 * The `.delete()` method will delete the stored value from the set:
 *
 * ```typescript
 * console.log(mySet.has(3)); // true
 * mySet.delete(3);
 * console.log(mySet.get(3)); // false
 * ```
 *
 * The `.empty()` method will check if the Set has no elements inside of it.
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
 * in response to a `add`, and `delete` will be emitted in response to a `delete`.
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
    private readonly set: Set<T> = new Set<T>();

    /**
     * The deleted data is held in this set.
     */
    private readonly tombStoneSet: Set<T> = new Set<T>();

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

    /**
     * {@inheritDoc ISharedSet.get}
     */
    public get(): Set<T> {
        return this.set;
    }

    /**
     * Check if a key exists in the map.
     * @param key - The key to check
     * @returns True if the key exists, false otherwise
     */
    public has(value: T): boolean {
        return this.set.has(value) && !this.tombStoneSet.has(value);
    }

    /**
     * {@inheritDoc ISharedSet.add}
     */
    public add(value: T) {
        // Serialize the value if required.
        const operationValue: ISetValue = this.serializer.encode(
            value,
            this.handle,
        );

        // Set the value locally.
        this.set.add(value);
        this.emit("valueChanged", value);

        // If we are not attached, don't submit the op.
        if (!this.isAttached()) {
            return;
        }

        const op: IAddOperation = {
            type: "add",
            value: operationValue,
        };
        this.submitLocalMessage(op, ++this.messageId);
    }

    /**
     * {@inheritDoc ISharedSet.delete}
     */
    public delete(value: T) {
        // Delete the value locally. which means adding it to the tombStoneSet
        if (this.has(value)) {
            this.tombStoneSet.add(value);
        }

        // Serialize the value if required.
        const operationValue: ISetValue = this.serializer.encode(
            value,
            this.handle,
        );

        this.emit("delete");

        // If we are not attached, don't submit the op.
        if (!this.isAttached()) {
            return;
        }

        const op: IDeleteOperation = {
            type: "delete",
            value: operationValue,
        };
        this.submitLocalMessage(op, ++this.messageId);
    }

    /**
     * {@inheritDoc ISharedSet.empty}
     */
    public empty() {
        return this.set.size === 0;
    }

    /**
     * {@inheritDoc ISharedSet.clear}
     */
    public clear() {
        this.set.clear();

        this.emit("clear");

        // If we are not attached, don't submit the op.
        if (!this.isAttached()) {
            return;
        }

        const op: IClearOperation = {
            type: "clear",
        };
        this.submitLocalMessage(op, ++this.messageId);
    }

    /**
     * Create a summary for the set
     *
     * @returns the summary of the current state of the set
     */
    protected summarizeCore(
        serializer: IFluidSerializer,
    ): ISummaryTreeWithStats {
        const content = [...this.set.entries()];

        return createSingleBlobSummary(
            snapshotFileName,
            serializer.stringify(content, this.handle),
        );
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
     */
    protected async loadCore(storage: IChannelStorageService): Promise<void> {
        const content = await readAndParse<any[]>(storage, snapshotFileName);

        this.set.clear();
        content.forEach((element) => {
            this.set.add(element);
        });
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
            case "add":
                this.add(this.decode(content.value));
                break;

            case "delete":
                this.delete(this.decode(content.value));
                break;

            case "clear":
                this.clear();
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

    private decode(value: ISetValue) {
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

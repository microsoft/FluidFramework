/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import {
    IFluidDataStoreRuntime,
    IChannelStorageService,
    IChannelFactory,
    IChannelAttributes,
} from "@fluidframework/datastore-definitions";
import { readAndParse } from "@fluidframework/driver-utils";
import { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions";
import { createSingleBlobSummary, IFluidSerializer, SharedObject } from "@fluidframework/shared-object-base";
import { CounterFactory } from "./counterFactory";
import { ISharedCounter, ISharedCounterEvents } from "./interfaces";

/**
 * Describes the operation (op) format for incrementing the counter.
 */
interface IIncrementOperation {
    type: "increment";
    incrementAmount: number;
}

/**
 * Used in snapshotting.
 */
interface ICounterSnapshotFormat {
    /**
     * The value of the counter.
     */
    value: number;
}

const snapshotFileName = "header";

/**
 * A shared object that holds a number that can be incremented or decremented.
 *
 * @remarks
 * ### Creation
 *
 * To create a `SharedCounter`, get the factory and call create with a runtime and string ID:
 *
 * ```typescript
 * const factory = SharedCounter.getFactory();
 * const counter = factory.create(this.runtime, id) as SharedCounter;
 * ```
 *
 * The initial value of a new `SharedCounter` is 0.
 * If you wish to initialize the counter to a different value, you may call {@link ISharedCounter.increment} before
 * attaching the Container, or before inserting it into an existing shared object.
 *
 * ### Usage
 *
 * Once created, you can call `increment` to modify the value with either a positive or negative number:
 *
 * ```typescript
 * counter.increment(10); // add 10 to the counter value
 * counter.increment(-5); // subtract 5 from the counter value
 * ```
 *
 * To observe changes to the value (including those from remote clients), register for the `"incremented"` event:
 *
 * ```typescript
 * counter.on("incremented", (incrementAmount, newValue) => {
 *     console.log(`The counter incremented by ${incrementAmount} and now has a value of ${newValue}`);
 * });
 * ```
 *
 * Note that SharedCounter only operates on integer values. This is validated at runtime.
 *
 * @public
 */
export class SharedCounter extends SharedObject<ISharedCounterEvents> implements ISharedCounter {
    /**
     * Create a new shared counter
     *
     * @param runtime - data store runtime the new shared counter belongs to
     * @param id - optional name of the shared counter
     * @returns newly create shared counter (but not attached yet)
     */
    public static create(runtime: IFluidDataStoreRuntime, id?: string): SharedCounter {
        return runtime.createChannel(id, CounterFactory.Type) as SharedCounter;
    }

    constructor(id: string, runtime: IFluidDataStoreRuntime, attributes: IChannelAttributes) {
        super(id, runtime, attributes, "fluid_counter_");
    }

    /**
     * Get a factory for SharedCounter to register with the data store.
     *
     * @returns a factory that creates and load SharedCounter
     */
    public static getFactory(): IChannelFactory {
        return new CounterFactory();
    }

    private _value: number = 0;

    /**
     * {@inheritDoc ISharedCounter.value}
     */
    public get value(): number {
        return this._value;
    }

    /**
     * {@inheritDoc ISharedCounter.increment}
     */
    public increment(incrementAmount: number): void {
        // Incrementing by floating point numbers will be eventually inconsistent, since the order in which the
        // increments are applied affects the result.  A more-robust solution would be required to support this.
        if (incrementAmount % 1 !== 0) {
            throw new Error("Must increment by a whole number");
        }

        const op: IIncrementOperation = {
            type: "increment",
            incrementAmount,
        };

        this.incrementCore(incrementAmount);
        this.submitLocalMessage(op);
    }

    private incrementCore(incrementAmount: number): void {
        this._value += incrementAmount;
        this.emit("incremented", incrementAmount, this._value);
    }

    /**
     * Create a summary for the counter
     *
     * @returns the summary of the current state of the counter
     * @internal
     */
    protected summarizeCore(serializer: IFluidSerializer): ISummaryTreeWithStats {
        // Get a serializable form of data
        const content: ICounterSnapshotFormat = {
            value: this.value,
        };

        // And then construct the summary for it
        return createSingleBlobSummary(snapshotFileName, JSON.stringify(content));
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
     * @internal
     */
    protected async loadCore(storage: IChannelStorageService): Promise<void> {
        const content = await readAndParse<ICounterSnapshotFormat>(storage, snapshotFileName);

        this._value = content.value;
    }

    /**
     * Called when the object has disconnected from the delta stream.
     * @internal
     */
    protected onDisconnect(): void { }

    /**
     * Process a counter operation (op).
     *
     * @param message - the message to prepare
     * @param local - whether the message was sent by the local client
     * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
     * For messages from a remote client, this will be undefined.
     * @internal
     */
    protected processCore(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown): void {
        if (message.type === MessageType.Operation && !local) {
            const op = message.contents as IIncrementOperation;

            switch (op.type) {
                case "increment":
                    this.incrementCore(op.incrementAmount);
                    break;

                default:
                    throw new Error("Unknown operation");
            }
        }
    }

    /**
     * Not implemented.
     * @internal
     */
    protected applyStashedOp() {
        throw new Error("Not implemented");
    }
}

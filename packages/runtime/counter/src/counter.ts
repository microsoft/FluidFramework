/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { fromBase64ToUtf8 } from "@fluidframework/common-utils";
import {
    FileMode,
    ISequencedDocumentMessage,
    ITree,
    MessageType,
    TreeEntry,
} from "@fluidframework/protocol-definitions";
import {
    IComponentRuntime,
    IObjectStorageService,
} from "@fluidframework/component-runtime-definitions";
import { ISharedObjectFactory, SharedObject } from "@fluidframework/shared-object-base";
import { CounterFactory } from "./counterFactory";
import { debug } from "./debug";
import { ISharedCounter, ISharedCounterEvents } from "./interfaces";

interface IIncrementOperation {
    type: "increment";
    incrementAmount: number;
}

/**
 * Used in snapshotting.
 */
interface ICounterValue {
    // The value of the counter
    value: number;
}

const snapshotFileName = "header";

/**
 * Implementation of a counter shared object
 */
export class SharedCounter extends SharedObject<ISharedCounterEvents> implements ISharedCounter {
    /**
     * Create a new shared counter
     *
     * @param runtime - component runtime the new shared map belongs to
     * @param id - optional name of the shared map
     * @returns newly create shared map (but not attached yet)
     */
    public static create(runtime: IComponentRuntime, id?: string) {
        return runtime.createChannel(id, CounterFactory.Type) as SharedCounter;
    }

    /**
     * Get a factory for SharedCounter to register with the component.
     *
     * @returns a factory that creates and load SharedCounter
     */
    public static getFactory(): ISharedObjectFactory {
        return new CounterFactory();
    }

    private _value: number = 0;

    /**
     * {@inheritDoc ISharedCounter.value}
     */
    public get value() {
        return this._value;
    }

    /**
     * {@inheritDoc ISharedCounter.increment}
     */
    public increment(incrementAmount: number) {
        const op: IIncrementOperation = {
            type: "increment",
            incrementAmount,
        };

        this.incrementCore(incrementAmount);
        this.submitLocalMessage(op);
    }

    private incrementCore(incrementAmount: number) {
        this._value += incrementAmount;
        this.emit("incremented", incrementAmount, this._value);
    }

    /**
     * Create a snapshot for the counter
     *
     * @returns the snapshot of the current state of the counter
     */
    public snapshot(): ITree {
        // Get a serializable form of data
        const content: ICounterValue = {
            value: this.value,
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
     * Load counter from snapshot
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
            ? JSON.parse(fromBase64ToUtf8(rawContent)) as ICounterValue
            : { value: 0 };

        this._value = content.value;
    }

    /**
     * Process the counter value on register
     */
    protected registerCore() {
    }

    /**
     * Call back on disconnect
     */
    protected onDisconnect() {
        debug(`Counter ${this.id} is now disconnected`);
    }

    /**
     * Process a counter operation
     *
     * @param message - the message to prepare
     * @param local - whether the message was sent by the local client
     * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
     * For messages from a remote client, this will be undefined.
     */
    protected processCore(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) {
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
}

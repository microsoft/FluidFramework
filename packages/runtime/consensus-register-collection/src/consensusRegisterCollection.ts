/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { fromBase64ToUtf8 } from "@microsoft/fluid-core-utils";
import {
    FileMode,
    ISequencedDocumentMessage,
    ITree,
    MessageType,
    TreeEntry,
} from "@microsoft/fluid-protocol-definitions";
import {
    IChannelAttributes,
    IComponentRuntime,
    IObjectStorageService,
} from "@microsoft/fluid-runtime-definitions";
import { ISharedObject, SharedObject, ValueType } from "@microsoft/fluid-shared-object-base";
import { ConsensusRegisterCollectionFactory } from "./consensusRegisterCollectionFactory";
import { debug } from "./debug";
import { IConsensusRegisterCollection, ReadPolicy } from "./interfaces";

interface ILocalData {
    // Atomic version.
    atomic: ILocalRegister;

    // All versions.
    versions: ILocalRegister[];
}

interface ILocalRegister {
    // Register value
    value: IRegisterValue;

    // The sequence number when last consensus was reached.
    sequenceNumber: number;
}

interface IRegisterValue {
    // Type of the value
    type: string;

    // Actual Value
    value: any;
}

/**
 * An operation for consensus register collection
 */
interface IRegisterOperation {
    key: string;
    type: "write";
    value: IRegisterValue;

    // Message can be delivered with delay - resubmitted on reconnect.
    // As such, refSeq needs to reference seq # at the time op was created (here),
    // not when op was actually sent over wire (as client can ingest ops in between)
    // in other words, we can't use ISequencedDocumentMessage.referenceSequenceNumber
    refSeq: number;
}

/**
 * A record of the pending operation
 */
interface IPendingRecord {
    /**
     * The resolve function to call after the local operation is ack'ed
     */
    resolve: (winner: boolean) => void;

    /**
     * The client sequence number of the operation. For assert only.
     */
    clientSequenceNumber: number;

    /**
     * Pending Message
     */
    message: IRegisterOperation;
}

const snapshotFileName = "header";

/**
 * Implementation of a consensus register collection
 */
export class ConsensusRegisterCollection<T> extends SharedObject implements IConsensusRegisterCollection<T> {
    /**
     * Create a new consensus register collection
     *
     * @param runtime - component runtime the new consensus register collection belongs to
     * @param id - optional name of the consensus register collection
     * @returns newly create consensus register collection (but not attached yet)
     */
    public static create<T>(runtime: IComponentRuntime, id?: string) {
        return runtime.createChannel(id, ConsensusRegisterCollectionFactory.Type) as ConsensusRegisterCollection<T>;
    }

    /**
     * Get a factory for ConsensusRegisterCollection to register with the component.
     *
     * @returns a factory that creates and load ConsensusRegisterCollection
     */
    public static getFactory() {
        return new ConsensusRegisterCollectionFactory();
    }

    private readonly data = new Map<string, ILocalData>();
    private readonly promiseResolveQueue: IPendingRecord[] = [];

    /**
     * Constructs a new consensus register collection. If the object is non-local an id and service interfaces will
     * be provided
     */
    public constructor(
        id: string,
        runtime: IComponentRuntime,
        attributes: IChannelAttributes) {
        super(id, runtime, attributes);
    }

    public on(
        event: "atomicChanged" | "versionChanged",
        listener: (key: string, value: any, local: boolean) => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this;

    public on(event: string, listener: (...args: any[]) => void): this
    {
        return super.on(event, listener);
    }

    /**
     * Creates a new register or writes a new value.
     * Returns a promise that will resolve when the write is acked.
     *
     * @returns Promise<true> if write was non-concurrent
     */
    public async write(key: string, value: T): Promise<boolean> {
        let operationValue: IRegisterValue;

        if (SharedObject.is(value)) {
            value.register();
            operationValue = {
                type: ValueType[ValueType.Shared],
                value: value.id,
            };
        } else {
            operationValue = {
                type: ValueType[ValueType.Plain],
                value,
            };
        }

        const op: IRegisterOperation = {
            key,
            type: "write",
            value: operationValue,
            refSeq: this.runtime.deltaManager.referenceSequenceNumber,
        };
        return this.submit(op);
    }

    /**
     * Returns the most recent local value of a register.
     *
     * TODO: This read does not guarantee most up to date value. We probably want to have a version
     * that submits a read message and returns when the message is acked. That way we are guaranteed
     * to read the most recent linearizable value for that register.
     */
    public read(key: string, policy?: ReadPolicy): T | undefined {
        // Default policy is atomic.
        const readPolicy = (policy === undefined) ? ReadPolicy.Atomic : policy;

        if (readPolicy === ReadPolicy.Atomic) {
            return this.readAtomic(key);
        }

        const versions = this.readVersions(key);

        if (versions) {
            // We don't support deletion. So there should be at least one value.
            assert(versions.length > 0, "Value should be undefined or non empty");

            return versions[versions.length - 1];
        }
    }

    public readVersions(key: string): T[] | undefined {
        const data = this.data.get(key);
        if (data) {
            return data.versions.map((element: ILocalRegister) => element.value.value);
        }
    }

    public keys(): string[] {
        return [...this.data.keys()];
    }

    public snapshot(): ITree {
        const serialized: { [key: string]: ILocalData } = {};
        this.data.forEach((items, key) => {
            const serializedAtomic = this.snapshotItem(items.atomic);
            const serializedVersions: ILocalRegister[] = [];
            for (const element of items.versions) {
                serializedVersions.push(this.snapshotItem(element));
            }
            serialized[key] = {
                atomic: serializedAtomic,
                versions: serializedVersions,
            };
        });
        // And then construct the tree for it
        const tree: ITree = {
            entries: [
                {
                    mode: FileMode.File,
                    path: snapshotFileName,
                    type: TreeEntry[TreeEntry.Blob],
                    value: {
                        contents: JSON.stringify(serialized),
                        encoding: "utf-8",
                    },
                },
            ],
            // eslint-disable-next-line no-null/no-null
            id: null,
        };

        return tree;
    }

    protected async loadCore(
        branchId: string,
        storage: IObjectStorageService): Promise<void> {

        const header = await storage.read(snapshotFileName);
        const data: { [key: string]: ILocalData } = header ? JSON.parse(fromBase64ToUtf8(header)) : {};

        for (const key of Object.keys(data)) {
            const serializedValues = data[key];
            const loadedVersions: ILocalRegister[] = [];
            const loadedAtomic = await this.loadItem(serializedValues.atomic);
            for (const element of serializedValues.versions) {
                loadedVersions.push(await this.loadItem(element));
            }
            this.data.set(key, {
                atomic: loadedAtomic,
                versions: loadedVersions,
            });
        }
    }

    protected registerCore() {
        return;
    }

    protected onDisconnect() {
        debug(`ConsensusRegisterCollection ${this.id} is now disconnected`);
    }

    protected onConnect(pending: any[]) {
        // resubmit non-acked messages
        for (const record of this.promiseResolveQueue) {
            record.clientSequenceNumber = this.submitLocalMessage(record.message);
        }
    }

    protected processCore(message: ISequencedDocumentMessage, local: boolean) {
        if (message.type === MessageType.Operation) {
            const op: IRegisterOperation = message.contents;
            switch (op.type) {
                case "write":
                    // Message can be delivered with delay - resubmitted on reconnect.
                    // As such, refSeq needs to reference seq # at the time op was created (here),
                    // not when op was actually sent over wire (as client can ingest ops in between)
                    // in other words, we can't use ISequencedDocumentMessage.referenceSequenceNumber
                    assert(op.refSeq <= message.referenceSequenceNumber);
                    const winner = this.processInboundWrite(
                        op.refSeq,
                        message.sequenceNumber,
                        op,
                        local);
                    // If it is local operation, resolve the promise.
                    if (local) {
                        this.processLocalMessage(message, winner);
                    }
                    break;

                default:
                    throw new Error("Unknown operation");
            }
        }
    }

    private readAtomic(key: string): T | undefined {
        const data = this.data.get(key);
        if (data) {
            return data.atomic.value.value;
        }
    }

    private processInboundWrite(
        refSeq: number,
        sequenceNumber: number,
        op: IRegisterOperation,
        local: boolean): boolean
    {
        let data = this.data.get(op.key);
        // Atomic update if it's a new register or the write attempt was not concurrent (ref seq >= sequence number)
        let winner = false;
        if (data === undefined || refSeq >= data.atomic.sequenceNumber) {
            winner = true;
            const atomicUpdate: ILocalRegister = {
                sequenceNumber,
                value: op.value,
            };
            if (data === undefined) {
                data = {
                    atomic: atomicUpdate,
                    versions: [],
                };
                this.data.set(op.key, data);
            } else {
                data.atomic = atomicUpdate;
            }
            this.emit("atomicChanged", op.key, op.value.value, local);
        }

        // Keep removing versions where incoming refseq is greater than or equals to current.
        while (data.versions.length > 0 && refSeq >= data.versions[0].sequenceNumber) {
            data.versions.shift();
        }

        const versionUpdate: ILocalRegister = {
            sequenceNumber,
            value: op.value,
        };

        assert(
            data.versions.length === 0 ||
            (this.isLocal() && sequenceNumber === 0) ||
            sequenceNumber > data.versions[data.versions.length - 1].sequenceNumber,
            "Invalid incoming sequence number");

        // Push the new element.
        data.versions.push(versionUpdate);
        this.emit("versionChanged", op.key, op.value.value, local);

        return winner;
    }

    private processLocalMessage(message: ISequencedDocumentMessage, winner: boolean) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const pending = this.promiseResolveQueue.shift()!;
        assert(pending);
        /* eslint-disable @typescript-eslint/indent */
        assert(message.clientSequenceNumber === -1
            || message.clientSequenceNumber === pending.clientSequenceNumber,
            `${message.clientSequenceNumber} !== ${pending.clientSequenceNumber}`);
        /* eslint-enable @typescript-eslint/indent */
        pending.resolve(winner);
    }

    private async submit(message: IRegisterOperation): Promise<boolean> {
        if (this.isLocal()) {
            this.processInboundWrite(0, 0, message, true);
            return true;
        }

        const clientSequenceNumber = this.submitLocalMessage(message);
        return new Promise((resolve) => {
            // Note that clientSequenceNumber and key is only used for asserts and isn't strictly necessary.
            this.promiseResolveQueue.push({ resolve, clientSequenceNumber, message });
        });
    }

    private snapshotItem(item: ILocalRegister): ILocalRegister {
        let innerValue: any;
        if (item.value.type === ValueType[ValueType.Shared]) {
            innerValue = (item.value.value as ISharedObject).id;
        } else {
            innerValue = item.value.value;
        }
        return {
            sequenceNumber: item.sequenceNumber,
            value: {
                type: item.value.type,
                value: innerValue,
            },
        };
    }

    private async loadItem(item: ILocalRegister): Promise<ILocalRegister> {
        switch (item.value.type) {
            case ValueType[ValueType.Plain]:
                return item;
            case ValueType[ValueType.Shared]:
                const channel = await this.runtime.getChannel(item.value.value as string);
                const fullValue: ILocalRegister = {
                    sequenceNumber: item.sequenceNumber,
                    value: {
                        type: item.value.type,
                        value: channel,
                    },
                };
                return fullValue;
            default:
                assert(false, "Invalid value type");
                return Promise.reject("Invalid value type");
        }
    }
}

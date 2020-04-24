/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { fromBase64ToUtf8 } from "@microsoft/fluid-common-utils";
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
import { strongAssert, unreachableCase } from "@microsoft/fluid-runtime-utils";
import { SharedObject } from "@microsoft/fluid-shared-object-base";
import { ConsensusRegisterCollectionFactory } from "./consensusRegisterCollectionFactory";
import { debug } from "./debug";
import { IConsensusRegisterCollection, ReadPolicy, IConsensusRegisterCollectionEvents } from "./interfaces";

interface ILocalData<T> {
    // Atomic version
    atomic: ILocalRegister<T>;

    // All concurrent versions awaiting consensus
    versions: ILocalRegister<T>[];
}

interface ILocalRegister<T> {
    // Register value, wrapped for backwards compatibility with < 0.17
    value: {
        type: "Plain",
        value: T,
    };

    // The sequence number when last consensus was reached
    sequenceNumber: number;
}

const newLocalRegister = <T>(sequenceNumber: number, value: T): ILocalRegister<T> =>
    ({
        sequenceNumber,
        value: {
            type: "Plain",
            value,
        },
    });

/**
 * An operation for consensus register collection
 */
interface IRegisterOperation {
    key: string;
    type: "write";
    value: string;

    // Message can be delivered with delay - resubmitted on reconnect.
    // As such, refSeq needs to reference seq # at the time op was created (here),
    // not when op was actually sent over wire (as client can ingest ops in between)
    // in other words, we can't use ISequencedDocumentMessage.referenceSequenceNumber
    refSeq?: number;
}

/**
 * A record of the pending operation awaiting ack
 */
interface IPendingRecord {
    /** The resolve function to call after the local operation is ack'ed */
    resolve: (winner: boolean) => void;

    /** The client sequence number of the operation. For assert only */
    clientSequenceNumber: number;

    /** Pending Message */
    message: IRegisterOperation;
}

const snapshotFileName = "header";

/**
 * Implementation of a consensus register collection
 */
export class ConsensusRegisterCollection<T>
    extends SharedObject<IConsensusRegisterCollectionEvents> implements IConsensusRegisterCollection<T> {
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

    private readonly data = new Map<string, ILocalData<T>>();

    /** Queue of local messages awaiting ack from the server */
    private readonly pendingLocalMessages: IPendingRecord[] = [];

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

    /**
     * Creates a new register or writes a new value.
     * Returns a promise that will resolve when the write is acked.
     *
     * @returns Promise<true> if write was non-concurrent
     */
    public async write(key: string, value: T): Promise<boolean> {
        const message: IRegisterOperation = {
            key,
            type: "write",
            value: this.stringify(value),
            refSeq: this.runtime.deltaManager.referenceSequenceNumber,
        };

        if (this.isLocal()) {
            this.processInboundWrite(0, 0, message, true);
            return true;
        }

        const clientSequenceNumber = this.submitLocalMessage(message);
        return new Promise((resolve) => {
            // Note that clientSequenceNumber and message are only used for asserts and aren't strictly necessary.
            this.pendingLocalMessages.push({ resolve, clientSequenceNumber, message });
        });
    }

    /**
     * Returns the most recent local value of a register.
     *
     * TODO: This read does not guarantee most up to date value. We probably want to have a version
     * that submits a read message and returns when the message is acked. That way we are guaranteed
     * to read the most recent linearizable value for that register.
     * @param key - The key to read
     * @param readPolicy - The ReadPolicy to apply. Defaults to Atomic.
     */
    public read(key: string, readPolicy: ReadPolicy = ReadPolicy.Atomic): T | undefined {
        if (readPolicy === ReadPolicy.Atomic) {
            return this.readAtomic(key);
        }

        const versions = this.readVersions(key);

        if (versions !== undefined) {
            // We don't support deletion. So there should be at least one value.
            assert(versions.length > 0, "Value should be undefined or non-empty");

            return versions[versions.length - 1];
        }
    }

    public readVersions(key: string): T[] | undefined {
        const data = this.data.get(key);
        return data?.versions.map((element: ILocalRegister<T>) => element.value.value);
    }

    public keys(): string[] {
        return [...this.data.keys()];
    }

    public snapshot(): ITree {
        const dataObj: { [key: string]: ILocalData<T> } = {};
        this.data.forEach((v, k) => { dataObj[k] = v; });

        const tree: ITree = {
            entries: [
                {
                    mode: FileMode.File,
                    path: snapshotFileName,
                    type: TreeEntry[TreeEntry.Blob],
                    value: {
                        contents: this.stringify(dataObj),
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
        storage: IObjectStorageService,
    ): Promise<void> {
        const header = await storage.read(snapshotFileName);
        const dataObj = header !== undefined ? this.parse(fromBase64ToUtf8(header)) : {};

        for (const key of Object.keys(dataObj)) {
            assert(dataObj[key].atomic?.value.type !== "Shared",
                "SharedObjects contained in ConsensusRegisterCollection can no longer be deserialized as of 0.17");

            this.data.set(key, dataObj[key]);
        }
    }

    protected registerCore() {}

    protected onDisconnect() {
        debug(`ConsensusRegisterCollection ${this.id} is now disconnected`);
    }

    protected onConnect(pending: any[]) {
        // resubmit non-acked messages
        assert(pending.length === this.pendingLocalMessages.length);
        for (const record of this.pendingLocalMessages) {
            record.clientSequenceNumber = this.submitLocalMessage(record.message);
        }
    }

    protected processCore(message: ISequencedDocumentMessage, local: boolean) {
        if (message.type === MessageType.Operation) {
            const op: IRegisterOperation = message.contents;
            switch (op.type) {
                case "write": {
                    // add back-compat for pre-0.14 versions
                    // when the refSeq property didn't exist
                    if (op.refSeq === undefined) {
                        op.refSeq = message.referenceSequenceNumber;
                    }
                    // Message can be delivered with delay - resubmitted on reconnect.
                    // we use refSeq not message.referenceSequenceNumber, to reference seq # at the time op was created
                    // not later when op was actually sent over wire (as client can ingest ops in between).
                    assert(op.refSeq <= message.referenceSequenceNumber);
                    const winner = this.processInboundWrite(
                        op.refSeq,
                        message.sequenceNumber,
                        op,
                        local);
                    if (local) {
                        this.onLocalMessageAck(message, winner);
                    }
                    break;
                }
                default: unreachableCase(op.type);
            }
        }
    }

    private readAtomic(key: string): T | undefined {
        const data = this.data.get(key);
        return data?.atomic.value.value;
    }

    private processInboundWrite(
        refSeq: number,
        sequenceNumber: number,
        op: IRegisterOperation,
        local: boolean): boolean
    {
        let data = this.data.get(op.key);
        const deserializedValue = this.parse(op.value);
        // Atomic update if it's a new register or the write attempt was not concurrent (ref seq >= sequence number)
        const winner = data === undefined || refSeq >= data.atomic.sequenceNumber;
        if (winner) {
            const atomicUpdate = newLocalRegister<T>(
                sequenceNumber,
                deserializedValue,
            );
            if (data === undefined) {
                data = {
                    atomic: atomicUpdate,
                    versions: [], // we'll update versions next, leave it empty for now
                };
                this.data.set(op.key, data);
            } else {
                data.atomic = atomicUpdate;
            }
        }
        else {
            strongAssert(data);
        }

        // Keep removing versions where incoming refseq is greater than or equals to current.
        while (data.versions.length > 0 && refSeq >= data.versions[0].sequenceNumber) {
            data.versions.shift();
        }

        const versionUpdate = newLocalRegister<T>(
            sequenceNumber,
            deserializedValue,
        );

        assert(
            data.versions.length === 0 ||
            (this.isLocal() && sequenceNumber === 0) ||
            sequenceNumber > data.versions[data.versions.length - 1].sequenceNumber,
            "Invalid incoming sequence number");

        // Push the new element.
        data.versions.push(versionUpdate);

        // Raise events at the end, to avoid reentrancy issues
        if (winner) {
            this.emit("atomicChanged", op.key, op.value, local);
        }
        this.emit("versionChanged", op.key, op.value, local);

        return winner;
    }

    private onLocalMessageAck(message: ISequencedDocumentMessage, winner: boolean) {
        const pending = this.pendingLocalMessages.shift();
        strongAssert(pending);
        assert(message.clientSequenceNumber === pending.clientSequenceNumber,
            "ConsensusRegistryCollection: unexpected ack");
        pending.resolve(winner);
    }

    private stringify(value: any): string {
        return this.runtime.IComponentSerializer.stringify(
            value,
            this.runtime.IComponentHandleContext,
            this.handle);
    }

    private parse(content: string): any {
        return this.runtime.IComponentSerializer.parse(
            content,
            this.runtime.IComponentHandleContext);
    }
}

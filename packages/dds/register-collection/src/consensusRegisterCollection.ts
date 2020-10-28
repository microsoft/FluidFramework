/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { fromBase64ToUtf8, unreachableCase } from "@fluidframework/common-utils";
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
} from "@fluidframework/datastore-definitions";
import { SharedObject } from "@fluidframework/shared-object-base";
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

const newLocalRegister = <T>(sequenceNumber: number, value: T): ILocalRegister<T> => ({
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
    serializedValue: string;

    // Message can be delivered with delay - resubmitted on reconnect.
    // As such, refSeq needs to reference seq # at the time op was created,
    // not when op was actually sent over wire (ISequencedDocumentMessage.referenceSequenceNumber),
    // as client can ingest ops in between.
    refSeq: number | undefined;
}

/**
 * IRegisterOperation format in versions < 0.17
 */
interface IRegisterOperationOld<T> {
    key: string;
    type: "write";
    value: {
        type: "Plain",
        value: T,
    };
    refSeq: number;
}

/** Incoming ops could match any of these types */
type IIncomingRegisterOperation<T> = IRegisterOperation | IRegisterOperationOld<T>;

/** Distinguish between incoming op formats so we know which type it is */
const incomingOpMatchesCurrentFormat = (op): op is IRegisterOperation => "serializedValue" in op;

/** The type of the resolve function to call after the local operation is ack'd */
type PendingResolve = (winner: boolean) => void;

const snapshotFileName = "header";

/**
 * Implementation of a consensus register collection
 */
export class ConsensusRegisterCollection<T>
    extends SharedObject<IConsensusRegisterCollectionEvents> implements IConsensusRegisterCollection<T> {
    /**
     * Create a new consensus register collection
     *
     * @param runtime - data store runtime the new consensus register collection belongs to
     * @param id - optional name of the consensus register collection
     * @returns newly create consensus register collection (but not attached yet)
     */
    public static create<T>(runtime: IFluidDataStoreRuntime, id?: string) {
        return runtime.createChannel(id, ConsensusRegisterCollectionFactory.Type) as ConsensusRegisterCollection<T>;
    }

    /**
     * Get a factory for ConsensusRegisterCollection to register with the data store.
     *
     * @returns a factory that creates and load ConsensusRegisterCollection
     */
    public static getFactory() {
        return new ConsensusRegisterCollectionFactory();
    }

    private readonly data = new Map<string, ILocalData<T>>();

    /**
     * Constructs a new consensus register collection. If the object is non-local an id and service interfaces will
     * be provided
     */
    public constructor(
        id: string,
        runtime: IFluidDataStoreRuntime,
        attributes: IChannelAttributes,
    ) {
        super(id, runtime, attributes);
    }

    /**
     * Creates a new register or writes a new value.
     * Returns a promise that will resolve when the write is acked.
     *
     * @returns Promise<true> if write was non-concurrent
     */
    public async write(key: string, value: T): Promise<boolean> {
        const serializedValue = this.stringify(value);

        if (!this.isAttached()) {
            // JSON-roundtrip value for local writes to match the behavior of going through the wire
            this.processInboundWrite(key, this.parse(serializedValue), 0, 0, true);
            return true;
        }

        const message: IRegisterOperation = {
            key,
            type: "write",
            serializedValue,
            refSeq: this.runtime.deltaManager.lastSequenceNumber,
        };

        return this.newAckBasedPromise<boolean>((resolve) => {
            // Send the resolve function as the localOpMetadata. This will be provided back to us when the
            // op is ack'd.
            this.submitLocalMessage(message, resolve);
            // If we fail due to runtime being disposed, it's better to return false then unhandled exception.
        }).catch((error) => false);
    }

    /**
     * Returns the most recent local value of a register.
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
                    type: TreeEntry.Blob,
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
        storage: IChannelStorageService,
    ): Promise<void> {
        const header = await storage.read(snapshotFileName);
        const dataObj = header !== undefined ? this.parse(fromBase64ToUtf8(header)) : {};

        for (const key of Object.keys(dataObj)) {
            assert(dataObj[key].atomic?.value.type !== "Shared",
                "SharedObjects contained in ConsensusRegisterCollection can no longer be deserialized as of 0.17");

            this.data.set(key, dataObj[key]);
        }
    }

    protected registerCore() { }

    protected onDisconnect() {
        debug(`ConsensusRegisterCollection ${this.id} is now disconnected`);
    }

    protected processCore(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) {
        if (message.type === MessageType.Operation) {
            const op: IIncomingRegisterOperation<T> = message.contents;
            switch (op.type) {
                case "write": {
                    // back-compat 0.13 refSeq
                    // when the refSeq property didn't exist
                    if (op.refSeq === undefined) {
                        op.refSeq = message.referenceSequenceNumber;
                    }
                    // Message can be delivered with delay - e.g. resubmitted on reconnect.
                    // Use the refSeq from when the op was created, not when it was transmitted
                    const refSeqWhenCreated = op.refSeq;
                    assert(refSeqWhenCreated <= message.referenceSequenceNumber);

                    const value = incomingOpMatchesCurrentFormat(op)
                        ? this.parse(op.serializedValue) as T
                        : op.value.value;
                    const winner = this.processInboundWrite(
                        op.key,
                        value,
                        refSeqWhenCreated,
                        message.sequenceNumber,
                        local);
                    if (local) {
                        assert(localOpMetadata, "localOpMetadata is missing from the client's write operation");
                        // Resolve the pending promise for this operation now that we have received an ack for it.
                        const resolve = localOpMetadata as PendingResolve;
                        resolve(winner);
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

    /**
     * Process an inbound write op
     * @param key - Key that was written to
     * @param value - Incoming value
     * @param refSeq - RefSeq at the time of write on the remote client
     * @param sequenceNumber - Sequence Number of this write op
     * @param local - Did this write originate on this client
     */
    private processInboundWrite(
        key: string,
        value: T,
        refSeq: number,
        sequenceNumber: number,
        local: boolean,
    ): boolean {
        let data = this.data.get(key);
        // Atomic update if it's a new register or the write was not concurrent,
        // meaning our state was known to the remote client at the time of write
        const winner = data === undefined || refSeq >= data.atomic.sequenceNumber;
        if (winner) {
            const atomicUpdate = newLocalRegister<T>(
                sequenceNumber,
                value,
            );
            if (data === undefined) {
                data = {
                    atomic: atomicUpdate,
                    versions: [], // we'll update versions next, leave it empty for now
                };
                this.data.set(key, data);
            } else {
                data.atomic = atomicUpdate;
            }
        }
        else {
            assert(data);
        }

        // Remove versions that were known to the remote client at the time of write
        while (data.versions.length > 0 && refSeq >= data.versions[0].sequenceNumber) {
            data.versions.shift();
        }

        const versionUpdate = newLocalRegister<T>(
            sequenceNumber,
            value,
        );

        // Asserts for data integrity
        if (!this.isAttached()) {
            assert(refSeq === 0 && sequenceNumber === 0, "sequence numbersare expected to be 0 when unattached");
        }
        else if (data.versions.length > 0) {
            assert(sequenceNumber > data.versions[data.versions.length - 1].sequenceNumber,
                "Versions should naturally be ordered by sequenceNumber");
        }

        // Push the new element.
        data.versions.push(versionUpdate);

        // Raise events at the end, to avoid reentrancy issues
        if (winner) {
            this.emit("atomicChanged", key, value, local);
        }
        this.emit("versionChanged", key, value, local);

        return winner;
    }

    private stringify(value: any): string {
        return this.runtime.IFluidSerializer.stringify(
            value,
            this.runtime.IFluidHandleContext,
            this.handle);
    }

    private parse(content: string): any {
        return this.runtime.IFluidSerializer.parse(
            content,
            this.runtime.IFluidHandleContext);
    }
}

import { ISharedObject, SharedObject } from "@prague/api-definitions";
import {
    FileMode,
    ISequencedDocumentMessage,
    ITree,
    MessageType,
    TreeEntry } from "@prague/container-definitions";
import { IComponentRuntime, IObjectStorageService } from "@prague/runtime-definitions";
import * as assert from "assert";
import { debug } from "./debug";
import {
    IConsensusRegisterCollection,
    IRegisterState,
    RegisterValueType } from "./interfaces";

/**
 * An operation for consensus register collection
 */
interface IRegisterOperation {
    key: string;
    type: "set"; // We probably want delete too?
    value: IRegisterState;
}

/**
 * A record of the pending operation
 */
interface IPendingRecord {
    /**
     * The resolve function to call after the local operation is ack'ed
     */
    resolve: () => void;

    /**
     * The client sequence number of the operation. For assert only.
     */
    clientSequenceNumber: number;
}

const snapshotFileName = "header";

/**
 * Implementation of a consensus rgister collection
 */
export class ConsensusRegisterCollection extends SharedObject implements IConsensusRegisterCollection {
    private readonly data = new Map<string, IRegisterState>();
    private readonly promiseResolveQueue = new Array<IPendingRecord>();

    /**
     * Constructs a new consensus register collection. If the object is non-local an id and service interfaces will
     * be provided
     */
    public constructor(
        id: string,
        runtime: IComponentRuntime,
        type: string) {
        super(id, runtime, type);
    }

    /**
     * Add a value to the consensus collection.
     */
    public async write(key: string, value: any): Promise<void> {
        // Set the reference sequence number to the value when this register was last updated.
        // Otherwise it's a brand new one 0 is a valid reference sequence number.
        const referenceSequenceNumber = this.data.has(key) ? this.data.get(key).referenceSequenceNumber : 0;

        let operationValue: IRegisterState;

        // TODO: Not all shared object will be derived from SharedObject
        if (value instanceof SharedObject) {
            if (!this.isLocal()) {
                // Ensure a referenced shared object is attached.
                value.attach();
            }

            operationValue = {
                referenceSequenceNumber,
                type: RegisterValueType[RegisterValueType.Shared],
                value: value.id,
            };
        } else {
            operationValue = {
                referenceSequenceNumber,
                type: RegisterValueType[RegisterValueType.Plain],
                value,
            };
        }

        // This do not work if you are local. May be we just want to buffer ops until we get connected?
        // So local promise will never resolve?
        if (this.isLocal()) {
            // For the case where this is not attached yet, explicitly JSON
            // clone the value to match the behavior of going thru the wire.
            const writeValue = JSON.parse(JSON.stringify(operationValue)) as IRegisterState;
            this.writeCore(key, writeValue, true, null);
            return Promise.resolve();
        }

        const op: IRegisterOperation = {
            key,
            type: "set",
            value: operationValue,
        };
        return this.submit(op);
    }

    public read(key: string): any {
        if (!this.data.has(key)) {
            return undefined;
        }
        const value = this.data.get(key);
        return value.value;

    }

    public snapshot(): ITree {
        const serialized: any = {};
        this.data.forEach((value, key) => {
            let serializeValue: any;
            if (value.type === RegisterValueType[RegisterValueType.Shared]) {
                serializeValue = (value.value as ISharedObject).id;
            } else {
                serializeValue = value;
            }
            /* tslint:disable:no-unsafe-any */
            serialized[key] = {
                referenceSequenceNumber: value.referenceSequenceNumber,
                type: value.type,
                value: serializeValue,
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
            sha: null,
        };

        return tree;
    }

    protected async loadCore(
        minimumSequenceNumber: number,
        headerOrigin: string,
        storage: IObjectStorageService): Promise<void> {

        const header = await storage.read(snapshotFileName);
        const data: { [key: string]: IRegisterState } = header ? JSON.parse(Buffer.from(header, "base64")
        .toString("utf-8")) : {};

        for (const key of Object.keys(data)) {
            const value = data[key];
            switch (value.type) {
                case RegisterValueType[RegisterValueType.Plain]:
                    this.data.set(key, value);
                    break;
                case RegisterValueType[RegisterValueType.Shared]:
                    const channel = await this.runtime.getChannel(value.value as string);
                    const fullValue: IRegisterState = {
                        referenceSequenceNumber: value.referenceSequenceNumber,
                        type: value.type,
                        value: channel,
                    };
                    this.data.set(key, fullValue);
                    break;
                default:
                    assert(false, "Invalid value type");
            }
        }
    }

    protected initializeLocalCore() {
        return;
    }

    protected attachCore() {
        return;
    }

    protected onDisconnect() {
        debug(`ConsensusCollection ${this.id} is now disconnected`);
    }

    protected onConnect(pending: any[]) {
        for (const message of pending) {
            this.submitLocalMessage(message);
        }

        return;
    }

    protected async prepareCore(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        if (message.type === MessageType.Operation && !local) {
            const op: IRegisterOperation = message.contents;
            if (op.type === "set") {
                /* tslint:disable:no-return-await */
                return op.value.type === RegisterValueType[RegisterValueType.Shared]
                    ? await this.runtime.getChannel(op.value.value)
                    : op.value.value;
            }
        }
    }

    protected processCore(message: ISequencedDocumentMessage, local: boolean, context: any) {
        if (message.type === MessageType.Operation) {
            const op: IRegisterOperation = message.contents;
            switch (op.type) {
                case "set":
                    this.processInboundWrite(message, op, local);
                    break;

                default:
                    throw new Error("Unknown operation");
            }
            // If it is local operation, resolve the promise.
            if (local) {
                this.processLocalMessage(message);
            }
        }
    }

    private processInboundWrite(message: ISequencedDocumentMessage, op: IRegisterOperation, local: boolean) {
        // If it's a new register, set its value. Otherwise, check whether the incoming ref seq matches with local.
        if (!this.data.has(op.key) ||
            this.data.get(op.key).referenceSequenceNumber === op.value.referenceSequenceNumber) {
                // Update the ref seq to incoming sequence number.
                op.value.referenceSequenceNumber = message.sequenceNumber;
                this.writeCore(op.key, op.value, local, message);
        }
    }

    private processLocalMessage(message: ISequencedDocumentMessage) {
        const pending = this.promiseResolveQueue.shift();
        assert(message.clientSequenceNumber === -1
            || message.clientSequenceNumber === pending.clientSequenceNumber);
        pending.resolve();
    }

    private async submit(message: IRegisterOperation): Promise<void> {
        assert(!this.isLocal());

        const clientSequenceNumber = this.submitLocalMessage(message);
        // False positive - tslint couldn't track that the promise is stored in promiseResolveQueue and resolved later
        // tslint:disable:promise-must-complete
        return new Promise((resolve, reject) => {
            // Note that clientSequenceNumber and message is only used for asserts and isn't strictly necessary.
            this.promiseResolveQueue.push({ resolve, clientSequenceNumber });
        });
    }

    private writeCore(key: string, value: IRegisterState, local: boolean, message: ISequencedDocumentMessage) {
        this.data.set(key, value);
        this.emit("valueChanged", { key }, local, message);
    }
}

import {
    ConnectionState,
    FileMode,
    ISequencedDocumentMessage,
    ITree,
    MessageType,
    TreeEntry } from "@prague/container-definitions";
import { IComponentRuntime, IObjectStorageService } from "@prague/runtime-definitions";
import { ISharedObject, SharedObject } from "@prague/shared-object-common";
import * as assert from "assert";
import { debug } from "./debug";
import {
    IConsensusRegisterCollection,
    ILocalRegister,
    IRegisterValue,
    RegisterValueType } from "./interfaces";

/**
 * An operation for consensus register collection
 */
interface IRegisterOperation {
    key: string;
    type: "write";
    value: IRegisterValue;
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
    private readonly data = new Map<string, ILocalRegister>();
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
     * Creates a new register or writes a new value.
     * Returns a promise that will resolve when the write is acked.
     *
     * TODO: Right now we will only allow connected clients to write.
     * The correct answer for this should become more clear as we build more scenarios on top of this.
     */
    public async write(key: string, value: any): Promise<void> {
        if (this.isLocal()) {
            return Promise.reject(`Local changes are not allowed`);
        }
        if (this.state !== ConnectionState.Connected) {
            return Promise.reject(`Client is not connected`);
        }

        let operationValue: IRegisterValue;

        if (value instanceof SharedObject) {
            value.attach();
            operationValue = {
                type: RegisterValueType[RegisterValueType.Shared],
                value: value.id,
            };
        } else {
            operationValue = {
                type: RegisterValueType[RegisterValueType.Plain],
                value,
            };
        }

        const op: IRegisterOperation = {
            key,
            type: "write",
            value: operationValue,
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
    public read(key: string): any {
        if (!this.data.has(key)) {
            return undefined;
        }
        const item = this.data.get(key);
        return item.value.value;
    }

    public entries(): Map<string, any> {
        const keysAndValues = new Map<string, any>();
        this.data.forEach((state, key) => {
            keysAndValues.set(key, state.value);
        });
        return keysAndValues;
    }

    public snapshot(): ITree {
        const serialized: any = {};
        this.data.forEach((item, key) => {
            let innerValue: any;
            if (item.value.type === RegisterValueType[RegisterValueType.Shared]) {
                innerValue = (item.value.value as ISharedObject).id;
            } else {
                innerValue = item.value.value;
            }
            /* tslint:disable:no-unsafe-any */
            serialized[key] = {
                sequenceNumber: item.sequenceNumber,
                value: {
                    type: item.value.type,
                    value: innerValue,
                },
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
            id: null,
        };

        return tree;
    }

    protected async loadCore(
        minimumSequenceNumber: number,
        headerOrigin: string,
        storage: IObjectStorageService): Promise<void> {

        const header = await storage.read(snapshotFileName);
        const data: { [key: string]: ILocalRegister } = header ? JSON.parse(Buffer.from(header, "base64")
        .toString("utf-8")) : {};

        for (const key of Object.keys(data)) {
            const item = data[key];
            switch (item.value.type) {
                case RegisterValueType[RegisterValueType.Plain]:
                    this.data.set(key, item);
                    break;
                case RegisterValueType[RegisterValueType.Shared]:
                    const channel = await this.runtime.getChannel(item.value.value as string);
                    const fullValue: ILocalRegister = {
                        sequenceNumber: item.sequenceNumber,
                        value: {
                            type: item.value.type,
                            value: channel,
                        },
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
        debug(`ConsensusRegisterCollection ${this.id} is now disconnected`);
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
            if (op.type === "write") {
                /* tslint:disable:no-return-await */
                return op.value.type === RegisterValueType[RegisterValueType.Shared]
                    ? await this.runtime.getChannel(op.value.value as string)
                    : op.value.value;
            }
        }
    }

    protected processCore(message: ISequencedDocumentMessage, local: boolean, context: any) {
        if (message.type === MessageType.Operation) {
            const op: IRegisterOperation = message.contents;
            switch (op.type) {
                case "write":
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
        // Update if it's a new register or the write attempt was not concurrent (ref seq >= sequence number)
        if (!this.data.has(op.key) || message.referenceSequenceNumber >= this.data.get(op.key).sequenceNumber) {
            const value: ILocalRegister = {
                sequenceNumber: message.sequenceNumber,
                value: op.value,
            };
            this.data.set(op.key, value);
            this.emit("valueChanged", { key: op.key }, local, message);
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
}

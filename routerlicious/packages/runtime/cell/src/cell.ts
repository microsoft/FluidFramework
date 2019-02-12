import {
    OperationType,
    SharedObject,
} from "@prague/api-definitions";
import {
    FileMode,
    IDocumentMessage,
    ISequencedDocumentMessage,
    ITree,
    TreeEntry,
} from "@prague/container-definitions";
import {
    IObjectStorageService,
    IRuntime,
} from "@prague/runtime-definitions";
import { debug } from "./debug";
import { CellExtension } from "./extension";
import { ICell } from "./interfaces";

/**
 * Description of a cell delta operation
 */
interface ICellOperation {
    type: string;
    value?: ICellValue;
}

/**
 * Cell snapshot definition
 */
export interface ICellSnapshot {
    minimumSequenceNumber: number;
    offset: number;
    sequenceNumber: number;
    snapshot: any;
}

export enum CellValueType {
    // The value is another shared object
    Shared,

    // The value is a plain JavaScript object
    Plain,
}

export interface ICellValue {
    // The type of the value
    type: string;

    // The actual value
    value: any;
}

const snapshotFileName = "header";

/**
 * Implementation of a cell shared object
 */
export class Cell extends SharedObject implements ICell {
    private data: any;

    /**
     * Constructs a new shared cell. If the object is non-local an id and service interfaces will
     * be provided
     */
    constructor(id: string, runtime: IRuntime) {
        super(id, runtime, CellExtension.Type);
    }

    /**
     * Retrieves the value of the cell.
     */
    public async get() {
        return this.data;
    }

    /**
     * Sets the value of the cell.
     */
    public async set(value: any): Promise<void> {
        let operationValue: ICellValue;
        /* tslint:disable:no-unsafe-any */
        if (value instanceof SharedObject) {
            // Convert any local shared objects to our internal storage format
            if (!this.isLocal()) {
                value.attach();
            }

            operationValue = {
                type: CellValueType[CellValueType.Shared],
                value: value.id,
            };
        } else {
            operationValue = {
                type: CellValueType[CellValueType.Plain],
                value,
            };
        }

        const op: ICellOperation = {
            type: "setCell",
            value: operationValue,
        };

        this.setCore(value);
        this.submitIfAttached(op);
    }

    // Deletes the value from the cell.
    public async delete(): Promise<void> {
        const op: ICellOperation = {
            type: "deleteCell",
        };

        this.deleteCore();
        this.submitIfAttached(op);
    }

    // tslint:disable-next-line:promise-function-async
    public ready(): Promise<void> {
        return Promise.resolve();
    }

    /**
     * Returns whether cell is empty or not.
     */
    public async empty() {
        return this.data === undefined ? true : false;
    }

    public snapshot(): ITree {
        // Get a serializable form of data
        let content: ICellValue;
        if (this.data instanceof SharedObject) {
            content = {
                type: CellValueType[CellValueType.Shared],
                value: this.data.id, // (this.data as ISharedObject).id,
            };
        } else {
            content = {
                type: CellValueType[CellValueType.Plain],
                value: this.data,
            };
        }

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
        };

        return tree;
    }

    public transform(message: IDocumentMessage, sequenceNumber: number): IDocumentMessage {
        return message;
    }

    protected async loadCore(
        sequenceNumber: number,
        minimumSequenceNumber: number,
        messages: IDocumentMessage[],
        headerOrigin: string,
        storage: IObjectStorageService): Promise<void> {

        const rawContent = await storage.read(snapshotFileName);

        // tslint:disable-next-line:strict-boolean-expressions
        const content = rawContent
            ? JSON.parse(Buffer.from(rawContent, "base64")
                .toString("utf-8")) as ICellValue
            : { type: CellValueType[CellValueType.Plain], value: undefined };

        this.data = content.type === CellValueType[CellValueType.Shared]
            ? await this.runtime.getChannel(content.value)
            : content.value;
    }

    protected initializeLocalCore() {
        this.data = undefined;
    }

    protected attachCore() {
        return;
    }

    protected onDisconnect() {
        debug(`Cell ${this.id} is now disconnected`);
    }

    protected onConnect(pending: IDocumentMessage[]) {
        for (const message of pending) {
            this.submitLocalMessage(message.contents);
        }

        return;
    }

    protected async prepareCore(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        if (message.type === OperationType && !local) {
            const op: ICellOperation = message.contents;
            if (op.type === "setCell") {
                /* tslint:disable:no-return-await */
                return op.value.type === CellValueType[CellValueType.Shared]
                    ? await this.runtime.getChannel(op.value.value)
                    : op.value.value;
            }
        }
    }

    protected processCore(message: ISequencedDocumentMessage, local: boolean, context: any) {
        if (message.type === OperationType && !local) {
            const op: ICellOperation = message.contents;

            switch (op.type) {
                case "setCell":
                    this.setCore(context);
                    break;

                case "deleteCell":
                    this.deleteCore();
                    break;

                default:
                    throw new Error("Unknown operation");
            }
        }
    }

    protected processMinSequenceNumberChanged(value: number) {
        return;
    }

    private submitIfAttached(message) {
        if (this.isLocal()) {
            return;
        }

        this.submitLocalMessage(message);
    }

    private setCore(value: any) {
        this.data = value;
        this.emit("valueChanged", value);
    }

    private deleteCore() {
        this.data = undefined;
        this.emit("delete");
    }
}

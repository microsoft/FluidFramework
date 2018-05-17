import hasIn = require("lodash/hasIn");
import * as api from "../api-core";
import { ICell } from "../data-types";
import { debug } from "./debug";
import { CellExtension } from "./extension";

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
};

export enum CellValueType {
    // The value is another collaborative object
    Collaborative,

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
 * Implementation of a cell collaborative object
 */
export class Cell extends api.CollaborativeObject implements ICell {
    private data: any;

    /**
     * Constructs a new collaborative cell. If the object is non-local an id and service interfaces will
     * be provided
     */
    constructor(id: string, document: api.IDocument) {
        super(id, document, CellExtension.Type);
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
        if (hasIn(value, "__collaborativeObject__")) {
            // Convert any local collaborative objects to our internal storage format
            const collaborativeObject = value as api.ICollaborativeObject;
            if (!this.isLocal()) {
                collaborativeObject.attach();
            }

            operationValue = {
                type: CellValueType[CellValueType.Collaborative],
                value: collaborativeObject.id,
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

    public ready(): Promise<void> {
        return Promise.resolve();
    }

    /**
     * Returns whether cell is empty or not.
     */
    public async empty() {
        return this.data === undefined ? true : false;
    }

    public snapshot(): api.ITree {
        // Get a serializable form of data
        let content: ICellValue;
        if (this.data && hasIn(this.data, "__collaborativeObject__")) {
            content = {
                type: CellValueType[CellValueType.Collaborative],
                value: (this.data as api.ICollaborativeObject).id,
            };
        } else {
            content = {
                type: CellValueType[CellValueType.Plain],
                value: this.data,
            };
        }

        // And then construct the tree for it
        const tree: api.ITree = {
            entries: [
                {
                    path: snapshotFileName,
                    type: api.TreeEntry[api.TreeEntry.Blob],
                    value: {
                        contents: JSON.stringify(content),
                        encoding: "utf-8",
                    },
                },
            ],
        };

        return tree;
    }

    public transform(message: api.IObjectMessage, sequenceNumber: number): api.IObjectMessage {
        return message;
    }

    protected async loadCore(
        sequenceNumber: number,
        minimumSequenceNumber: number,
        messages: api.IObjectMessage[],
        headerOrigin: string,
        storage: api.IObjectStorageService): Promise<void> {

        const rawContent = await storage.read(snapshotFileName);
        const content = rawContent
            ? JSON.parse(Buffer.from(rawContent, "base64").toString("utf-8")) as ICellValue
            : { type: CellValueType[CellValueType.Plain], value: undefined };

        this.data = content.type === CellValueType[CellValueType.Collaborative]
            ? await this.document.get(content.value)
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

    protected onConnect(pending: api.IObjectMessage[]) {
        for (const message of pending) {
            this.submitLocalMessage(message.contents);
        }

        return;
    }

    protected async prepareCore(message: api.ISequencedObjectMessage): Promise<any> {
        if (message.type === api.OperationType && message.clientId !== this.document.clientId) {
            const op: ICellOperation = message.contents;
            if (op.type === "setCell") {
                return op.value.type === CellValueType[CellValueType.Collaborative]
                    ? await this.document.get(op.value.value)
                    : op.value.value;
            }
        }
    }

    protected processCore(message: api.ISequencedObjectMessage, context: any) {
        if (message.type === api.OperationType && message.clientId !== this.document.clientId) {
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

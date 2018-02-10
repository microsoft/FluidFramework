import * as resources from "gitresources";
import hasIn = require("lodash/hasIn");
import * as api from "../api-core";
import { ICell } from "../data-types";
import * as map from "../map";

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

export interface ICollaborativeCellValue {
    // The type of collaborative object
    type: string;

    // The id for the collaborative object
    id: string;
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
class Cell extends map.CollaborativeMap implements ICell {
    // Cell data
    private data: ICellValue;

    /**
     * Constructs a new collaborative cell. If the object is non-local an id and service interfaces will
     * be provided
     */
    constructor(
        document: api.IDocument,
        id: string,
        sequenceNumber: number,
        services?: api.IDistributedObjectServices,
        version?: resources.ICommit,
        header?: string) {

        super(id, document, CellExtension.Type);

        // TODO move me in the right direction
        // this.data = header ? JSON.parse(Buffer.from(header, "base64").toString("utf-8")) : null;
    }

    /**
     * Retrieves the value of the cell.
     */
    public async get() {
        return this.getCore();
    }

    /**
     * Sets the value of the cell.
     */
    public async set(value: any): Promise<void> {
        let operationValue: ICellValue;
        if (hasIn(value, "__collaborativeObject__")) {
            // Convert any local collaborative objects to our internal storage format
            const collaborativeObject = value as api.ICollaborativeObject;

            const collabCellValue: ICollaborativeCellValue = {
                id: collaborativeObject.id,
                type: collaborativeObject.type,
            };

            operationValue = {
                type: CellValueType[CellValueType.Collaborative],
                value: collabCellValue,
            };
        } else {
            operationValue = {
                type: CellValueType[CellValueType.Plain],
                value,
            };
        }

        const op: ICellOperation = {
            type: "set",
            value: operationValue,
        };

        this.setCore(op.value);
        this.submitLocalMessage(op);
    }

    // Deletes the value from the cell.
    public async delete(): Promise<void> {
        const op: ICellOperation = {
            type: "delete",
        };

        this.deleteCore();
        this.submitLocalMessage(op);
    }

    /**
     * Returns whether cell is empty or not.
     */
     public async empty() {
         return this.data === null ? true : false;
     }

    public snapshot(): api.ITree {
        const tree: api.ITree = {
            entries: [
                {
                    path: snapshotFileName,
                    type: api.TreeEntry[api.TreeEntry.Blob],
                    value: {
                        contents: JSON.stringify(this.data),
                        encoding: "utf-8",
                    },
                },
            ],
        };

        return tree;
    }

    protected submitCore(message: api.IObjectMessage) {
        const op = message.contents as ICellOperation;

        // We need to translate any local collaborative object sets to the serialized form
        if (op.type === "set" && op.value.type === CellValueType[CellValueType.Collaborative]) {
            // We need to attach the object prior to submitting the message
            const collabMapValue = op.value.value as ICollaborativeCellValue;
            const collabObject = this.document.get(collabMapValue.id);

            if (collabObject.isLocal()) {
                collabObject.attach();
            }
        }
    }

    protected processCore(message: api.ISequencedObjectMessage) {
        if (message.type === api.OperationType && message.clientId !== this.document.clientId) {
            const op: ICellOperation = message.contents;

            switch (op.type) {
                case "set":
                    this.setCore(op.value);
                    break;
                case "delete":
                    this.deleteCore();
                    break;
                default:
                    throw new Error("Unknown operation");
            }
        }

        this.emit("op", message);
    }

    protected processMinSequenceNumberChanged(value: number) {
        // TODO need our own concept of the zamboni here
    }

    private setCore(value: ICellValue) {
        this.data = value;
        this.emit("valueChanged", this.getCore());
    }

    private deleteCore() {
        this.data = null;
        this.emit("delete");
    }

    private getCore(): any {
        const value = this.data;
        if (value === null) {
            return undefined;
        } else if (value.type === CellValueType[CellValueType.Collaborative]) {
            const collabCellValue = value.value as ICollaborativeCellValue;
            return this.document.get(collabCellValue.id);
        } else {
            return value.value;
        }
    }
}

/**
 * The extension that defines the map
 */
export class CellExtension implements api.IExtension {
    public static Type = "https://graph.microsoft.com/types/cell";

    public type: string = CellExtension.Type;

    public load(
        document: api.IDocument,
        id: string,
        sequenceNumber: number,
        services: api.IDistributedObjectServices,
        version: resources.ICommit,
        headerOrigin: string,
        header: string): ICell {

        return new Cell(document, id, sequenceNumber, services, version, header);
    }

    public create(document: api.IDocument, id: string): ICell {
        return new Cell(document, id, 0);
    }
}

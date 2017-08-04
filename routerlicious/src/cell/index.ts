import * as _ from "lodash";
import * as api from "../api";

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

const snapshotFileName = "value";

/**
 * Implementation of a cell collaborative object
 */
class Cell extends api.CollaborativeObject implements api.ICell {
    // Cell data
    private data: ICellValue;

    /**
     * Constructs a new collaborative cell. If the object is non-local an id and service interfaces will
     * be provided
     */
    constructor(
        document: api.Document,
        id: string,
        services?: api.IDistributedObjectServices,
        version?: string,
        header?: string) {

        const snapshot: ICellSnapshot = services && header
            ? JSON.parse(header)
            : { minimumSequenceNumber: 0, sequenceNumber: 0, snapshot: undefined };
        super(document, id, CellExtension.Type, snapshot.sequenceNumber, snapshot.minimumSequenceNumber, services);

        this.data = snapshot.snapshot;
    }

    /**
     * Retrieves the value of the cell.
     */
    public async get() {
        const value = this.data;
        if (value.type === CellValueType[CellValueType.Collaborative]) {
            const collabCellValue = value.value as ICollaborativeCellValue;
            this.document.get(collabCellValue.id);
        } else {
            return value.value;
        }
    }

    /**
     * Sets the value of the cell.
     */
    public async set(value: any): Promise<void> {
        let operationValue: ICellValue;
        if (_.hasIn(value, "__collaborativeObject__")) {
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

        return this.processLocalOperation(op);
    }

    // Deletes the value from the cell.
    public async delete(): Promise<void> {
        const op: ICellOperation = {
            type: "delete",
        };
        return this.processLocalOperation(op);
    }

    /**
     * Returns whether cell is empty or not.
     */
     public async empty() {
         return this.data === undefined ? true : false;
     }

    public snapshot(): Promise<api.IObject[]> {
        const snapshot = {
            minimumSequenceNumber: this.minimumSequenceNumber,
            sequenceNumber: this.sequenceNumber,
            snapshot: _.clone(this.data),
        };

        return Promise.resolve([{ path: snapshotFileName, data: snapshot}]);
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

    protected processCore(op: ICellOperation) {
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

    private setCore(value: ICellValue) {
        this.data = value;
        this.events.emit("valueChanged", { value });
    }

    private deleteCore() {
        delete this.data;
        this.events.emit("delete");
    }
}

/**
 * The extension that defines the map
 */
export class CellExtension implements api.IExtension {
    public static Type = "https://graph.microsoft.com/types/cell";

    public type: string = CellExtension.Type;

    public load(
        document: api.Document,
        id: string,
        services: api.IDistributedObjectServices,
        version: string,
        header: string): api.ICell {

        return new Cell(document, id, services, version, header);
    }

    public create(document: api.Document, id: string): api.ICell {
        return new Cell(document, id);
    }
}

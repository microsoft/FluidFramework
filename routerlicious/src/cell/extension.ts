import * as api from "../api-core";
import { ICell } from "../data-types";
import { Cell } from "./cell";

/**
 * The extension that defines the map
 */
export class CellExtension implements api.ICollaborativeObjectExtension {
    public static Type = "https://graph.microsoft.com/types/cell";

    public type: string = CellExtension.Type;

    public async load(
        document: api.IDocument,
        id: string,
        sequenceNumber: number,
        minimumSequenceNumber: number,
        messages: api.ISequencedObjectMessage[],
        services: api.IDistributedObjectServices,
        headerOrigin: string): Promise<ICell> {

        const cell = new Cell(id, document);
        await cell.load(sequenceNumber, minimumSequenceNumber, messages, headerOrigin, services);
        return cell;
    }

    public create(document: api.IDocument, id: string): ICell {
        const cell = new Cell(id, document);
        cell.initializeLocal();
        return cell;
    }
}

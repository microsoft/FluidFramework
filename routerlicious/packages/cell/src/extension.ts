import {
    ISequencedObjectMessage,
} from "@prague/runtime-definitions";
import * as api from "../api-core";
import { Cell } from "./cell";
import { ICell } from "./interfaces";

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
        messages: ISequencedObjectMessage[],
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

import * as resources from "gitresources";
import * as api from "../api-core";
import { ICell } from "../data-types";
import { Cell } from "./cell";

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

        const cell = new Cell(id, document);
        cell.load(sequenceNumber, version, header, services);
        return cell;
    }

    public create(document: api.IDocument, id: string): ICell {
        const cell = new Cell(id, document);
        cell.initializeLocal();
        return cell;
    }
}

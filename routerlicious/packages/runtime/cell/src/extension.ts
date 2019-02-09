import { ICollaborativeObjectExtension } from "@prague/api-definitions";
import { IDistributedObjectServices, IRuntime, ISequencedObjectMessage } from "@prague/runtime-definitions";
import { Cell } from "./cell";
import { ICell } from "./interfaces";

/**
 * The extension that defines the map
 */
export class CellExtension implements ICollaborativeObjectExtension {
    public static Type = "https://graph.microsoft.com/types/cell";

    public type: string = CellExtension.Type;

    public async load(
        document: IRuntime,
        id: string,
        sequenceNumber: number,
        minimumSequenceNumber: number,
        messages: ISequencedObjectMessage[],
        services: IDistributedObjectServices,
        headerOrigin: string): Promise<ICell> {

        const cell = new Cell(id, document);
        await cell.load(sequenceNumber, minimumSequenceNumber, messages, headerOrigin, services);
        return cell;
    }

    public create(document: IRuntime, id: string): ICell {
        const cell = new Cell(id, document);
        cell.initializeLocal();
        return cell;
    }
}

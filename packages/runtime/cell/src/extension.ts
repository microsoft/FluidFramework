import { ISharedObjectExtension } from "@prague/api-definitions";
import { IComponentRuntime, IDistributedObjectServices } from "@prague/runtime-definitions";
import { Cell } from "./cell";
import { ICell } from "./interfaces";

/**
 * The extension that defines the map
 */
export class CellExtension implements ISharedObjectExtension {
    public static Type = "https://graph.microsoft.com/types/cell";

    public type: string = CellExtension.Type;
    public readonly snapshotFormatVersion: string = "0.1";

    public async load(
        document: IComponentRuntime,
        id: string,
        minimumSequenceNumber: number,
        services: IDistributedObjectServices,
        headerOrigin: string): Promise<ICell> {

        const cell = new Cell(id, document);
        await cell.load(minimumSequenceNumber, headerOrigin, services);
        return cell;
    }

    public create(document: IComponentRuntime, id: string): ICell {
        const cell = new Cell(id, document);
        cell.initializeLocal();
        return cell;
    }
}

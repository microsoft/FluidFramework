import { ISharedObjectExtension } from "@prague/api-definitions";
import { ISharedMap, IValueType } from "@prague/map";
import { IComponentRuntime, IDistributedObjectServices } from "@prague/runtime-definitions";
import { OwnedSharedMap } from "./ownedMap";

// register default types
const defaultValueTypes = new Array<IValueType<any>>();
export function registerDefaultValueType(type: IValueType<any>) {
    defaultValueTypes.push(type);
}

/**
 * The extension that defines the map
 */
export class OwnedMapExtension implements ISharedObjectExtension {
    public static Type = "https://graph.microsoft.com/types/ownedmap";

    public type: string = OwnedMapExtension.Type;
    public readonly snapshotFormatVersion: string = "0.1";

    public async load(
        runtime: IComponentRuntime,
        id: string,
        minimumSequenceNumber: number,
        services: IDistributedObjectServices,
        headerOrigin: string): Promise<ISharedMap> {

        const map = new OwnedSharedMap(id, runtime, OwnedMapExtension.Type);
        this.registerValueTypes(map, defaultValueTypes);
        await map.load(minimumSequenceNumber, headerOrigin, services);

        return map;
    }

    public create(document: IComponentRuntime, id: string): ISharedMap {
        const map = new OwnedSharedMap(id, document, OwnedMapExtension.Type);
        this.registerValueTypes(map, defaultValueTypes);
        map.initializeLocal();

        return map;
    }

    private registerValueTypes(map: OwnedSharedMap, valueTypes: Array<IValueType<any>>) {
        for (const type of valueTypes) {
            map.registerValueType(type);
        }
    }
}

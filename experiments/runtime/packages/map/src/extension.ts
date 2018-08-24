import * as api from "@prague/api-definitions";
import { IDistributedObjectServices, IRuntime } from "@prague/runtime-definitions";
import { IMap, IValueType } from "./interfaces";
import { CollaborativeMap } from "./map";

// register default types
const defaultValueTypes = new Array<IValueType<any>>();
export function registerDefaultValueType(type: IValueType<any>) {
    defaultValueTypes.push(type);
}

/**
 * The extension that defines the map
 */
export class MapExtension implements api.ICollaborativeObjectExtension {
    public static Type = "https://graph.microsoft.com/types/map";

    public type: string = MapExtension.Type;

    public async load(
        runtime: IRuntime,
        id: string,
        sequenceNumber: number,
        minimumSequenceNumber: number,
        services: IDistributedObjectServices,
        headerOrigin: string): Promise<IMap> {

        const map = new CollaborativeMap(id, runtime, MapExtension.Type);
        this.registerValueTypes(map, defaultValueTypes);
        await map.load(sequenceNumber, minimumSequenceNumber, headerOrigin, services);

        return map;
    }

    public create(document: api.IDocument, id: string): IMap {
        const map = new CollaborativeMap(id, document.runtime, MapExtension.Type);
        this.registerValueTypes(map, defaultValueTypes);
        map.initializeLocal();

        return map;
    }

    private registerValueTypes(map: CollaborativeMap, valueTypes: Array<IValueType<any>>) {
        for (const type of valueTypes) {
            map.registerValueType(type);
        }
    }
}

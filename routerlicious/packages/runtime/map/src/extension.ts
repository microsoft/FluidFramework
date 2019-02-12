import { ISharedObjectExtension } from "@prague/api-definitions";
import { IDistributedObjectServices, IRuntime, ISequencedObjectMessage } from "@prague/runtime-definitions";
import { ISharedMap, IValueType } from "./interfaces";
import { SharedMap } from "./map";

// register default types
const defaultValueTypes = new Array<IValueType<any>>();
export function registerDefaultValueType(type: IValueType<any>) {
    defaultValueTypes.push(type);
}

/**
 * The extension that defines the map
 */
export class MapExtension implements ISharedObjectExtension {
    public static Type = "https://graph.microsoft.com/types/map";

    public type: string = MapExtension.Type;

    public async load(
        runtime: IRuntime,
        id: string,
        sequenceNumber: number,
        minimumSequenceNumber: number,
        messages: ISequencedObjectMessage[],
        services: IDistributedObjectServices,
        headerOrigin: string): Promise<ISharedMap> {

        const map = new SharedMap(id, runtime, MapExtension.Type);
        this.registerValueTypes(map, defaultValueTypes);
        await map.load(sequenceNumber, minimumSequenceNumber, messages, headerOrigin, services);

        return map;
    }

    public create(document: IRuntime, id: string): ISharedMap {
        const map = new SharedMap(id, document, MapExtension.Type);
        this.registerValueTypes(map, defaultValueTypes);
        map.initializeLocal();

        return map;
    }

    private registerValueTypes(map: SharedMap, valueTypes: Array<IValueType<any>>) {
        for (const type of valueTypes) {
            map.registerValueType(type);
        }
    }
}

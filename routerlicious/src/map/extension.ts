import * as resources from "gitresources";
import * as api from "../api-core";
import { IMap, IValueType } from "../data-types";
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
        document: api.IDocument,
        id: string,
        sequenceNumber: number,
        minimumSequenceNumber: number,
        messages: api.ISequencedObjectMessage[],
        services: api.IDistributedObjectServices,
        version: resources.ICommit,
        headerOrigin: string): Promise<IMap> {

        const map = new CollaborativeMap(id, document, MapExtension.Type);
        this.registerValueTypes(map, defaultValueTypes);
        await map.load(sequenceNumber, minimumSequenceNumber, version, messages, headerOrigin, services);

        return map;
    }

    public create(document: api.IDocument, id: string): IMap {
        const map = new CollaborativeMap(id, document, MapExtension.Type);
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

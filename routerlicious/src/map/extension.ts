import * as resources from "gitresources";
import * as api from "../api-core";
import { IMap } from "../data-types";
import { DistributedArrayValueType } from "./array";
import { CounterValueType } from "./counter";
import { CollaborativeMap } from "./map";
import { DistributedSetValueType } from "./set";

/**
 * The extension that defines the map
 */
export class MapExtension implements api.IExtension {
    public static Type = "https://graph.microsoft.com/types/map";

    public type: string = MapExtension.Type;

    public async load(
        document: api.IDocument,
        id: string,
        sequenceNumber: number,
        services: api.IDistributedObjectServices,
        version: resources.ICommit,
        headerOrigin: string): Promise<IMap> {

        const map = new CollaborativeMap(id, document, MapExtension.Type);
        this.registerDefaultValueTypes(map);
        await map.load(sequenceNumber, version, headerOrigin, services);

        return map;
    }

    public create(document: api.IDocument, id: string): IMap {
        const map = new CollaborativeMap(id, document, MapExtension.Type);
        this.registerDefaultValueTypes(map);
        map.initializeLocal();

        return map;
    }

    private registerDefaultValueTypes(map: CollaborativeMap) {
        map.registerValueType(new CounterValueType());
        map.registerValueType(new DistributedSetValueType());
        map.registerValueType(new DistributedArrayValueType());
    }
}

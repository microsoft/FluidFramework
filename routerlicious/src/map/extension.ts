import * as resources from "gitresources";
import * as api from "../api-core";
import { IMap } from "../data-types";
import { CollaborativeMap } from "./map";

/**
 * The extension that defines the map
 */
export class MapExtension implements api.IExtension {
    public static Type = "https://graph.microsoft.com/types/map";

    public type: string = MapExtension.Type;

    public load(
        document: api.IDocument,
        id: string,
        sequenceNumber: number,
        services: api.IDistributedObjectServices,
        version: resources.ICommit,
        headerOrigin: string,
        header: string): IMap {

        const map = new CollaborativeMap(id, document, MapExtension.Type);
        map.load(sequenceNumber, version, header, headerOrigin, services);

        return map;
    }

    public create(document: api.IDocument, id: string): IMap {
        const map = new CollaborativeMap(id, document, MapExtension.Type);
        map.initializeLocal();

        return map;
    }
}

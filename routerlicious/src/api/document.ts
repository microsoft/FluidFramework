import * as uuid from "node-uuid";
import * as mergeTree from "../merge-tree";
import * as extensions from "./extension";
import * as mapExtension from "./map";
import { ICollaborationServices } from "./storage";
import * as types from "./types";

/**
 * A document is a collection of collaborative types.
 */
export class Document {
    /**
     * Constructs a new document from the provided details
     */
    constructor(
        private map: types.IMap,
        private registry: extensions.Registry) {
    }

    /**
     * Constructs a new collaborative object that can be attached to the document
     * @param type the identifier for the collaborative object type
     */
    public create(type: string): types.ICollaborativeObject {
        const extension = this.registry.getExtension(type);
        const object = extension.create(uuid.v4());

        return object;
    }

    /**
     * Creates a new collaborative map
     */
    public createMap(): types.IMap {
        return this.create(mapExtension.MapExtension.Type) as types.IMap;
    }

    /**
     * Creates a new collaborative string
     */
    public createString(): types.ICollaborativeObject {
        return this.create(mergeTree.CollaboritiveStringExtension.Type) as types.ICollaborativeObject;
    }

    /**
     * Retrieves the root collaborative object that the document is based on
     */
    public getRoot(): types.IMap {
        return this.map;
    }

    /**
     * Closes the document and detaches all listeners
     */
    public close() {
        throw new Error("Not yet implemented");
    }
}

// Registered services to use when loading a document
let defaultServices: ICollaborationServices;

// The default registry for extensions
export const defaultRegistry = new extensions.Registry();
defaultRegistry.register(new mapExtension.MapExtension());
defaultRegistry.register(new mergeTree.CollaboritiveStringExtension());

export function registerExtension(extension: extensions.IExtension) {
    defaultRegistry.register(extension);
}

/**
 * Registers the default services to use for interacting with collaborative documents. To simplify the API it is
 * expected that the implementation provider of these will register themselves during startup prior to the user
 * requesting to load a collaborative object.
 */
export function registerDefaultServices(services: ICollaborationServices) {
    defaultServices = services;
}

/**
 * Loads a collaborative object from the server
 */
export async function load(
    id: string,
    registry: extensions.Registry = defaultRegistry,
    services: ICollaborationServices = defaultServices): Promise<Document> {

    // Verify an extensions registry was provided
    if (!registry) {
        throw new Error("No extension registry provided");
    }

    // Verify we have services to load the document with
    if (!services) {
        throw new Error("Services not provided to load call");
    }

    const extension = registry.getExtension(mapExtension.MapExtension.Type);
    const map = extension.load(id, services, registry) as types.IMap;

    return new Document(map, registry);
}

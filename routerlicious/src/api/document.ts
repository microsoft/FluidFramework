import * as extensions from "./extension";
import * as storage from "./storage";
import * as types from "./types";

/**
 * A document is a collection of collaborative types.
 */
export class Document {
    /**
     * Constructs a new document from the provided details
     */
    constructor(private map: types.IMap) {
    }

    /**
     * Constructs a new collaborative object that can be attached to the document
     * @param extension
     */
    public create(extension: extensions.IExtension): any {
        return null;
    }

    /**
     * Retrieves the root collaborative object that the document is based on
     */
    public getRoot(): types.ICollaborativeObject {
        return this.map;
    }

    /**
     * Closes the document and detaches all listeners
     */
    public close() {
        throw new Error("Yuck");
    }
}

export async function load(source: storage.IStorage, name: string): Promise<Document> {
    const details = await source.loadObject(name);

    // The root document type should be a collaborative map
    if (details.object.type !== types.CoreTypes.Map) {
        throw new Error("Unexpected document type");
    }

    const extension = registry.getExtension(details.object.type);
    const map = extension.load(details) as types.IMap;

    return new Document(map);
}

export const registry = new extensions.Registry();

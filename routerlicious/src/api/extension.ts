import { Document } from "./document";
import * as storage from "./storage";
import * as types from "./types";

/**
 * Definitions of a collaborative extensions. Extensions follow a common model but enable custom behavior.
 */
export interface IExtension {
    // String representing the type of the extension
    type: string;

    /**
     * Loads the given distributed object
     */
    load(
        document: Document,
        id: string,
        services: storage.ICollaborationServices,
        registry: Registry): types.ICollaborativeObject;

    /**
     * Creates a local version of the collaborative object.
     */
    create(document: Document, id: string): types.ICollaborativeObject;
}

/**
 * Class that contains a collection of collaboration extensions
 */
export class Registry {
    public extensions: IExtension[] = [];

    private extensionsMap: { [key: string]: IExtension } = {};

    /**
     * Registers a new extension
     * @param extension The extension to register
     */
    public register(extension: IExtension) {
        this.extensions.push(extension);
        this.extensionsMap[extension.type] = extension;
    }

    /**
     * Retrieves the extension with the given id
     * @param id ID for the extension to retrieve
     */
    public getExtension(type: string): IExtension {
        if (!(type in this.extensionsMap)) {
            throw new Error("Extension not found");
        }

        return this.extensionsMap[type];
    }
}

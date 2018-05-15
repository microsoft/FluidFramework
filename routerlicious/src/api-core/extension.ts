import * as resources from "gitresources";
import { IDistributedObjectServices, IDocument } from "./document";
import { ISequencedObjectMessage } from "./protocol";
import * as types from "./types";

export interface IExtension {
    /**
     * String representing the type of the extension.
     */
    type: string;
}
/**
 * Definitions of a collaborative extensions. Extensions follow a common model but enable custom behavior.
 */
export interface ICollaborativeObjectExtension extends IExtension {
    /**
     * Loads the given distributed object. This call is only ever invoked internally as the only thing
     * that is ever directly loaded is the document itself. Load will then only be called on documents that
     * were created and added to a collaborative object.
     *
     * document: The document the object is part of
     * connection: Interface used to retrieve updates from remote clients
     * version: Document version being loaded
     * header: Base64 encoded stored header for a snapshot. Or null if a new data type.
     * storage: Access to the data store to retrieve more information.
     *
     * Thought: should the storage object include the version information and limit access to just files
     * for the given object? The latter seems good in general. But both are probably good things. We then just
     * need a way to allow the document to provide later storage for the object.
     */
    load(
        document: IDocument,
        id: string,
        sequenceNumber: number,
        minimumSequenceNumber: number,
        messages: ISequencedObjectMessage[],
        services: IDistributedObjectServices,
        version: resources.ICommit,
        headerOrigin: string): Promise<types.ICollaborativeObject>;

    /**
     * Creates a local version of the distributive object.
     *
     * Calling attach on the object later will insert it into object stream.
     * NOTE here - When we attach we need to submit all the pending ops prior to actually doing the attach
     * for consistency.
     */
    create(document: IDocument, id: string): types.ICollaborativeObject;
}

export interface IContentModelExtension extends IExtension {
    exec(message: ISequencedObjectMessage, instance: types.ICollaborativeObject);
}

/**
 * Class that contains a collection of collaboration extensions
 */
export class Registry<TExtension extends IExtension> {
    public extensions: TExtension[] = [];

    private extensionsMap: { [key: string]: TExtension } = {};

    /**
     * Registers a new extension
     * @param extension The extension to register
     */
    public register(extension: TExtension) {
        this.extensions.push(extension);
        this.extensionsMap[extension.type] = extension;
    }

    /**
     * Retrieves the extension with the given id
     * @param id ID for the extension to retrieve
     */
    public getExtension(type: string): TExtension {
        if (!(type in this.extensionsMap)) {
            throw new Error("Extension not found");
        }

        return this.extensionsMap[type];
    }
}

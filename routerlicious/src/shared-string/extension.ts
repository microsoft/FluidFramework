// tslint:disable:ban-types
import * as api from "../api-core";
import { SharedString } from "./sharedString";

export class CollaborativeStringExtension implements api.ICollaborativeObjectExtension {
    public static Type = "https://graph.microsoft.com/types/mergeTree";

    public type: string = CollaborativeStringExtension.Type;

    public async load(
        document: api.IDocument,
        id: string,
        sequenceNumber: number,
        minimumSequenceNumber: number,
        messages: api.ISequencedObjectMessage[],
        services: api.IDistributedObjectServices,
        headerOrigin: string): Promise<api.ICollaborativeObject> {

        const collaborativeString = new SharedString(document, id, sequenceNumber, services);
        await collaborativeString.load(sequenceNumber, minimumSequenceNumber, messages, headerOrigin, services);
        return collaborativeString;
    }

    public create(document: api.IDocument, id: string, options?: Object): api.ICollaborativeObject {
        const collaborativeString = new SharedString(document, id, 0);
        collaborativeString.initializeLocal();
        return collaborativeString;
    }
}

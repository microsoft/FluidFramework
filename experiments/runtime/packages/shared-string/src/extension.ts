import * as api from "@prague/api-definitions";
import { IDistributedObjectServices, IRuntime } from "@prague/runtime-definitions";
import { SharedString } from "./sharedString";

export class CollaborativeStringExtension implements api.ICollaborativeObjectExtension {
    public static Type = "https://graph.microsoft.com/types/mergeTree";

    public type: string = CollaborativeStringExtension.Type;

    public async load(
        runtime: IRuntime,
        id: string,
        sequenceNumber: number,
        minimumSequenceNumber: number,
        services: IDistributedObjectServices,
        headerOrigin: string): Promise<api.ICollaborativeObject> {

        const collaborativeString = new SharedString(id, runtime, sequenceNumber, services);
        await collaborativeString.load(sequenceNumber, minimumSequenceNumber, headerOrigin, services);
        return collaborativeString;
    }

    public create(document: api.IDocument, id: string): api.ICollaborativeObject {
        const collaborativeString = new SharedString(id, document.runtime, 0);
        collaborativeString.initializeLocal();
        return collaborativeString;
    }
}

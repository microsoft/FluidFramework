import { ICollaborativeObject, ICollaborativeObjectExtension } from "@prague/api-definitions";
import { IDistributedObjectServices, IRuntime, ISequencedObjectMessage } from "@prague/runtime-definitions";
import { SharedString } from "./sharedString";

export class CollaborativeStringExtension implements ICollaborativeObjectExtension {
    public static Type = "https://graph.microsoft.com/types/mergeTree";

    public type: string = CollaborativeStringExtension.Type;

    public async load(
        document: IRuntime,
        id: string,
        sequenceNumber: number,
        minimumSequenceNumber: number,
        messages: ISequencedObjectMessage[],
        services: IDistributedObjectServices,
        headerOrigin: string): Promise<ICollaborativeObject> {

        const collaborativeString = new SharedString(document, id, sequenceNumber, services);
        await collaborativeString.load(sequenceNumber, minimumSequenceNumber, messages, headerOrigin, services);
        return collaborativeString;
    }

    public create(document: IRuntime, id: string, options?: any): ICollaborativeObject {
        const collaborativeString = new SharedString(document, id, 0);
        collaborativeString.initializeLocal();
        return collaborativeString;
    }
}

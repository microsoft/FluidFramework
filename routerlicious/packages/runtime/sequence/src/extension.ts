import { ISharedObject, ISharedObjectExtension } from "@prague/api-definitions";
import { IDistributedObjectServices, IRuntime, ISequencedObjectMessage } from "@prague/runtime-definitions";
import { SharedNumberSequence, SharedObjectSequence} from "./sequence";
import { SharedString } from "./sharedString";

export class SharedStringExtension implements ISharedObjectExtension {
    // TODO rename back to https://graph.microsoft.com/types/mergeTree/string once paparazzi is able to dynamically
    // load code
    public static Type = "https://graph.microsoft.com/types/mergeTree";

    public type: string = SharedStringExtension.Type;

    public async load(
        document: IRuntime,
        id: string,
        sequenceNumber: number,
        minimumSequenceNumber: number,
        messages: ISequencedObjectMessage[],
        services: IDistributedObjectServices,
        headerOrigin: string): Promise<ISharedObject> {

        const sharedString = new SharedString(document, id, sequenceNumber, services);
        await sharedString.load(sequenceNumber, minimumSequenceNumber, messages, headerOrigin, services);
        return sharedString;
    }

    public create(document: IRuntime, id: string, options?: any): ISharedObject {
        const sharedString = new SharedString(document, id, 0);
        sharedString.initializeLocal();
        return sharedString;
    }
}

export class SharedObjectSequenceExtension implements ISharedObjectExtension {
    public static Type = "https://graph.microsoft.com/types/mergeTree/object-sequence";

    public type: string = SharedObjectSequenceExtension.Type;

    public async load(
        document: IRuntime,
        id: string,
        sequenceNumber: number,
        minimumSequenceNumber: number,
        messages: ISequencedObjectMessage[],
        services: IDistributedObjectServices,
        headerOrigin: string): Promise<ISharedObject> {

        const sharedSeq = new SharedObjectSequence<object>(document, id, sequenceNumber, services);
        await sharedSeq.load(sequenceNumber, minimumSequenceNumber, messages, headerOrigin, services);
        return sharedSeq;
    }

    public create(document: IRuntime, id: string, options?: any): ISharedObject {
        const sharedString = new SharedObjectSequence(document, id, 0);
        sharedString.initializeLocal();
        return sharedString;
    }
}

export class SharedNumberSequenceExtension implements ISharedObjectExtension {
    public static Type = "https://graph.microsoft.com/types/mergeTree/number-sequence";

    public type: string = SharedNumberSequenceExtension.Type;

    public async load(
        document: IRuntime,
        id: string,
        sequenceNumber: number,
        minimumSequenceNumber: number,
        messages: ISequencedObjectMessage[],
        services: IDistributedObjectServices,
        headerOrigin: string): Promise<ISharedObject> {

        const sharedSeq = new SharedNumberSequence(document, id, sequenceNumber, services);
        await sharedSeq.load(sequenceNumber, minimumSequenceNumber, messages, headerOrigin, services);
        return sharedSeq;
    }

    public create(document: IRuntime, id: string, options?: any): ISharedObject {
        const sharedString = new SharedNumberSequence(document, id, 0);
        sharedString.initializeLocal();
        return sharedString;
    }
}

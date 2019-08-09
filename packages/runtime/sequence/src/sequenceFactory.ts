/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentRuntime, ISharedObjectServices } from "@prague/runtime-definitions";
import { ISharedObject, ISharedObjectFactory } from "@prague/shared-object-common";
import { SharedNumberSequence} from "./sharedNumberSequence";
import { SharedObjectSequence} from "./sharedObjectSequence";
import { SharedString } from "./sharedString";

export class SharedStringFactory implements ISharedObjectFactory {
    // TODO rename back to https://graph.microsoft.com/types/mergeTree/string once paparazzi is able to dynamically
    // load code
    public static Type = "https://graph.microsoft.com/types/mergeTree";

    public type: string = SharedStringFactory.Type;
    public readonly snapshotFormatVersion: string = "0.1";

    public async load(
        document: IComponentRuntime,
        id: string,
        minimumSequenceNumber: number,
        services: ISharedObjectServices,
        headerOrigin: string): Promise<ISharedObject> {

        const sharedString = new SharedString(document, id);
        await sharedString.load(minimumSequenceNumber, headerOrigin, services);
        return sharedString;
    }

    public create(document: IComponentRuntime, id: string): ISharedObject {
        const sharedString = new SharedString(document, id);
        sharedString.initializeLocal();
        return sharedString;
    }
}

export class SharedObjectSequenceFactory implements ISharedObjectFactory {
    public static Type = "https://graph.microsoft.com/types/mergeTree/object-sequence";

    public type: string = SharedObjectSequenceFactory.Type;
    public readonly snapshotFormatVersion: string = "0.1";

    public async load(
        document: IComponentRuntime,
        id: string,
        minimumSequenceNumber: number,
        services: ISharedObjectServices,
        headerOrigin: string): Promise<ISharedObject> {

        const sharedSeq = new SharedObjectSequence<object>(document, id);
        await sharedSeq.load(minimumSequenceNumber, headerOrigin, services);
        return sharedSeq;
    }

    public create(document: IComponentRuntime, id: string): ISharedObject {
        const sharedString = new SharedObjectSequence(document, id);
        sharedString.initializeLocal();
        return sharedString;
    }
}

export class SharedNumberSequenceFactory implements ISharedObjectFactory {
    public static Type = "https://graph.microsoft.com/types/mergeTree/number-sequence";

    public type: string = SharedNumberSequenceFactory.Type;
    public readonly snapshotFormatVersion: string = "0.1";

    public async load(
        document: IComponentRuntime,
        id: string,
        minimumSequenceNumber: number,
        services: ISharedObjectServices,
        headerOrigin: string): Promise<ISharedObject> {

        const sharedSeq = new SharedNumberSequence(document, id);
        await sharedSeq.load(minimumSequenceNumber, headerOrigin, services);
        return sharedSeq;
    }

    public create(document: IComponentRuntime, id: string): ISharedObject {
        const sharedString = new SharedNumberSequence(document, id);
        sharedString.initializeLocal();
        return sharedString;
    }
}

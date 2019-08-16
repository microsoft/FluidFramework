/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannelAttributes, IComponentRuntime, ISharedObjectServices } from "@prague/runtime-definitions";
import { ISharedObject, ISharedObjectFactory } from "@prague/shared-object-common";
import { pkgVersion } from "./packageVersion";
import { SharedNumberSequence } from "./sharedNumberSequence";
import { SharedObjectSequence } from "./sharedObjectSequence";
import { SharedString } from "./sharedString";

export class SharedStringFactory implements ISharedObjectFactory {
    // TODO rename back to https://graph.microsoft.com/types/mergeTree/string once paparazzi is able to dynamically
    // load code
    public static Type = "https://graph.microsoft.com/types/mergeTree";

    public static Attributes: IChannelAttributes = {
        type: SharedStringFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: pkgVersion,
    };

    public get type() {
        return SharedStringFactory.Type;
    }

    public get attributes() {
        return SharedStringFactory.Attributes;
    }

    public async load(
        document: IComponentRuntime,
        id: string,
        services: ISharedObjectServices,
        branchId: string): Promise<ISharedObject> {

        const sharedString = new SharedString(document, id);
        await sharedString.load(branchId, services);
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

    public static Attributes: IChannelAttributes = {
        type: SharedObjectSequenceFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: pkgVersion,
    };

    public get type() {
        return SharedObjectSequenceFactory.Type;
    }

    public get attributes() {
        return SharedObjectSequenceFactory.Attributes;
    }

    public async load(
        document: IComponentRuntime,
        id: string,
        services: ISharedObjectServices,
        branchId: string): Promise<ISharedObject> {

        const sharedSeq = new SharedObjectSequence<object>(document, id);
        await sharedSeq.load(branchId, services);
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

    public static Attributes: IChannelAttributes = {
        type: SharedNumberSequenceFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: pkgVersion,
    };

    public get type() {
        return SharedNumberSequenceFactory.Type;
    }

    public get attributes() {
        return SharedNumberSequenceFactory.Attributes;
    }

    public async load(
        document: IComponentRuntime,
        id: string,
        services: ISharedObjectServices,
        branchId: string): Promise<ISharedObject> {

        const sharedSeq = new SharedNumberSequence(document, id);
        await sharedSeq.load(branchId, services);
        return sharedSeq;
    }

    public create(document: IComponentRuntime, id: string): ISharedObject {
        const sharedString = new SharedNumberSequence(document, id);
        sharedString.initializeLocal();
        return sharedString;
    }
}

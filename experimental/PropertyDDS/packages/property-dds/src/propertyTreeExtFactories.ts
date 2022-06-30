/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { deflate, inflate } from "pako";
import { bufferToString, stringToBuffer } from "@fluidframework/common-utils";
import {
    IChannelAttributes,
    IFluidDataStoreRuntime,
    IChannelServices,
    IChannelFactory,
} from "@fluidframework/datastore-definitions";
import { IPropertyTreeMessage, ISharedPropertyTreeEncDec, ISnapshotSummary, SharedPropertyTreeOptions }
from "./propertyTree";
import { DeflatedPropertyTree } from "./propertyTreeExt";

function encodeSummary(snapshotSummary: ISnapshotSummary) {
    const summaryStr = JSON.stringify(snapshotSummary);
    const unzipped = new TextEncoder().encode(summaryStr);
    const serializedSummary: Buffer = deflate(unzipped);
    return serializedSummary;
}

function decodeSummary(serializedSummary): ISnapshotSummary {
    const unzipped = inflate(serializedSummary);
    const summaryStr = new TextDecoder().decode(unzipped);
    const snapshotSummary: ISnapshotSummary = JSON.parse(summaryStr);
    return snapshotSummary;
}

function encodeMessage(change: IPropertyTreeMessage) {
    const changeSetStr = JSON.stringify(change.changeSet);
    const unzipped = new TextEncoder().encode(changeSetStr);
    const zipped: Buffer = deflate(unzipped);
    const zippedStr = bufferToString(zipped, "base64");
    if (zippedStr.length < changeSetStr.length) {
        // eslint-disable-next-line @typescript-eslint/dot-notation
        change["isZipped"] = "1";
        change.changeSet = zippedStr;
    }
    return change;
}

function decodeMessage(transferChange: IPropertyTreeMessage) {
    // eslint-disable-next-line @typescript-eslint/dot-notation
    if (transferChange["isZipped"]) {
        const zipped = stringToBuffer(transferChange.changeSet, "base64");
        const unzipped = inflate(zipped);
        const changeSetStr = new TextDecoder().decode(unzipped);
        transferChange.changeSet = JSON.parse(changeSetStr);
    }
    return transferChange;
}

const encDec: ISharedPropertyTreeEncDec = {
    messageEncoder: {
        encode: encodeMessage,
        decode: decodeMessage,
    },
    summaryEncoder: {
        encode: encodeSummary,
        decode: decodeSummary,
    },
};

export class DeflatedPropertyTreeFactory implements IChannelFactory {
    public static readonly Type = "DeflatedPropertyTree:84534a0fe613522101f6";

    public static readonly Attributes: IChannelAttributes = {
        type: DeflatedPropertyTreeFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: "0.0.1",
    };

    public get type() {
        return DeflatedPropertyTreeFactory.Type;
    }

    public get attributes() {
        return DeflatedPropertyTreeFactory.Attributes;
    }

    public async load(
        runtime: IFluidDataStoreRuntime,
        id: string,
        services: IChannelServices,
        attributes: IChannelAttributes,
        url?: string,
    ): Promise<DeflatedPropertyTree> {
        const options = {};
        const instance = new DeflatedPropertyTree(id, runtime, attributes, options as SharedPropertyTreeOptions
            , { encDec });
        await instance.load(services);
        return instance;
    }

    public create(document: IFluidDataStoreRuntime, id: string, requestUrl?: string): DeflatedPropertyTree {
        const options = {};
        const cell = new DeflatedPropertyTree(id, document,
            this.attributes, options as SharedPropertyTreeOptions, { encDec });
        cell.initializeLocal();
        return cell;
    }
}

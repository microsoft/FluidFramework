/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SerializedChangeSet } from "@fluid-experimental/property-changeset";
import { IChannelFactory, IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { deflate, inflate } from "pako";
import { bufferToString, stringToBuffer } from "@fluidframework/common-utils";
import { IPropertyTreeMessage, ISnapshotSummary, SharedPropertyTree } from "./propertyTree";
import { CompressedCommPropertyTreeFactory } from "./propertyTreeExtFactories";

/**
 * This class is the extension of SharedPropertyTree which compresses
 * the deltas and summaries communicated to the server.
 */
export class CompressedCommPropertyTree extends SharedPropertyTree {
    protected override serializeSummary(snapshotSummary: ISnapshotSummary) {
        const summaryStr = JSON.stringify(snapshotSummary);
        const unzipped = new TextEncoder().encode(summaryStr);
        const serializedSummary: Buffer = deflate(unzipped);
        return serializedSummary;
    }

    protected override deserializeSummary(serializedSummary): ISnapshotSummary {
        const unzipped = inflate(serializedSummary);
        const summaryStr = new TextDecoder().decode(unzipped);
        const snapshotSummary: ISnapshotSummary = JSON.parse(summaryStr);
        return snapshotSummary;
    }

    protected override toTransferChange(change: IPropertyTreeMessage) {
        const changeSetStr = JSON.stringify(change.changeSet);
        const unzipped = new TextEncoder().encode(changeSetStr);
        const zipped: Buffer = deflate(unzipped);
        const zippedStr = bufferToString(zipped, "base64");
        if (zippedStr.length < changeSetStr.length) {
            // eslint-disable-next-line @typescript-eslint/dot-notation
            change["isZipped"] = "1";
            change.changeSet = zippedStr;
        }
    }

    protected override fromTransferChange(transferChange: IPropertyTreeMessage) {
        // eslint-disable-next-line @typescript-eslint/dot-notation
        if (transferChange["isZipped"]) {
            const zipped = stringToBuffer(transferChange.changeSet, "base64");
            const unzipped = inflate(zipped);
            const changeSetStr = new TextDecoder().decode(unzipped);
            transferChange.changeSet = JSON.parse(changeSetStr);
        }
    }

    protected override logIfEnabled(message) {
        console.log(message);
    }

    /*
    protected override encodeSummaryBlob(blob: ArrayBuffer): any {
        return blob;
    }
    protected override decodeSummaryBlob(encoded: any): ArrayBuffer {
        return encoded as ArrayBuffer;
    }
    */

    public static create(runtime: IFluidDataStoreRuntime, id?: string, queryString?: string) {
        return runtime.createChannel(id, CompressedCommPropertyTreeFactory.Type) as CompressedCommPropertyTree;
    }

    public static getFactory(): IChannelFactory {
        return new CompressedCommPropertyTreeFactory();
    }
}

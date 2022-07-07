/* eslint-disable @typescript-eslint/no-unsafe-return */
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { deflate, inflate } from "pako";
import { compress, decompress } from "lz4js";
import { bufferToString, stringToBuffer } from "@fluidframework/common-utils";
import {
    IChannelAttributes,
    IFluidDataStoreRuntime,
    IChannelServices,
    IChannelFactory,
    IChannel,
} from "@fluidframework/datastore-definitions";
import {
    IPropertyTreeConfig, IPropertyTreeMessage, ISharedPropertyTreeEncDec,
    ISnapshotSummary, SharedPropertyTree, SharedPropertyTreeOptions,
}
    from "./propertyTree";
import { DeflatedPropertyTree, LZ4PropertyTree } from "./propertyTreeExt";

/**
 * This class contains builders of the compression methods used to compress
 * of summaries and messages with the plugable compression algorithm.
 */
class CompressionMethods {
    public constructor(private readonly encodeFn, private readonly decodeFn) { }

    private buildEncodeSummary() {
        return (snapshotSummary: ISnapshotSummary): Buffer => {
            const summaryStr = JSON.stringify(snapshotSummary);
            const unzipped = new TextEncoder().encode(summaryStr);
            const serializedSummary: Buffer = this.encodeFn(unzipped);
            return serializedSummary;
        };
    }

    private buildDecodeSummary() {
        return (serializedSummary): ISnapshotSummary => {
            const unzipped = this.decodeFn(serializedSummary);
            const summaryStr = new TextDecoder().decode(unzipped);
            const snapshotSummary: ISnapshotSummary = JSON.parse(summaryStr);
            return snapshotSummary;
        };
    }

    private buildEncodeMessage() {
        return (change: IPropertyTreeMessage) => {
            const changeSetStr = JSON.stringify(change.changeSet);
            const unzipped = new TextEncoder().encode(changeSetStr);
            const zipped: Buffer = this.encodeFn(unzipped);
            const zippedStr = bufferToString(zipped, "base64");
            if (zippedStr.length < changeSetStr.length) {
                // eslint-disable-next-line @typescript-eslint/dot-notation
                change["isZipped"] = "1";
                change.changeSet = zippedStr;
            }
            return change;
        };
    }

    private buildDecodeMessage() {
        return (transferChange: IPropertyTreeMessage) => {
            // eslint-disable-next-line @typescript-eslint/dot-notation
            if (transferChange["isZipped"]) {
                const zipped = new Uint8Array(stringToBuffer(transferChange.changeSet, "base64"));
                const unzipped = this.decodeFn(zipped);
                const changeSetStr = new TextDecoder().decode(unzipped);
                transferChange.changeSet = JSON.parse(changeSetStr);
            }
            return transferChange;
        };
    }

    public buildEncDec(): ISharedPropertyTreeEncDec {
        return {
            messageEncoder: {
                encode: this.buildEncodeMessage(),
                decode: this.buildDecodeMessage(),
            },
            summaryEncoder: {
                encode: this.buildEncodeSummary(),
                decode: this.buildDecodeSummary(),
            },
        };
    }
}

export abstract class CompressedPropertyTreeFactory implements IChannelFactory {
    public abstract get attributes();
    public abstract get type();
    public abstract getEncodeFce();
    public abstract getDecodeFce();
    public getEncDec(): ISharedPropertyTreeEncDec {
        const compressionMeths = new CompressionMethods(this.getEncodeFce(), this.getDecodeFce());
        return compressionMeths.buildEncDec();
    }
    public abstract newPropertyTree(
        id: string,
        runtime: IFluidDataStoreRuntime,
        attributes: IChannelAttributes,
        options: SharedPropertyTreeOptions,
        propertyTreeConfig: IPropertyTreeConfig): SharedPropertyTree;

    public async load(
        runtime: IFluidDataStoreRuntime,
        id: string,
        services: IChannelServices,
        attributes: IChannelAttributes,
        url?: string,
    ): Promise<SharedPropertyTree> {
        const options = {};
        const instance = this.newPropertyTree(id, runtime, attributes,
            options as SharedPropertyTreeOptions
            , { encDec: this.getEncDec() });
        await instance.load(services);
        return instance;
    }

    public create(document: IFluidDataStoreRuntime, id: string, requestUrl?: string): SharedPropertyTree {
        const options = {};
        const cell = this.newPropertyTree(id, document,
            this.attributes, options as SharedPropertyTreeOptions,
            { encDec: this.getEncDec() });
        cell.initializeLocal();
        return cell;
    }
}

export class DeflatedPropertyTreeFactory extends CompressedPropertyTreeFactory {
    public static readonly Type = "DeflatedPropertyTree:84534a0fe613522101f6";

    public static readonly Attributes: IChannelAttributes = {
        type: DeflatedPropertyTreeFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: "0.0.1",
    };

    public async load(
        runtime: IFluidDataStoreRuntime,
        id: string,
        services: IChannelServices,
        attributes: IChannelAttributes,
        url?: string,
    ): Promise<DeflatedPropertyTree> {
        return await super.load(runtime, id, services, attributes, url) as DeflatedPropertyTree;
    }

    public create(document: IFluidDataStoreRuntime, id: string, requestUrl?: string): DeflatedPropertyTree {
        return super.create(document, id, requestUrl);
    }

    public get type() {
        return DeflatedPropertyTreeFactory.Type;
    }

    public get attributes() {
        return DeflatedPropertyTreeFactory.Attributes;
    }

    public getEncodeFce() { return deflate; }
    public getDecodeFce() { return inflate; }
    public newPropertyTree(
        id: string,
        runtime: IFluidDataStoreRuntime,
        attributes: IChannelAttributes,
        options: SharedPropertyTreeOptions,
        propertyTreeConfig: IPropertyTreeConfig): SharedPropertyTree {
        return new DeflatedPropertyTree(id, runtime, attributes, options, propertyTreeConfig);
    }
}

export class LZ4PropertyTreeFactory extends CompressedPropertyTreeFactory {
    public static readonly Type = "LZ4PropertyTree:84534a0fe613522101f6";

    public static readonly Attributes: IChannelAttributes = {
        type: LZ4PropertyTreeFactory.Type,
        snapshotFormatVersion: "0.1",
        packageVersion: "0.0.1",
    };

    public async load(
        runtime: IFluidDataStoreRuntime,
        id: string,
        services: IChannelServices,
        attributes: IChannelAttributes,
        url?: string,
    ): Promise<LZ4PropertyTree> {
        return await super.load(runtime, id, services, attributes, url) as DeflatedPropertyTree;
    }

    public create(document: IFluidDataStoreRuntime, id: string, requestUrl?: string): LZ4PropertyTree {
        return super.create(document, id, requestUrl);
    }

    public get type() {
        return DeflatedPropertyTreeFactory.Type;
    }

    public get attributes() {
        return DeflatedPropertyTreeFactory.Attributes;
    }

    public getEncodeFce() { return compress; }
    public getDecodeFce() { return decompress; }
    public newPropertyTree(
        id: string,
        runtime: IFluidDataStoreRuntime,
        attributes: IChannelAttributes,
        options: SharedPropertyTreeOptions,
        propertyTreeConfig: IPropertyTreeConfig): SharedPropertyTree {
        return new LZ4PropertyTree(id, runtime, attributes, options, propertyTreeConfig);
    }
}

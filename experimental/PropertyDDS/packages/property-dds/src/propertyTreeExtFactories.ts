/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-return */

import { bufferToString, stringToBuffer } from "@fluid-internal/client-utils";
import {
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
	IChannelServices,
} from "@fluidframework/datastore-definitions/internal";
import { compress, decompress } from "lz4js";
import { deflate, inflate } from "pako";

import {
	IPropertyTreeConfig,
	IPropertyTreeMessage,
	ISharedPropertyTreeEncDec,
	ISnapshotSummary,
	SharedPropertyTree,
	SharedPropertyTreeOptions,
} from "./propertyTree.js";
import { DeflatedPropertyTree, LZ4PropertyTree } from "./propertyTreeExt.js";

/**
 * @internal
 */
export abstract class CompressedPropertyTreeFactory implements IChannelFactory {
	public abstract get attributes();
	public abstract get type();
	public abstract getEncodeFce();
	public abstract getDecodeFce();
	private createCompressionMethods(encodeFn, decodeFn): ISharedPropertyTreeEncDec {
		return {
			messageEncoder: {
				encode: (change: IPropertyTreeMessage) => {
					const changeSetStr = JSON.stringify(change.changeSet);
					const unzipped = new TextEncoder().encode(changeSetStr);
					const zipped: Buffer = encodeFn(unzipped);
					const zippedStr = bufferToString(zipped, "base64");
					if (zippedStr.length < changeSetStr.length) {
						// eslint-disable-next-line @typescript-eslint/dot-notation
						change["isZipped"] = "1";
						change.changeSet = zippedStr;
					}
					return change;
				},
				decode: (transferChange: IPropertyTreeMessage) => {
					// eslint-disable-next-line @typescript-eslint/dot-notation
					if (transferChange["isZipped"]) {
						const zipped = new Uint8Array(stringToBuffer(transferChange.changeSet, "base64"));
						const unzipped = decodeFn(zipped);
						const changeSetStr = new TextDecoder().decode(unzipped);
						transferChange.changeSet = JSON.parse(changeSetStr);
					}
					return transferChange;
				},
			},
			summaryEncoder: {
				encode: (snapshotSummary: ISnapshotSummary): Buffer => {
					const summaryStr = JSON.stringify(snapshotSummary);
					const unzipped = new TextEncoder().encode(summaryStr);
					const serializedSummary: Buffer = encodeFn(unzipped);
					return serializedSummary;
				},
				decode: (serializedSummary): ISnapshotSummary => {
					const unzipped = decodeFn(serializedSummary);
					const summaryStr = new TextDecoder().decode(unzipped);
					const snapshotSummary: ISnapshotSummary = JSON.parse(summaryStr);
					return snapshotSummary;
				},
			},
		};
	}
	public getEncDec(): ISharedPropertyTreeEncDec {
		return this.createCompressionMethods(this.getEncodeFce(), this.getDecodeFce());
	}
	public abstract newPropertyTree(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
		options: SharedPropertyTreeOptions,
		propertyTreeConfig: IPropertyTreeConfig,
	): SharedPropertyTree;

	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
		url?: string,
	): Promise<SharedPropertyTree> {
		const options = {};
		const instance = this.newPropertyTree(
			id,
			runtime,
			attributes,
			options as SharedPropertyTreeOptions,
			{ encDec: this.getEncDec() },
		);
		await instance.load(services);
		return instance;
	}

	public create(
		document: IFluidDataStoreRuntime,
		id: string,
		requestUrl?: string,
	): SharedPropertyTree {
		const options = {};
		const cell = this.newPropertyTree(
			id,
			document,
			this.attributes,
			options as SharedPropertyTreeOptions,
			{ encDec: this.getEncDec() },
		);
		cell.initializeLocal();
		return cell;
	}
}

/**
 * @internal
 */
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
		return (await super.load(runtime, id, services, attributes, url)) as DeflatedPropertyTree;
	}

	public create(
		document: IFluidDataStoreRuntime,
		id: string,
		requestUrl?: string,
	): DeflatedPropertyTree {
		return super.create(document, id, requestUrl);
	}

	public get type() {
		return DeflatedPropertyTreeFactory.Type;
	}

	public get attributes() {
		return DeflatedPropertyTreeFactory.Attributes;
	}

	public getEncodeFce() {
		return deflate;
	}
	public getDecodeFce() {
		return inflate;
	}
	public newPropertyTree(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
		options: SharedPropertyTreeOptions,
		propertyTreeConfig: IPropertyTreeConfig,
	): SharedPropertyTree {
		return new DeflatedPropertyTree(id, runtime, attributes, options, propertyTreeConfig);
	}
}

/**
 * @internal
 */
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
		return (await super.load(runtime, id, services, attributes, url)) as LZ4PropertyTree;
	}

	public create(
		document: IFluidDataStoreRuntime,
		id: string,
		requestUrl?: string,
	): LZ4PropertyTree {
		return super.create(document, id, requestUrl);
	}

	public get type() {
		return LZ4PropertyTreeFactory.Type;
	}

	public get attributes() {
		return LZ4PropertyTreeFactory.Attributes;
	}

	public getEncodeFce() {
		return compress;
	}
	public getDecodeFce() {
		return decompress;
	}
	public newPropertyTree(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
		options: SharedPropertyTreeOptions,
		propertyTreeConfig: IPropertyTreeConfig,
	): SharedPropertyTree {
		return new LZ4PropertyTree(id, runtime, attributes, options, propertyTreeConfig);
	}
}

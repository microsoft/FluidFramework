/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IChannelAttributes,
	IFluidDataStoreRuntime,
	IChannelServices,
	IChannelFactory,
} from "@fluidframework/datastore-definitions";
import { SharedPropertyTree, SharedPropertyTreeOptions } from "./propertyTree";

/**
 * The factory that defines the map
 */
export class PropertyTreeFactory implements IChannelFactory {
	public static readonly Type = "PropertyTree:01EP5J4Y6C284JR6ATVPPHRJ4E";

	public static readonly Attributes: IChannelAttributes = {
		type: PropertyTreeFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: "0.1",
	};

	public get type() {
		return PropertyTreeFactory.Type;
	}

	public get attributes() {
		return PropertyTreeFactory.Attributes;
	}

	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
		url?: string,
	): Promise<SharedPropertyTree> {
		const options = {};
		// default object
		const instance = new SharedPropertyTree(id, runtime, attributes, options as SharedPropertyTreeOptions);
		await instance.load(services);
		return instance;
	}

	public create(document: IFluidDataStoreRuntime, id: string, requestUrl?: string): SharedPropertyTree {
		const options = {};
		const cell = new SharedPropertyTree(id, document, this.attributes, options as SharedPropertyTreeOptions);

		cell.initializeLocal();
		return cell;
	}
}

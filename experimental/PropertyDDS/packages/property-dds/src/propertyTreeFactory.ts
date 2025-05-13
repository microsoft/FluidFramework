/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
	IChannelServices,
} from "@fluidframework/datastore-definitions/internal";
import { createSharedObjectKind } from "@fluidframework/shared-object-base/internal";

import { SharedPropertyTree, SharedPropertyTreeOptions } from "./propertyTree.js";

/**
 * The factory for SharedPropertyTree.
 * @privateRemarks
 * TODO:
 * This class should not be package exported.
 * For now its being kept exported for compatibility, which is helpful since its actual users are not internal despite how it's tagged.
 * @internal
 */
export class PropertyTreeFactory implements IChannelFactory<SharedPropertyTree> {
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
		const instance = new SharedPropertyTree(
			id,
			runtime,
			attributes,
			options as SharedPropertyTreeOptions,
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
		const cell = new SharedPropertyTree(
			id,
			document,
			this.attributes,
			options as SharedPropertyTreeOptions,
		);

		cell.initializeLocal();
		return cell;
	}
}

/**
 * The factory for SharedProperty.
 * @privateRemarks
 * TODO: There should be an interface implemented by SharedPropertyTree which this exposes rather than exposing the class.
 * TODO: as PropertyDDS is published for use outside the Fluid Framework repo, it should not be `@internal`.
 * @internal
 */
export const SharedPropertyTreeKind = createSharedObjectKind(PropertyTreeFactory);

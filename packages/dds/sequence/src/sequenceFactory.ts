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
import { Marker, TextSegment } from "@fluidframework/merge-tree/internal";
import { createSharedObjectKind } from "@fluidframework/shared-object-base/internal";

import { pkgVersion } from "./packageVersion.js";
// eslint-disable-next-line import/no-deprecated
import { SharedStringClass, SharedStringSegment, type ISharedString } from "./sharedString.js";

export class SharedStringFactory implements IChannelFactory<ISharedString> {
	// TODO rename back to https://graph.microsoft.com/types/mergeTree/string once paparazzi is able to dynamically
	// load code (UPDATE: paparazzi is gone... anything to do here?)
	public static Type = "https://graph.microsoft.com/types/mergeTree";

	public static readonly Attributes: IChannelAttributes = {
		type: SharedStringFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};

	public static segmentFromSpec(spec: any): SharedStringSegment {
		const maybeText = TextSegment.fromJSONObject(spec);
		if (maybeText) {
			return maybeText;
		}

		const maybeMarker = Marker.fromJSONObject(spec);
		if (maybeMarker) {
			return maybeMarker;
		}

		throw new Error(`Unrecognized IJSONObject`);
	}

	public get type() {
		return SharedStringFactory.Type;
	}

	public get attributes() {
		return SharedStringFactory.Attributes;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
		// eslint-disable-next-line import/no-deprecated
	): Promise<SharedStringClass> {
		// eslint-disable-next-line import/no-deprecated
		const sharedString = new SharedStringClass(runtime, id, attributes);
		await sharedString.load(services);
		return sharedString;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.create}
	 */
	// eslint-disable-next-line import/no-deprecated
	public create(document: IFluidDataStoreRuntime, id: string): SharedStringClass {
		// eslint-disable-next-line import/no-deprecated
		const sharedString = new SharedStringClass(document, id, this.attributes);
		sharedString.initializeLocal();
		return sharedString;
	}
}

/**
 * Entrypoint for {@link ISharedString} creation.
 * @legacy
 * @alpha
 */
export const SharedString = createSharedObjectKind<ISharedString>(SharedStringFactory);

/**
 * Alias for {@link ISharedString} for compatibility.
 * @legacy
 * @alpha
 */
export type SharedString = ISharedString;

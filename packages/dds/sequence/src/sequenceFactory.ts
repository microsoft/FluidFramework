/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
	IChannelServices,
} from "@fluidframework/datastore-definitions/internal";
import { Marker, TextSegment } from "@fluidframework/merge-tree/internal";
import { createSharedObjectKind } from "@fluidframework/shared-object-base/internal";

import { pkgVersion } from "./packageVersion.js";
import type { ISharedString, SharedStringSegment } from "./sharedString.js";
import { SharedStringClass } from "./sharedString.js";

export class SharedStringFactory implements IChannelFactory<ISharedString> {
	// New type string, to be activated once the migration has been fully shipped dark and is safe to flip.
	// See LegacyTypeAwareRegistry in packages/runtime/datastore/src/dataStoreRuntime.ts.
	// public static Type = "mergeTree";
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
	): Promise<SharedStringClass> {
		const sharedString = new SharedStringClass(runtime, id, attributes);
		await sharedString.load(services);
		return sharedString;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.create}
	 */
	public create(document: IFluidDataStoreRuntime, id: string): SharedStringClass {
		const sharedString = new SharedStringClass(document, id, this.attributes);
		sharedString.initializeLocal();
		return sharedString;
	}
}

/**
 * Entrypoint for {@link ISharedString} creation.
 * @legacy @beta
 */
export const SharedString = createSharedObjectKind<ISharedString>(SharedStringFactory);

/**
 * Alias for {@link ISharedString} for compatibility.
 * @legacy @beta
 */
export type SharedString = ISharedString;

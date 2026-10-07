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
import {
	createSharedObjectKind,
	type ISharedObjectKind,
	type SharedObjectKind,
} from "@fluidframework/shared-object-base/internal";

import { pkgVersion } from "./packageVersion.js";
import type { ISharedString, SharedStringSegment } from "./sharedString.js";
import { SharedStringClass } from "./sharedString.js";

/**
 * Options for SharedString factories created by {@link configuredSharedString}.
 * @legacy @beta
 */
export interface SharedStringOptions {
	/**
	 * Selects the summary format for SharedStrings created or loaded by the factory.
	 *
	 * @remarks
	 * `true` selects the flat format, and `false` selects the legacy format.
	 * When omitted, the runtime option takes precedence over the loaded or most recently generated format.
	 * New SharedStrings use the legacy format by default.
	 *
	 * The `Fluid.Sequence.newMergeTreeSnapshotFormat` configuration flag overrides this factory option.
	 * This factory option overrides the `newMergeTreeSnapshotFormat` runtime option.
	 * Changing a setting does not force an otherwise unchanged DDS to generate a new summary.
	 */
	readonly newMergeTreeSnapshotFormat?: boolean;
}

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

	private readonly options: SharedStringOptions;

	constructor(options: SharedStringOptions = {}) {
		this.options = { ...options };
	}

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

	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<SharedStringClass> {
		const sharedString = new SharedStringClass(runtime, id, attributes, this.options);
		await sharedString.load(services);
		return sharedString;
	}

	public create(document: IFluidDataStoreRuntime, id: string): SharedStringClass {
		const sharedString = new SharedStringClass(document, id, this.attributes, this.options);
		sharedString.initializeLocal();
		return sharedString;
	}
}

/**
 * Creates a SharedString kind with factory-level options.
 *
 * @param options - Options applied to SharedStrings created or loaded by the returned kind's factory.
 * @returns A SharedString kind to register in place of the default `SharedString`.
 *
 * @remarks
 * The kind uses the same DDS type and summary formats as `SharedString`.
 * The options are captured when this function is called.
 * Each registered factory applies its configuration independently of other clients' factories.
 *
 * @example
 * ```typescript
 * const ConfiguredSharedString = configuredSharedString({
 * 	newMergeTreeSnapshotFormat: true,
 * });
 * const factory = ConfiguredSharedString.getFactory();
 * ```
 *
 * @legacy @beta
 */
export function configuredSharedString(
	options: SharedStringOptions,
): ISharedObjectKind<ISharedString> & SharedObjectKind<ISharedString> {
	const factoryOptions = { ...options };
	class ConfiguredSharedStringFactory extends SharedStringFactory {
		constructor() {
			super(factoryOptions);
		}
	}
	return createSharedObjectKind<ISharedString>(ConfiguredSharedStringFactory);
}

/**
 * Entrypoint for {@link ISharedString} creation.
 * @legacy @beta
 */
export const SharedString = configuredSharedString({});

/**
 * Alias for {@link ISharedString} for compatibility.
 * @legacy @beta
 */
export type SharedString = ISharedString;

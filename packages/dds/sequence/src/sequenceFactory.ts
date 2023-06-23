/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IChannelAttributes,
	IFluidDataStoreRuntime,
	IChannelServices,
	IChannelFactory,
} from "@fluidframework/datastore-definitions";
import { IProvideAttributionPolicyRegistry, Marker, TextSegment } from "@fluidframework/merge-tree";
import { FluidObject } from "@fluidframework/core-interfaces";
import { pkgVersion } from "./packageVersion";
import { SharedString, SharedStringSegment } from "./sharedString";
import { SequenceOptions } from "./defaultMapInterfaces";

/**
 * Persisted attributes which dictate SharedString configuration
 * @remarks - This information should generally align with the subset of {@link SequenceOptions} fields
 * which have compatibility constraints (i.e. collaborating clients must agree on the configuration).
 */
export interface ISharedStringAttributes extends IChannelAttributes {
	attribution?: {
		policyName: string;
	};
}

const defaultSequenceOptions: SequenceOptions = {
	intervalStickinessEnabled: false,
};

export class SharedStringFactory implements IChannelFactory {
	// TODO rename back to https://graph.microsoft.com/types/mergeTree/string once paparazzi is able to dynamically
	// load code
	public static Type = "https://graph.microsoft.com/types/mergeTree";

	public static readonly Attributes: IChannelAttributes = {
		type: SharedStringFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};

	/**
	 * Constructs a factory which:
	 * - creates new {@link SharedString} objects using the attribution policy name (if enabled)
	 * - is capable of loading existing {@link SharedString}s which either do not have attribution enabled,
	 * or have a policy supported by the registry provided via `services`.
	 */
	public constructor(
		public readonly options: SequenceOptions = defaultSequenceOptions,
		private readonly services: FluidObject<IProvideAttributionPolicyRegistry> = {},
	) {}

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

	public get attributes(): IChannelAttributes {
		const attributes: ISharedStringAttributes = {
			...SharedStringFactory.Attributes,
			attribution: this.options.attribution,
		};
		return attributes;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<SharedString> {
		const options: SequenceOptions = {
			...this.options,
			...attributes,
		};
		// attributes go through a JSON round-trip, so if the attributes specify that attribution should be disabled,
		// the above spread operations won't explicitly override the `attribution` field of `this.options` (since the
		// property is empty). Explicitly do that here.
		if ((attributes as ISharedStringAttributes).attribution === undefined) {
			options.attribution = undefined;
		}
		const sharedString = new SharedString(runtime, id, attributes, options, this.services);
		await sharedString.load(services);
		return sharedString;
	}

	public create(document: IFluidDataStoreRuntime, id: string): SharedString {
		const sharedString = new SharedString(
			document,
			id,
			this.attributes,
			this.options,
			this.services,
		);
		sharedString.initializeLocal();
		return sharedString;
	}
}

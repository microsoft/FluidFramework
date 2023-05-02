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
import { Marker, TextSegment } from "@fluidframework/merge-tree";
import { pkgVersion } from "./packageVersion";
import { SharedString, SharedStringSegment } from "./sharedString";
import { SequenceOptions } from "./sequence";

export interface ISharedStringAttributes extends IChannelAttributes {
	attribution?: {
		track: boolean;
		policy: string;
	};
}

export class SharedStringFactory implements IChannelFactory {
	// TODO rename back to https://graph.microsoft.com/types/mergeTree/string once paparazzi is able to dynamically
	// load code
	public static Type = "https://graph.microsoft.com/types/mergeTree";

	public static readonly Attributes: IChannelAttributes = {
		type: SharedStringFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};

	public constructor(public readonly options?: SequenceOptions) {}

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

	public get attributes(): ISharedStringAttributes {
		if (this.options !== undefined) {
			const { policyFactory, track } = this.options.attribution;
			if (track !== undefined && policyFactory !== undefined) {
				return {
					...SharedStringFactory.Attributes,
					attribution: {
						track,
						// TODO: change this to something more stable than just the function name.
						policy: policyFactory?.name,
					},
				};
			}
		}
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
	): Promise<SharedString> {
		const sharedString = new SharedString(runtime, id, attributes, this.options);
		await sharedString.load(services);
		return sharedString;
	}

	public create(document: IFluidDataStoreRuntime, id: string): SharedString {
		const sharedString = new SharedString(document, id, this.attributes, this.options);
		sharedString.initializeLocal();
		return sharedString;
	}
}

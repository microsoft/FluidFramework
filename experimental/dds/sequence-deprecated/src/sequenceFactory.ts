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
import { IJSONSegment } from "@fluidframework/merge-tree/internal";
import { IJSONRunSegment, SubSequence } from "@fluidframework/sequence/internal";
import {
	ISharedObject,
	createSharedObjectKind,
} from "@fluidframework/shared-object-base/internal";

import { pkgVersion } from "./packageVersion.js";
import { SharedNumberSequenceClass } from "./sharedNumberSequence.js";
import { SharedObjectSequenceClass } from "./sharedObjectSequence.js";

/**
 * @deprecated SharedObjectSequence is not recommended for use and will be removed in an upcoming release.
 * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
 * @internal
 */
export class SharedObjectSequenceFactory implements IChannelFactory {
	/**
	 * @deprecated SharedObjectSequence is not recommended for use and will be removed in an upcoming release.
	 * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
	 */
	public static Type = "https://graph.microsoft.com/types/mergeTree/object-sequence";

	/**
	 * @deprecated SharedObjectSequence is not recommended for use and will be removed in an upcoming release.
	 * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
	 */
	public static readonly Attributes: IChannelAttributes = {
		type: SharedObjectSequenceFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};

	/**
	 * @deprecated SharedObjectSequence is not recommended for use and will be removed in an upcoming release.
	 * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
	 */
	public static segmentFromSpec(segSpec: IJSONSegment): SubSequence<object> {
		const runSegment = segSpec as IJSONRunSegment<object>;
		if (runSegment.items) {
			return new SubSequence<object>(runSegment.items, runSegment.props);
		}

		throw new Error(`Unrecognized IJSONObject`);
	}

	/**
	 * @deprecated SharedObjectSequence is not recommended for use and will be removed in an upcoming release.
	 * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
	 */
	public get type() {
		return SharedObjectSequenceFactory.Type;
	}

	/**
	 * @deprecated SharedObjectSequence is not recommended for use and will be removed in an upcoming release.
	 * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
	 */
	public get attributes() {
		return SharedObjectSequenceFactory.Attributes;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
	 *
	 * @deprecated SharedObjectSequence is not recommended for use and will be removed in an upcoming release.
	 * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<ISharedObject> {
		const sharedSeq = new SharedObjectSequenceClass<object>(runtime, id, attributes);
		await sharedSeq.load(services);
		return sharedSeq;
	}

	/**
	 * @deprecated SharedObjectSequence is not recommended for use and will be removed in an upcoming release.
	 * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
	 */
	public create(document: IFluidDataStoreRuntime, id: string): ISharedObject {
		const sharedString = new SharedObjectSequenceClass(document, id, this.attributes);
		sharedString.initializeLocal();
		return sharedString;
	}
}

/**
 * @deprecated SharedNumberSequence is not recommended for use and will be removed in an upcoming release.
 * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
 * @internal
 */
export class SharedNumberSequenceFactory implements IChannelFactory {
	/**
	 * @deprecated SharedNumberSequence is not recommended for use and will be removed in an upcoming release.
	 * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
	 */
	public static Type = "https://graph.microsoft.com/types/mergeTree/number-sequence";

	/**
	 * @deprecated SharedNumberSequence is not recommended for use and will be removed in an upcoming release.
	 * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
	 */
	public static readonly Attributes: IChannelAttributes = {
		type: SharedNumberSequenceFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};

	/**
	 * @deprecated SharedNumberSequence is not recommended for use and will be removed in an upcoming release.
	 * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
	 */
	public static segmentFromSpec(segSpec: IJSONSegment): SubSequence<number> {
		const runSegment = segSpec as IJSONRunSegment<number>;
		if (runSegment.items) {
			return new SubSequence<number>(runSegment.items, runSegment.props);
		}

		throw new Error(`Unrecognized IJSONObject`);
	}

	/**
	 * @deprecated SharedNumberSequence is not recommended for use and will be removed in an upcoming release.
	 * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
	 */
	public get type() {
		return SharedNumberSequenceFactory.Type;
	}

	/**
	 * @deprecated SharedNumberSequence is not recommended for use and will be removed in an upcoming release.
	 * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
	 */
	public get attributes() {
		return SharedNumberSequenceFactory.Attributes;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
	 *
	 * @deprecated SharedNumberSequence is not recommended for use and will be removed in an upcoming release.
	 * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<ISharedObject> {
		const sharedSeq = new SharedNumberSequenceClass(runtime, id, attributes);
		await sharedSeq.load(services);
		return sharedSeq;
	}

	/**
	 * @deprecated SharedNumberSequence is not recommended for use and will be removed in an upcoming release.
	 * For more info, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526)
	 */
	public create(document: IFluidDataStoreRuntime, id: string): ISharedObject {
		const sharedString = new SharedNumberSequenceClass(document, id, this.attributes);
		sharedString.initializeLocal();
		return sharedString;
	}
}

/**
 * {@inheritDoc SharedNumberSequenceClass}
 * @internal
 */
export const SharedNumberSequence = createSharedObjectKind(SharedNumberSequenceFactory);
/**
 * {@inheritDoc SharedNumberSequenceClass}
 * @internal
 */
export type SharedNumberSequence = SharedNumberSequenceClass;

/**
 * {@inheritDoc SharedObjectSequenceClass}
 * @internal
 */
export const SharedObjectSequence = createSharedObjectKind(SharedObjectSequenceFactory);
/**
 * {@inheritDoc SharedObjectSequenceClass}
 * @internal
 */
export type SharedObjectSequence<T> = SharedObjectSequenceClass<T>;

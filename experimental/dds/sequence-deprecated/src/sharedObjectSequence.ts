/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Serializable,
	IChannelAttributes,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";

import { SharedObjectSequenceFactory } from "./sequenceFactory.js";
import { SharedSequence } from "./sharedSequence.js";

/**
 * The SharedObjectSequence holds a sequence of serializable objects. Each object will be stored
 * at a position within the sequence. See the
 * {@link https://fluidframework.com/docs/data-structures/sequences/ | sequence documentation}
 * for details on working with sequences.
 *
 * @deprecated SharedObjectSequence is not recommended for use and will be removed in an upcoming release.
 * For more info, please see {@link https://github.com/microsoft/FluidFramework/issues/8526 | Github issue 8526}.
 * @internal
 */
export class SharedObjectSequenceClass<T> extends SharedSequence<T> {
	/**
	 * @deprecated SharedObjectSequence is not recommended for use and will be removed in an upcoming release.
	 * For more info, please see {@link https://github.com/microsoft/FluidFramework/issues/8526 | Github issue 8526}.
	 */
	constructor(
		document: IFluidDataStoreRuntime,
		public id: string,
		attributes: IChannelAttributes,
	) {
		super(document, id, attributes, SharedObjectSequenceFactory.segmentFromSpec as any);
	}

	/**
	 * @deprecated SharedObjectSequence is not recommended for use and will be removed in an upcoming release.
	 * For more info, please see {@link https://github.com/microsoft/FluidFramework/issues/8526 | Github issue 8526}.
	 */
	public getRange(start: number, end?: number): Serializable<T>[] {
		return this.getItems(start, end);
	}
}

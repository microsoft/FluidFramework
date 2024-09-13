/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IChannelAttributes,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";

import { SharedNumberSequenceFactory } from "./sequenceFactory.js";
import { SharedSequence } from "./sharedSequence.js";

/**
 * The SharedNumberSequence holds a sequence of numbers. Each number will be stored
 * at a position within the sequence. See the
 * {@link https://fluidframework.com/docs/data-structures/sequences/ | sequence documentation}
 * for details on working with sequences.
 *
 * @deprecated SharedNumberSequence is not recommended for use and will be removed in an upcoming release.
 * For more info, please see {@link https://github.com/microsoft/FluidFramework/issues/8526 | Github issue 8526}.
 * @internal
 */
export class SharedNumberSequenceClass extends SharedSequence<number> {
	/**
	 * @deprecated SharedNumberSequence is not recommended for use and will be removed in an upcoming release.
	 * For more info, please see {@link https://github.com/microsoft/FluidFramework/issues/8526 | Github issue 8526}.
	 */
	constructor(
		document: IFluidDataStoreRuntime,
		public id: string,
		attributes: IChannelAttributes,
	) {
		super(document, id, attributes, (spec) => {
			const segment = SharedNumberSequenceFactory.segmentFromSpec(spec);
			if (!segment) {
				throw new Error("expected `spec` to be valid `ISegment`");
			}
			return segment;
		});
	}

	/**
	 * @deprecated SharedNumberSequence is not recommended for use and will be removed in an upcoming release.
	 * For more info, please see {@link https://github.com/microsoft/FluidFramework/issues/8526 | Github issue 8526}.
	 */
	public getRange(start: number, end?: number) {
		return this.getItems(start, end);
	}
}

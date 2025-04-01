/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-deprecated
import { IIntervalCollection } from "./intervalCollection.js";
import { ISerializableInterval } from "./intervals/index.js";

/**
 * @legacy
 * @alpha
 * @remarks This interface is no longer used and will be removed.
 */
export interface ISharedIntervalCollection<TInterval extends ISerializableInterval> {
	// eslint-disable-next-line import/no-deprecated
	getIntervalCollection(label: string): IIntervalCollection<TInterval>;
}

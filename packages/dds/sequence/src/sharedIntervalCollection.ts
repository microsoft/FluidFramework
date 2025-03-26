/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IIntervalCollection } from "./intervalCollection.js";
import { ISerializableInterval } from "./intervals/index.js";

/**
 * @legacy
 * @alpha
 */
export interface ISharedIntervalCollection<TInterval extends ISerializableInterval> {
	getIntervalCollection(label: string): IIntervalCollection<TInterval>;
}

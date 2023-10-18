/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Mark, Root, Skip } from "./delta";

export const emptyDelta: Root<never> = new Map();

export function isSkipMark(mark: Mark<unknown>): mark is Skip {
	return typeof mark === "number";
}

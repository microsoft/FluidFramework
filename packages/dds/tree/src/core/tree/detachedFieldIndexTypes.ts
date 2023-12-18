/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NestedMap } from "../../util";
import { ForestRootId } from "./detachedFieldIndex";

export type Major = string | number | undefined;
export type Minor = number;

export interface DetachedFieldSummaryData {
	data: NestedMap<Major, Minor, ForestRootId>;
	maxId: ForestRootId;
}

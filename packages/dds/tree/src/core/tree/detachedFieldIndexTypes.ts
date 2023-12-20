/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NestedMap } from "../../util";
import { RevisionTag } from "../rebase";
import { ForestRootId } from "./detachedFieldIndex";

export type Major = RevisionTag | undefined;
export type Minor = number;

export interface DetachedFieldSummaryData {
	data: NestedMap<Major, Minor, ForestRootId>;
	maxId: ForestRootId;
}

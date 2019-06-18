/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { LocalReference } from "@prague/merge-tree";

export type PagePosition = LocalReference[];

export interface IPaginationProvider {
    paginate(start: PagePosition, budget: number): PagePosition;
}

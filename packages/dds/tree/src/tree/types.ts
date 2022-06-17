/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Brand } from "../util";

export type FieldKey = Brand<number | string, "FieldKey">;
export type TreeType = Brand<number | string, "TreeType">;

/**
 * The empty key ("") is used for unnamed relationships, such as the indexer
 * of an explicit array node.
 */
export const EmptyKey = "" as const as FieldKey;

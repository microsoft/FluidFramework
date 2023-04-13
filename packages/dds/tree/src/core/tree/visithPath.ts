/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldUpPath, UpPath } from "./pathTree";
import * as Delta from "./delta";
import { FieldKey, Value } from "./types";

/**
 * Delta visitor for the path tree.
 *
 * TODO: additional callbacks
 * @alpha
 */
export interface PathVisitor {
	onDelete(path: FieldUpPath, index: number, count: number): void;
	onInsert(path: FieldUpPath, index: number, content: readonly Delta.ProtoNode[]): void;
	onSetValue(path: UpPath, field: FieldKey | undefined, value: Value): void;
}

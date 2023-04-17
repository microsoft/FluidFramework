/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as Delta from "./delta";
import { UpPath } from "./pathTree";
import { FieldKey, Value } from "./types";

/**
 * Delta visitor for the path tree.
 *
 * TODO: additional callbacks
 * @alpha
 */
export interface PathVisitor {
	onDelete(path: UpPath, count: number): void;
	onInsert(path: UpPath, content: readonly Delta.ProtoNode[]): void;
	onSetValue(path: UpPath, field: FieldKey | undefined, value: Value): void;
}

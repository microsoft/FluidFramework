/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	DefaultEditBuilder,
	TypedSchemaCollection,
	createMockNodeKeyManager,
} from "../../../feature-libraries";
// eslint-disable-next-line import/no-internal-modules
import { Context } from "../../../feature-libraries/editable-tree-2/context";
import { IEditableForest } from "../../../core";

export function getReadonlyContext(
	forest: IEditableForest,
	schema: TypedSchemaCollection,
): Context {
	// This will error if someone tries to call mutation methods on it
	const dummyEditor = {} as unknown as DefaultEditBuilder;
	return new Context(schema, forest, dummyEditor, createMockNodeKeyManager());
}

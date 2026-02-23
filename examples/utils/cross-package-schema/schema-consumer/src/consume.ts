/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	AppState,
	type Container,
	type Dimensions,
	type Position,
} from "@fluid-example/cross-package-schema-provider";
import type { ImplicitFieldSchema } from "@fluidframework/tree";
import { TreeViewConfiguration } from "@fluidframework/tree";

/**
 * Type-level assertion that the Position schema satisfies ImplicitFieldSchema.
 */
export type _checkPosition = typeof Position extends ImplicitFieldSchema ? true : never;
/**
 * Type-level assertion that the Dimensions schema satisfies ImplicitFieldSchema.
 */
export type _checkDimensions = typeof Dimensions extends ImplicitFieldSchema ? true : never;
/**
 * Type-level assertion that the Container schema satisfies ImplicitFieldSchema.
 */
export type _checkContainer = typeof Container extends ImplicitFieldSchema ? true : never;
/**
 * Type-level assertion that the AppState schema satisfies ImplicitFieldSchema.
 */
export type _checkAppState = typeof AppState extends ImplicitFieldSchema ? true : never;

/**
 * A TreeViewConfiguration using the cross-package AppState schema.
 *
 * This is the practical use case: creating a tree configuration from an
 * imported schema. The TreeViewConfiguration constructor requires its schema
 * parameter to satisfy ImplicitFieldSchema. With the "source" export condition,
 * TypeScript resolves the provider's .ts source, ensuring full type compatibility.
 */
export const appConfig = new TreeViewConfiguration({ schema: AppState });

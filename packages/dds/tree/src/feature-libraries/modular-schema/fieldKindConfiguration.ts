/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FieldKindIdentifier } from "../../core/index.js";
import type { FlexFieldKind } from "./fieldKind.js";

/**
 * Configuration for a single field kind.
 */
export interface FieldKindConfigurationEntry {
	readonly kind: FlexFieldKind;
	/**
	 * The format to be used for encoding changesets for this field kind.
	 */
	readonly formatVersion: number;
}

/**
 * Configuration for a set of field kinds.
 */
export type FieldKindConfiguration = ReadonlyMap<
	FieldKindIdentifier,
	FieldKindConfigurationEntry
>;

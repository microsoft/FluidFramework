/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FieldKindIdentifier } from "../core/index.js";
import { brandConst } from "../util/index.js";

// A collection of identifiers for FieldKinds.
// These are declared before the field kinds that use them are declared to avoid direct (possibly cyclic) dependencies between FieldKinds .
// Fieldkinds refer to each-other via these identifiers for schema evolution purposes, so without this indirection they would likely form dependency cycles.

export const optionalIdentifier = brandConst("Optional")<FieldKindIdentifier>();
export const requiredIdentifier = brandConst("Value")<FieldKindIdentifier>();
export const sequenceIdentifier = brandConst("Sequence")<FieldKindIdentifier>();
export const identifierFieldIdentifier = brandConst("Identifier")<FieldKindIdentifier>();

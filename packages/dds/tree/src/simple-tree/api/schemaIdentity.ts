/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ErasedBaseType,
	ErasedTypeImplementation,
} from "@fluidframework/core-interfaces/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type { TreeStoredSchema } from "../../core/index.js";

/**
 * Enables schema hash telemetry and optional checks when constructing a view.
 * @remarks
 * Create with {@link identifySchemaAlpha}.
 * @sealed @alpha
 */
export interface SchemaIdentity
	extends ErasedBaseType<"@fluidframework/tree.SchemaIdentity"> {}

/**
 * Runtime implementation of {@link SchemaIdentity}, separate from the hashing implementation
 * so applications that omit schema identity do not need to load the hash algorithm.
 */
export class SchemaIdentityInternal
	extends ErasedTypeImplementation<SchemaIdentity>
	implements SchemaIdentity
{
	public constructor(
		public readonly expectedHash: string | undefined,
		public readonly schemaHasher: (schema: TreeStoredSchema) => string,
	) {
		super();
		if (
			expectedHash !== undefined &&
			(typeof expectedHash !== "string" || expectedHash.length === 0)
		) {
			throw new UsageError("expectedHash must be a non-empty string.");
		}
		Object.freeze(this);
	}

	public static extract(identity: SchemaIdentity): SchemaIdentityInternal {
		if (!(identity instanceof SchemaIdentityInternal)) {
			throw new UsageError("schemaIdentity must be created with identifySchemaAlpha.");
		}
		return identity;
	}
}

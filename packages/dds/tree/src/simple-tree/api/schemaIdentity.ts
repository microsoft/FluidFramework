/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ErasedBaseType,
	ErasedTypeImplementation,
} from "@fluidframework/core-interfaces/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type { SchemaUpgrade, StagedSchemaUpgradePolicy } from "../core/index.js";
import type { ImplicitFieldSchema } from "../fieldSchema.js";

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
		public readonly schemaHasher: (
			schema: ImplicitFieldSchema,
			stagedSchemaUpgrades?: Iterable<SchemaUpgrade> | StagedSchemaUpgradePolicy,
		) => string,
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

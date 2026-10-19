/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ErasedBaseType,
	ErasedTypeImplementation,
} from "@fluidframework/core-interfaces/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type { SchemaVersionMap } from "../../core/index.js";
import type { SchemaUpgrade, StagedSchemaUpgradePolicy } from "../core/index.js";
import type { ImplicitFieldSchema } from "../fieldSchema.js";

/**
 * schema identity for runtime hashing and application-defined versions
 *
 * @remarks
 * Create with {@link identifySchema}.
 *
 * @sealed @alpha
 */
export interface SchemaIdentity extends ErasedBaseType<"@fluidframework/tree.SchemaIdentity"> {
	/**
	 * application-defined versions for the view schema
	 *
	 * @remarks
	 * Each value must be a non-negative safe integer.
	 * {@link TreeView.initialize} and {@link TreeView.upgradeSchema} store these versions.
	 * Stored versions cannot decrease, and library identifiers cannot be removed.
	 *
	 * By default, upgrades must keep all existing documents valid and cannot be reversed.
	 * Stored versions let you make other changes that keep all existing documents valid.
	 * For these changes, increase at least one version.
	 *
	 * Versions use an experimental stored schema format.
	 * Until the format is stable, all clients that load or collaborate on the document
	 * must use the same Fluid Framework version.
	 * Runtime hashes are not stored in the document.
	 *
	 * @example
	 * Required string fields and identifier fields accept the same stored values.
	 * Increase the version to change a required string field to an identifier field.
	 * Older applications cannot reverse this change because stored versions cannot decrease.
	 *
	 * Configure {@link configuredSharedTreeAlpha} to write the experimental format:
	 *
	 * ```typescript
	 * const SharedTree = configuredSharedTreeAlpha({
	 * 	allowPossiblyIncompatibleWriteVersionOverrides: true,
	 * 	writeVersionOverrides: new Map([["Schema", "schemaVersion"]]),
	 * });
	 * ```
	 *
	 * Pass versions to {@link identifySchema} with a stable {@link LibraryId}:
	 *
	 * ```typescript
	 * const schemaFactory = new SchemaFactory("com.example");
	 * const libraryId = "com.example" as LibraryId;
	 * const oldConfig = new TreeViewConfigurationAlpha({
	 * 	schema: schemaFactory.string,
	 * 	schemaIdentity: identifySchema({ schemaVersion: { [libraryId]: 0 } }),
	 * });
	 * const newConfig = new TreeViewConfigurationAlpha({
	 * 	schema: schemaFactory.identifier,
	 * 	schemaIdentity: identifySchema({ schemaVersion: { [libraryId]: 1 } }),
	 * });
	 * ```
	 */
	readonly schemaVersion: SchemaVersionMap | undefined;
}

/**
 * runtime implementation of {@link SchemaIdentity} without the hash algorithm
 *
 * @remarks
 * Compatibility snapshots restore versions without runtime hash checks or telemetry.
 */
export class SchemaIdentityInternal
	extends ErasedTypeImplementation<SchemaIdentity>
	implements SchemaIdentity
{
	public readonly schemaVersion: SchemaVersionMap | undefined;

	public constructor(
		public readonly expectedHash: string | undefined,
		public readonly schemaHasher:
			| ((
					schema: ImplicitFieldSchema,
					stagedSchemaUpgrades?: Iterable<SchemaUpgrade> | StagedSchemaUpgradePolicy,
			  ) => string)
			| undefined,
		schemaVersion?: SchemaVersionMap,
	) {
		super();
		if (
			expectedHash !== undefined &&
			(typeof expectedHash !== "string" || expectedHash.length === 0)
		) {
			throw new UsageError("expectedHash must be a non-empty string.");
		}
		this.schemaVersion = validateSchemaVersion(schemaVersion);
		Object.freeze(this);
	}

	public static extract(identity: SchemaIdentity): SchemaIdentityInternal {
		if (!(identity instanceof SchemaIdentityInternal)) {
			throw new UsageError("schemaIdentity must be created with identifySchema.");
		}
		return identity;
	}
}

/**
 * Validates an application version map and returns a frozen copy.
 */
function validateSchemaVersion(
	schemaVersion: SchemaVersionMap | undefined,
): SchemaVersionMap | undefined {
	if (schemaVersion === undefined) {
		return undefined;
	}
	for (const [libraryId, version] of Object.entries(schemaVersion)) {
		if (!Number.isSafeInteger(version) || version < 0) {
			throw new UsageError(
				`Schema version for library ${JSON.stringify(libraryId)} must be a non-negative safe integer.`,
			);
		}
	}
	return Object.freeze({ ...schemaVersion });
}

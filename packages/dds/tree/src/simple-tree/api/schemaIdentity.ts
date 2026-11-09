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
 * Represents a schema identity for runtime hashing and application-defined versions.
 *
 * @remarks
 * Create with {@link identifySchemaAlpha} for application-defined versions only.
 * Use {@link identifySchemaWithHashAlpha} to also enable hash checks and hash telemetry.
 *
 * @sealed @alpha
 */
export interface SchemaIdentity extends ErasedBaseType<"@fluidframework/tree.SchemaIdentity"> {
	/**
	 * Contains the application-defined versions for the view schema.
	 *
	 * @remarks
	 * Each value must be a non-negative safe integer.
	 * To configure a single version, pass a number to {@link identifySchemaAlpha} or
	 * {@link identifySchemaWithHashAlpha} instead of a version map.
	 * The number is normalized to a map with the identifier `"schemaVersion"`.
	 * This identifier is not reserved and follows the same upgrade rules as other identifiers.
	 * {@link TreeView.initialize} and {@link TreeView.upgradeSchema} store these versions.
	 * Stored versions cannot decrease, and library identifiers cannot be removed.
	 *
	 * Schema upgrades normally follow the additive upgrade rules.
	 * Other changes require version maps in both the stored schema and the new view schema.
	 * At least one version must increase, or a library identifier must be added.
	 * The new schema must still allow all content accepted by the stored schema.
	 * Adding a version map for the first time does not bypass the additive upgrade rules.
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
	 * Configure {@link configuredSharedTreeAlpha} to write the experimental format.
	 *
	 * ```typescript
	 * const SharedTree = configuredSharedTreeAlpha({
	 * 	allowPossiblyIncompatibleWriteVersionOverrides: true,
	 * 	writeVersionOverrides: new Map([["Schema", "schemaVersion"]]),
	 * });
	 * ```
	 *
	 * Pass versions to {@link identifySchemaAlpha} with a stable string library identifier.
	 *
	 * ```typescript
	 * const schemaFactory = new SchemaFactory("com.example");
	 * const libraryId = "com.example";
	 * const oldConfig = new TreeViewConfigurationAlpha({
	 * 	schema: schemaFactory.string,
	 * 	schemaIdentity: identifySchemaAlpha({ schemaVersion: { [libraryId]: 0 } }),
	 * });
	 * const newConfig = new TreeViewConfigurationAlpha({
	 * 	schema: schemaFactory.identifier,
	 * 	schemaIdentity: identifySchemaAlpha({ schemaVersion: { [libraryId]: 1 } }),
	 * });
	 * ```
	 */
	readonly schemaVersion: SchemaVersionMap | undefined;
}

/**
 * Creates a schema identity with optional application-defined versions and no hashing.
 *
 * @param options - The application-defined versions.
 *
 * @returns An immutable {@link SchemaIdentity} without runtime hashing.
 *
 * @remarks
 * Pass the result as {@link ITreeViewConfigurationAlpha.schemaIdentity}.
 * This function does not compute hashes or log hash telemetry.
 * Bundles that only use this function can omit the hash algorithm.
 * See {@link SchemaIdentity.schemaVersion} for version requirements and upgrade rules.
 *
 * @see {@link identifySchemaWithHashAlpha} to enable hash checks and hash telemetry.
 *
 * @alpha
 */
export function identifySchemaAlpha(
	options: {
		/**
		 * Specifies the versions to store on {@link SchemaIdentity.schemaVersion}.
		 */
		readonly schemaVersion?: SchemaVersionMap | number;
	} = {},
): SchemaIdentity {
	return new SchemaIdentityInternal(undefined, undefined, options.schemaVersion);
}

/**
 * Runtime implementation of {@link SchemaIdentity}, separate from the hashing implementation
 * so applications that omit schema identity do not need to load the hash algorithm.
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
		schemaVersion?: SchemaVersionMap | number,
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
			throw new UsageError(
				"schemaIdentity must be created with identifySchemaAlpha or identifySchemaWithHashAlpha.",
			);
		}
		return identity;
	}
}

/**
 * Normalizes and validates application versions and returns a frozen map.
 */
function validateSchemaVersion(
	schemaVersion: SchemaVersionMap | number | undefined,
): SchemaVersionMap | undefined {
	if (schemaVersion === undefined) {
		return undefined;
	}
	const versions = typeof schemaVersion === "number" ? { schemaVersion } : schemaVersion;
	for (const [libraryId, version] of Object.entries(versions)) {
		if (!Number.isSafeInteger(version) || version < 0) {
			throw new UsageError(
				`Schema version for library ${JSON.stringify(libraryId)} must be a non-negative safe integer.`,
			);
		}
	}
	return Object.freeze({ ...versions });
}

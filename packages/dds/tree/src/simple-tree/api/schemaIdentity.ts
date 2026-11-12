/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ErasedBaseType,
	ErasedTypeImplementation,
} from "@fluidframework/core-interfaces/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type { SchemaVersionMap, TreeStoredSchema } from "../../core/index.js";

/**
 * Represents a schema identity for runtime hashing and application-defined versions.
 *
 * @remarks
 * An identity assigned to {@link ITreeViewConfigurationAlpha.schemaIdentity} configures versioning or hashing for a view.
 * {@link identifySchema} creates identities with application-defined versions only,
 * while {@link identifySchemaWithHash} also enables hash checks and hash telemetry.
 * Only the application-defined versions are persisted; runtime hashes are not stored in the document.
 *
 * @sealed @alpha
 */
export interface SchemaIdentity extends ErasedBaseType<"@fluidframework/tree.SchemaIdentity"> {
	/**
	 * Contains the application-defined versions for the view schema.
	 *
	 * @remarks
	 * {@link identifySchema} and {@link identifySchemaWithHash} accept these versions
	 * as a record of string library identifiers to non-negative safe integers,
	 * or as a single number assigned to the identifier `"schemaVersion"`.
	 * The configured versions are exposed as a read-only map.
	 * The shorthand key `"schemaVersion"` is an ordinary identifier and follows the same rules as other keys.
	 *
	 * {@link TreeView.initialize} and {@link TreeView.upgradeSchema} store the configured versions in the document.
	 * Once stored, version values cannot decrease and their identifiers cannot be removed.
	 * This ordering prevents an older application from reversing a versioned schema upgrade.
	 *
	 * Within those version constraints, schema upgrades normally follow the additive upgrade rules without requiring a version increase.
	 * To allow other changes, both the stored and new view schemas must have version maps,
	 * and at least one version must increase or a library identifier must be added.
	 * Even then, the new schema must still allow all content accepted by the stored schema.
	 * In particular, adding a version map for the first time does not bypass the additive upgrade rules.
	 *
	 * Persisting versions requires an experimental stored schema format that is not suitable for production use.
	 * For preview testing, all clients that load or collaborate on the document must use the same Fluid Framework version,
	 * because the experimental format has no compatibility guarantee across releases.
	 *
	 * @example
	 * An application changes a required string field to an identifier field.
	 * Both field kinds accept the same stored string values, so either direction preserves existing content.
	 * Version ordering is needed to prevent older clients from repeatedly reversing the change.
	 * The new configuration therefore increases the version, preventing the old configuration from restoring
	 * the required string field by decreasing the stored version.
	 *
	 * The application first configures {@link configuredSharedTreeAlpha} to write the experimental format for this preview.
	 *
	 * ```typescript
	 * const SharedTree = configuredSharedTreeAlpha({
	 * 	// Allow the preview format despite possible incompatibility with supported client versions.
	 * 	allowPossiblyIncompatibleWriteVersionOverrides: true,
	 * 	// Persist application-defined versions using the experimental schema format.
	 * 	writeVersionOverrides: new Map([["Schema", "schemaVersion"]]),
	 * });
	 * ```
	 *
	 * Both view configurations then use the same stable library identifier, with an increased version for the new schema.
	 *
	 * ```typescript
	 * const libraryId = "com.example";
	 * const schemaFactory = new SchemaFactory(libraryId);
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
	readonly schemaVersion: ReadonlyMap<string, number> | undefined;
}

/**
 * Configures application-defined versions for {@link identifySchema}.
 *
 * @alpha @input
 */
export interface IdentifySchemaOptions {
	/**
	 * Specifies the versions to store on {@link SchemaIdentity.schemaVersion}.
	 *
	 * @remarks
	 * A number specifies one application-wide version, while a record specifies independent versions for parts of the schema.
	 * {@link SchemaIdentity.schemaVersion} describes the supported inputs and upgrade rules.
	 */
	readonly schemaVersion?: SchemaVersionMap | number;
}

/**
 * Creates a schema identity with optional application-defined versions and no hashing.
 *
 * @param options - The application-defined versions.
 *
 * @returns An immutable {@link SchemaIdentity} without runtime hashing.
 *
 * @remarks
 * Assigning the result to {@link ITreeViewConfigurationAlpha.schemaIdentity} associates the versions with a view configuration.
 * {@link SchemaIdentity.schemaVersion} describes version requirements and upgrade rules.
 *
 * This factory does not compute hashes or log hash telemetry, avoiding the bundle-size cost of schema hashing.
 * {@link identifySchemaWithHash} also supports hashing.
 *
 * @see {@link identifySchemaWithHash} to enable hash checks and hash telemetry.
 *
 * @alpha
 */
export function identifySchema(options: IdentifySchemaOptions = {}): SchemaIdentity {
	return new SchemaIdentityInternal(undefined, undefined, options.schemaVersion);
}

/**
 * Runtime implementation shared by version-only and hash-enabled schema identities.
 *
 * @remarks
 * Keeping this implementation separate from the hash algorithm lets version-only callers avoid that dependency.
 * Compatibility snapshot imports also use the version-only path, restoring versions without enabling runtime hash checks or telemetry.
 */
export class SchemaIdentityInternal
	extends ErasedTypeImplementation<SchemaIdentity>
	implements SchemaIdentity
{
	public readonly schemaVersion: ReadonlyMap<string, number> | undefined;

	public constructor(
		public readonly expectedHash: string | undefined,
		public readonly schemaHasher: ((schema: TreeStoredSchema) => string) | undefined,
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
				"schemaIdentity must be created with identifySchema or identifySchemaWithHash.",
			);
		}
		return identity;
	}
}

/**
 * Normalizes and validates application versions and returns a read-only map.
 */
function validateSchemaVersion(
	schemaVersion: SchemaVersionMap | number | undefined,
): ReadonlyMap<string, number> | undefined {
	if (schemaVersion === undefined) {
		return undefined;
	}
	const entries =
		typeof schemaVersion === "number"
			? [["schemaVersion", schemaVersion] as const]
			: Object.entries(schemaVersion);
	const versions = new Map<string, number>();
	for (const [libraryId, version] of entries) {
		if (!Number.isSafeInteger(version) || version < 0) {
			throw new UsageError(
				`Schema version for library ${JSON.stringify(libraryId)} must be a non-negative safe integer.`,
			);
		}
		versions.set(libraryId, version);
	}
	return versions;
}

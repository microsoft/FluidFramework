/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	AnnotatedAllowedTypesInternal,
	createSchemaUpgrade,
	normalizeToAnnotatedAllowedType,
	type AllowedTypesFullFromMixed,
	type AllowedTypesMetadata,
	type AnnotatedAllowedType,
	type LazyItem,
	type TreeNodeSchema,
} from "../core/index.js";

import type {
	AllowedTypesFullFromMixedUnsafe,
	AnnotatedAllowedTypeUnsafe,
	UnannotateAllowedTypeUnsafe,
	Unenforced,
} from "./typesUnsafe.js";

/**
 * Stateless APIs exposed via {@link SchemaFactoryBeta} as both instance properties and as statics.
 *
 * @see {@link SchemaStatics} for why this is useful
 * @see {@link SchemaStaticsAlpha} for additional alpha APIs
 * @see {@link asBeta} to access these APIs on an existing {@link SchemaFactory}
 *
 * @system @sealed @beta
 */
export interface SchemaStaticsBeta {
	/**
	 * Declares a staged type in a set of {@link AllowedTypes}.
	 *
	 * @remarks
	 * Staged allowed types add support for loading documents which may contain that type at the declared location.
	 * This allows for an incremental rollout of a schema change to add a {@link TreeNodeSchema} to an {@link AllowedTypes} without breaking cross version collaboration.
	 * A guide on this process can be found here: https://fluidframework.com/docs/data-structures/tree/schema-evolution/allowed-types-rollout
	 *
	 * Once enough clients have the type staged (and thus can read documents which allow it), documents can start being created and upgraded to allow the staged type.
	 * This is done by deploying a new version of the app which removes the `staged` wrapper around the allowed type in the the schema definition.
	 * This will also require {@link TreeView.upgradeSchema|upgrading the schema} for existing documents.
	 *
	 * Using a staged allowed type in a schema is just like using the schema as an allowed type with the following exceptions:
	 *
	 * 1. {@link TreeView.initialize} will omit the staged allowed type from the newly created stored schema.
	 * 2. {@link TreeView.upgradeSchema} will omit the staged allowed type from the the upgraded stored schema.
	 * 3. When evaluating {@link TreeView.compatibility}, it will be viewable even if the staged allowed type is not present in the stored schema's corresponding allowed types.
	 * 4. Because of the above, it is possible to get errors when inserting content which uses the staged allowed type into a tree whose stored schema does not permit it.
	 *
	 * For recursive schemas, use {@link SchemaStaticsBeta.stagedRecursive} instead.
	 * It offers equivalent runtime behavior with relaxed compile-time typing for recursive type.
	 *
	 * @example
	 * A full code example of the schema migration process can be found in our {@link https://github.com/microsoft/FluidFramework/blob/main/packages/dds/tree/src/test/simple-tree/api/stagedSchemaUpgrade.spec.ts | tests}.
	 *
	 * @privateRemarks
	 * TODO: AB#45711: Update the docs above when recursive type support is added.
	 */
	readonly staged: <const T extends LazyItem<TreeNodeSchema>>(
		t: T | AnnotatedAllowedType<T>,
	) => AnnotatedAllowedType<T>;

	/**
	 * Normalize information about a set of {@link AllowedTypes} into an {@link AllowedTypesFull}.
	 * @remarks
	 * This can take in {@link AnnotatedAllowedType} to preserve their annotations.
	 */
	readonly types: <
		const T extends readonly (AnnotatedAllowedType | LazyItem<TreeNodeSchema>)[],
	>(
		t: T,
		metadata?: AllowedTypesMetadata,
	) => AllowedTypesFullFromMixed<T>;

	/**
	 * {@link SchemaStaticsBeta.staged} except tweaked to work better for recursive types.
	 * Use with {@link ValidateRecursiveSchema} for improved type safety.
	 * @remarks
	 * This version of {@link SchemaStaticsBeta.staged} has fewer type constraints to work around TypeScript limitations, see {@link Unenforced}.
	 * See {@link ValidateRecursiveSchema} for additional information about using recursive schema.
	 */
	stagedRecursive: <
		const T extends Unenforced<AnnotatedAllowedType | LazyItem<TreeNodeSchema>>,
	>(
		t: T,
	) => AnnotatedAllowedTypeUnsafe<UnannotateAllowedTypeUnsafe<T>>;

	/**
	 * {@link SchemaStaticsBeta.types} except tweaked to work better for recursive types.
	 * Use with {@link ValidateRecursiveSchema} for improved type safety.
	 * @remarks
	 * This version of {@link SchemaStaticsBeta.types} has fewer type constraints to work around TypeScript limitations, see {@link Unenforced}.
	 * See {@link ValidateRecursiveSchema} for additional information about using recursive schema.
	 * @privateRemarks
	 * If all inputs (at least recursive ones) were required to be annotated, this could be typed more strongly.
	 * In that case it could use `T extends readonly (AnnotatedAllowedTypeUnsafe | LazyItem<System_Unsafe.TreeNodeSchemaUnsafe>)[]`.
	 */
	readonly typesRecursive: <
		const T extends readonly Unenforced<AnnotatedAllowedType | LazyItem<TreeNodeSchema>>[],
	>(
		t: T,
		metadata?: AllowedTypesMetadata,
	) => AllowedTypesFullFromMixedUnsafe<T>;
}

const staged = <const T extends LazyItem<TreeNodeSchema>>(
	t: T | AnnotatedAllowedType<T>,
): AnnotatedAllowedType<T> => {
	const annotatedType = normalizeToAnnotatedAllowedType(t);
	return {
		type: annotatedType.type,
		metadata: {
			...annotatedType.metadata,
			stagedSchemaUpgrade: createSchemaUpgrade(),
		},
	};
};

const types = <const T extends readonly (AnnotatedAllowedType | LazyItem<TreeNodeSchema>)[]>(
	t: T,
	metadata: AllowedTypesMetadata = {},
): AllowedTypesFullFromMixed<T> => {
	return AnnotatedAllowedTypesInternal.createMixed<T>(t, metadata);
};

export const schemaStaticsBeta: SchemaStaticsBeta = {
	staged,
	types,

	stagedRecursive: staged as SchemaStaticsBeta["stagedRecursive"],
	typesRecursive: types as unknown as SchemaStaticsBeta["typesRecursive"],
};

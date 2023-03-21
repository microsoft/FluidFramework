/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This file is meant to ensure that all public members have corresponding documentation published.
 * This includes code that is not normally package-exported.
 *
 * See ../docs/documentation-guidelines.md#internal-documentation-index-files for instructions on maintaining this file.
 */
/* eslint-disable no-restricted-syntax */
export * as core from "./core/internalDocumentationIndex";
export * as domains from "./domains";
export * as featureLibraries from "./feature-libraries";
export * as sharedTree from "./shared-tree";
export * as sharedTreeCore from "./shared-tree-core";
export {
	Brand,
	BrandedType,
	Contravariant,
	Covariant,
	extractFromOpaque,
	ExtractFromOpaque,
	Invariant,
	isAny,
	JsonCompatible,
	JsonCompatibleObject,
	JsonCompatibleReadOnly,
	MakeNominal,
	Opaque,
	RecursiveReadonly,
} from "./util";

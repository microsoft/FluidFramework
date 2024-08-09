/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ApiDocumentedItem,
	type ApiItem,
	ApiItemContainerMixin,
	type ApiModel,
} from "@microsoft/api-extractor-model";
import type { DocInheritDocTag } from "@microsoft/tsdoc";

import { defaultLoadModelOptions, loadModel, type LoadModelOptions } from "./LoadModel.js";
import { noopLogger } from "./Logging.js";
import { resolveSymbolicReference } from "./utilities/index.js";
import { fail } from "node:assert";

/**
 * Linter check options.
 *
 * @public
 */
export interface LinterOptions {
	/**
	 * Whether or not to evaluate `{@link}` and `{@inheritDoc}` references as a part of the linting process.
	 * @defaultValue `true`
	 */
	checkReferences?: boolean;
}

/**
 * {@link lintApiModel} options.
 */
export interface LintApiModelOptions extends LoadModelOptions, LinterOptions {}

/**
 * {@link LintApiModelOptions} defaults.
 */
const defaultLintApiModelOptions: Required<Omit<LintApiModelOptions, "modelDirectoryPath">> = {
	...defaultLoadModelOptions,
	checkReferences: true,
};

/**
 * Kinds of linter errors reported by {@link lintApiModel}.
 */
export enum LinterErrorKind {
	/**
	 * Indicates an `{@inheritDoc}` tag included an invalid reference.
	 */
	// eslint-disable-next-line unicorn/prevent-abbreviations
	InheritDocReferenceError = "inheritDocReferenceError",

	/**
	 * Indicates a `{@link}` tag included an invalid reference.
	 */
	LinkReferenceError = "linkReferenceError",
}

/**
 * A linter error found while checking the API model.
 */
export interface LinterErrorBase<TError extends LinterErrorKind> {
	/**
	 * The kind of error.
	 */
	readonly kind: TError;
}

/**
 * An error resulting from a reference tag with an invalid target.
 */
export interface ReferenceError {
	/**
	 * Name of the item that included a reference to an invalid target.
	 */
	readonly sourceItem: string;

	/**
	 * The string provided as the reference in a reference tag.
	 */
	readonly referenceTarget: string;

	/**
	 * The name of the package that the {@link ReferenceError.sourceItem} belongs to.
	 */
	readonly packageName: string;
}

/**
 * An error resulting from an `{@inheritDoc}` tag with an invalid target.
 */
// eslint-disable-next-line unicorn/prevent-abbreviations
export interface InheritDocReferenceError
	extends LinterErrorBase<LinterErrorKind.InheritDocReferenceError>,
		ReferenceError {
	/**
	 * {@inheritDoc LinterErrorBase.kind}
	 */
	readonly kind: LinterErrorKind.InheritDocReferenceError;
}

/**
 * An error resulting from a `{@link}` tag with an invalid target.
 */
export interface LinkReferenceError
	extends LinterErrorBase<LinterErrorKind.LinkReferenceError>,
		ReferenceError {
	/**
	 * {@inheritDoc LinterErrorBase.kind}
	 */
	readonly kind: LinterErrorKind.LinkReferenceError;
}

/**
 * {@link LinterResult} base type.
 */
export interface LinterResultBase<TSuccess extends boolean> {
	/**
	 * Result "success" status.
	 */
	readonly success: TSuccess;
}

/**
 * A successful linter result. No issues were found.
 */
export interface LinterSuccessResult extends LinterResultBase<true> {
	/**
	 * {@inheritDoc LinterResultBase.status}
	 */
	readonly success: true;
}

/**
 * Success result singleton.
 */
const successResult: LinterSuccessResult = { success: true };

/**
 * A linter failure result. One or more issues were found.
 */
export interface LinterFailureResult extends LinterResultBase<false> {
	/**
	 * {@inheritDoc LinterResultBase.status}
	 */
	readonly success: false;

	/**
	 * `{@inheritDoc}` reference errors found in the API model.
	 */
	readonly inheritDocReferenceErrors: readonly InheritDocReferenceError[];

	/**
	 * `{@link}` reference errors found in the API model.
	 */
	readonly linkReferenceErrors: readonly LinkReferenceError[];
}

/**
 * Result of {@link lintApiModel}.
 * @remarks Includes a {@link LinterResult.success} indicating whether or not the check was a "success" (no issues found) or "failure" (issues found).
 */
export type LinterResult = LinterSuccessResult | LinterFailureResult;

/**
 * Validates the given API model.
 *
 * @returns A "Result" object indicating whether or not the check was a "success" (no issues found) or "failure" (issues found).
 * In the case of a "failure", all issues found are included.
 *
 * @throws
 * If the specified {@link LoadModelOptions.modelDirectoryPath} doesn't exist, or if no `.api.json` files are found directly under it.
 */
export async function lintApiModel(options: LintApiModelOptions): Promise<LinterResult> {
	const optionsWithDefaults: Required<LintApiModelOptions> = {
		...defaultLintApiModelOptions,
		...options,
	};
	const { modelDirectoryPath, logger } = optionsWithDefaults;

	logger.verbose("Loading API model...");

	// Load the model
	// Use a no-op logger to prevent logging during the load process
	const apiModel = await loadModel({ modelDirectoryPath, logger: noopLogger });

	logger.verbose("API model loaded.");

	logger.verbose("Linting API model...");

	const result = lintApiItem(apiModel, apiModel, optionsWithDefaults);

	logger.verbose("API model linting completed.");
	return result;
}

/**
 * Recursively validates the given API item and all its descendants within the API model.
 */
function lintApiItem(
	apiItem: ApiItem,
	apiModel: ApiModel,
	options: Required<LintApiModelOptions>,
): LinterResult {
	// eslint-disable-next-line unicorn/prevent-abbreviations
	let inheritDocReferenceError: InheritDocReferenceError | undefined;
	const linkReferenceErrors: LinkReferenceError[] | undefined = undefined;

	// If the item is documented, check its link tags for errors.
	if (options.checkReferences && apiItem instanceof ApiDocumentedItem) {
		// Check `{@inheritDoc}` tag
		inheritDocReferenceError = checkInheritDocTag(apiItem, apiModel);

		// TODO: Check `{@link}` tags
	}

	const myResult: LinterResult =
		inheritDocReferenceError === undefined && linkReferenceErrors === undefined
			? successResult
			: {
					success: false,
					inheritDocReferenceErrors:
						inheritDocReferenceError === undefined ? [] : [inheritDocReferenceError],
					linkReferenceErrors: linkReferenceErrors ?? [],
			  };

	// If the item has children, recursively validate them.
	let membersResult: LinterResult = successResult;
	if (ApiItemContainerMixin.isBaseClassOf(apiItem)) {
		const memberResults = apiItem.members.map((member) =>
			lintApiItem(member, apiModel, options),
		);

		// eslint-disable-next-line unicorn/no-array-reduce
		membersResult = memberResults.reduce(
			(previous, current) => mergeLinterResults(previous, current),
			successResult,
		);
	}

	return mergeLinterResults(myResult, membersResult);
}

/**
 * Merges two {@link LinterResult}s into a single result.
 */
function mergeLinterResults(a: LinterResult, b: LinterResult): LinterResult {
	if (a.success && b.success) {
		return successResult;
	}

	if (a.success) {
		return b;
	}

	if (b.success) {
		return a;
	}

	// eslint-disable-next-line unicorn/prevent-abbreviations
	const inheritDocReferenceErrors = [
		...a.inheritDocReferenceErrors,
		...b.inheritDocReferenceErrors,
	];
	const linkReferenceErrors = [...a.linkReferenceErrors, ...b.linkReferenceErrors];

	return {
		success: false,
		inheritDocReferenceErrors,
		linkReferenceErrors,
	};
}

/**
 * Checks the provided API item's `{@inheritDoc}` tag, ensuring that the target reference is valid within the API model.
 */
// eslint-disable-next-line unicorn/prevent-abbreviations
function checkInheritDocTag(
	apiItem: ApiDocumentedItem,
	apiModel: ApiModel,
): InheritDocReferenceError | undefined {
	// eslint-disable-next-line unicorn/prevent-abbreviations
	const inheritDocTag: DocInheritDocTag | undefined = apiItem.tsdocComment?.inheritDocTag;

	if (inheritDocTag?.declarationReference !== undefined) {
		try {
			resolveSymbolicReference(apiItem, inheritDocTag.declarationReference, apiModel);
		} catch {
			return {
				kind: LinterErrorKind.InheritDocReferenceError,
				sourceItem: apiItem.getScopedNameWithinPackage(),
				packageName: apiItem.getAssociatedPackage()?.name ?? fail("Package name not found"),
				referenceTarget: inheritDocTag.declarationReference.emitAsTsdoc(),
			};
		}

		return undefined;
	}
	return undefined;
}

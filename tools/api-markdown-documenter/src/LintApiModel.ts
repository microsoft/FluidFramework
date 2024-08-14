/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { fail } from "node:assert";
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

/**
 * {@link lintApiModel} options.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface LintApiModelOptions extends LoadModelOptions {
	// TODO: add linter-specific options here as needed.
}

/**
 * {@link LintApiModelOptions} defaults.
 */
const defaultLintApiModelOptions: Required<Omit<LintApiModelOptions, "modelDirectoryPath">> = {
	...defaultLoadModelOptions,
};

// TODO: common TsdocError base (associatedItem, packageName)

/**
 * An error resulting from a reference tag (e.g., `link` or `inheritDoc` tags) with an invalid target.
 */
export interface ReferenceError {
	/**
	 * The tag name with the invalid reference.
	 */
	readonly tagName: string;

	/**
	 * Name of the item that included a reference to an invalid target.
	 */
	readonly sourceItem: string;

	/**
	 * The name of the package that the {@link ReferenceError.sourceItem} belongs to.
	 */
	readonly packageName: string;

	/**
	 * The string provided as the reference in a reference tag.
	 */
	readonly referenceTarget: string;

	/**
	 * Link alias text, if any.
	 */
	readonly linkText: string | undefined;
}

/**
 * Mutable {@link LinterErrors}.
 * @remarks Used while walking the API model to accumulate errors, and converted to {@link LinterErrors} to return to the caller.
 */
interface MutableLinterErrors {
	readonly referenceErrors: Set<ReferenceError>;
}

/**
 * Errors found during linting.
 */
export interface LinterErrors {
	/**
	 * Errors related to reference tags (e.g., `link` or `inheritDoc` tags) with invalid targets.
	 */
	readonly referenceErrors: ReadonlySet<ReferenceError>;

	// TODO: add other error kinds as needed.
}

/**
 * Validates the given API model.
 *
 * @returns The set of errors encountered during linting, if any were found.
 * Otherwise, `undefined`.
 *
 * @throws
 * If the specified {@link LoadModelOptions.modelDirectoryPath} doesn't exist, or if no `.api.json` files are found directly under it.
 */
export async function lintApiModel(
	options: LintApiModelOptions,
): Promise<LinterErrors | undefined> {
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

	const errors: MutableLinterErrors = {
		referenceErrors: new Set<ReferenceError>(),
	};
	lintApiItem(apiModel, apiModel, optionsWithDefaults, errors);
	const anyErrors = errors.referenceErrors.size > 0;

	logger.verbose("API model linting completed.");
	logger.verbose(`Linting result: ${anyErrors ? "failure" : "success"}.`);

	return anyErrors
		? {
				referenceErrors: errors.referenceErrors,
		  }
		: undefined;
}

/**
 * Recursively validates the given API item and all its descendants within the API model.
 */
function lintApiItem(
	apiItem: ApiItem,
	apiModel: ApiModel,
	options: Required<LintApiModelOptions>,
	errors: MutableLinterErrors,
): void {
	// If the item is documented, lint its documentation contents.
	if (apiItem instanceof ApiDocumentedItem && apiItem.tsdocComment !== undefined) {
		const comment = apiItem.tsdocComment;

		// Lint `@inheritDoc` tag, if present
		// Note: API-Extractor resolves `@inheritDoc` during model generation, so such tags are never expected to appear in the `tsdocComment` tree (unless malformed).
		// Therefore, we need to handle them specially here.
		if (comment.inheritDocTag !== undefined) {
			// eslint-disable-next-line unicorn/prevent-abbreviations
			const inheritDocReferenceError = checkInheritDocTag(
				comment.inheritDocTag,
				apiItem,
				apiModel,
			);
			if (inheritDocReferenceError !== undefined) {
				errors.referenceErrors.add(inheritDocReferenceError);
			}
		}

		// TODO: Check other TSDoc contents
	}

	// If the item has children, recursively validate them.
	if (ApiItemContainerMixin.isBaseClassOf(apiItem)) {
		for (const member of apiItem.members) {
			lintApiItem(member, apiModel, options, errors);
		}
	}
}

/**
 * Checks the provided API item's `{@inheritDoc}` tag, ensuring that the target reference is valid within the API model.
 */
// eslint-disable-next-line unicorn/prevent-abbreviations
function checkInheritDocTag(
	// eslint-disable-next-line unicorn/prevent-abbreviations
	inheritDocTag: DocInheritDocTag,
	associatedItem: ApiDocumentedItem,
	apiModel: ApiModel,
): ReferenceError | undefined {
	if (inheritDocTag?.declarationReference !== undefined) {
		try {
			resolveSymbolicReference(associatedItem, inheritDocTag.declarationReference, apiModel);
		} catch {
			return {
				tagName: "@inheritDoc",
				sourceItem: associatedItem.getScopedNameWithinPackage(),
				packageName:
					associatedItem.getAssociatedPackage()?.name ?? fail("Package name not found"),
				referenceTarget: inheritDocTag.declarationReference.emitAsTsdoc(),
				linkText: undefined,
			};
		}

		return undefined;
	}
	return undefined;
}

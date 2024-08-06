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
import { DocumentWriter } from "./renderers/index.js";
import { resolveSymbolicReference } from "./utilities/index.js";

/**
 * Linter check options.
 *
 * @public
 */
export interface LinterOptions {
	/**
	 * Whether or not to evaluate `{@link}` and `{@inheritDoc}` links as a part of the linting process.
	 * @defaultValue `true`
	 */
	checkLinks?: boolean;
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
	checkLinks: true,
};

/**
 * Validates the given API model.
 * TODO: more detail.
 */
export async function lintApiModel(options: LintApiModelOptions): Promise<void> {
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

	logger.info("Linting API model...");

	// Run "lint" checks on the model. Collect errors and throw an aggregate error if any are found.
	let linkErrors: string[] = [];
	if (optionsWithDefaults.checkLinks) {
		linkErrors = checkLinks(apiModel, apiModel);
	}

	const anyErrors: boolean = linkErrors.length > 0;
	if (anyErrors) {
		const writer = DocumentWriter.create();
		writer.writeLine("API model linting failed with the following errors:");
		writer.increaseIndent();
		if (linkErrors.length > 0) {
			writer.writeLine("Link errors:");
			writer.increaseIndent("  - ");
			for (const linkError of linkErrors) {
				writer.writeLine(linkError.trim());
			}
		}

		throw new Error(writer.getText().trim());
	} else {
		logger.success("API model linting passed.");
	}
}

function checkLinks(apiItem: ApiItem, apiModel: ApiModel): string[] {
	const errors: string[] = [];

	if (apiItem instanceof ApiDocumentedItem) {
		// Check `@inheritDoc` tag
		// eslint-disable-next-line unicorn/prevent-abbreviations
		const inheritDocError = checkInheritDocTag(apiItem, apiModel);
		if (inheritDocError !== undefined) {
			errors.push(inheritDocError);
		}

		// Check link tags
		errors.push(...checkLinkTags(apiItem, apiModel));
	}

	// Recurse members
	if (ApiItemContainerMixin.isBaseClassOf(apiItem)) {
		for (const member of apiItem.members) {
			errors.push(...checkLinks(member, apiModel));
		}
	}

	return errors;
}

function checkLinkTags(apiItem: ApiDocumentedItem, apiModel: ApiModel): string[] {
	const errors: string[] = [];

	// TODO

	return errors;
}

// eslint-disable-next-line unicorn/prevent-abbreviations
function checkInheritDocTag(apiItem: ApiDocumentedItem, apiModel: ApiModel): string | undefined {
	// eslint-disable-next-line unicorn/prevent-abbreviations
	const inheritDocTag: DocInheritDocTag | undefined = apiItem.tsdocComment?.inheritDocTag;

	if (inheritDocTag?.declarationReference !== undefined) {
		try {
			resolveSymbolicReference(apiItem, inheritDocTag.declarationReference, apiModel);
		} catch (error: unknown) {
			return (error as Error).message;
		}

		return undefined;
	}
	return undefined;
}

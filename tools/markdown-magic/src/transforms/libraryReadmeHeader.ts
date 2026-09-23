/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Transform } from "../types.js";
import { generateApiDocs } from "./apiDocs.js";
import { generateImportInstructions } from "./importInstructions.js";
import { generateInstallation } from "./installationInstructions.js";
import { transform } from "./options.js";
import {
	getScopeKind,
	isPublic,
	readPackage,
	type ScopeKind,
	scopeValues,
} from "./packageMetadata.js";
import { generateScopeNotice } from "./packageScopeNotice.js";
import { headingLevelSchema, packageSchema } from "./schemas.js";
import { generateTemplateSection } from "./templates.js";

/**
 * Generates the standard sections that precede a library README body.
 */
export const libraryReadmeHeaderTransform: Transform = transform(
	"library-readme-header",
	{
		...packageSchema,
		...headingLevelSchema,
		packageScopeNotice: { type: "string", values: scopeValues },
		dependencyGuidelines: { type: "boolean" },
		installation: { type: "boolean" },
		devDependency: { type: "boolean", default: false },
		importInstructions: { type: "boolean", default: true },
		apiDocs: { type: "boolean" },
	},
	async (options, context) => {
		const packageMetadata = await readPackage(context, options);
		const packageIsPublic = isPublic(packageMetadata);
		const sectionOptions = { includeHeading: true };
		return [
			...(await generateScopeNotice(
				(options.packageScopeNotice as ScopeKind | undefined) ??
					getScopeKind(packageMetadata.name),
				context,
			)),
			...((options.dependencyGuidelines ?? packageIsPublic)
				? await generateTemplateSection(
						"Dependency-Guidelines-Template.md",
						sectionOptions,
						"Using Fluid Framework libraries",
						context,
					)
				: []),
			...((options.installation ?? packageIsPublic)
				? generateInstallation(
						packageMetadata.name,
						options.devDependency,
						sectionOptions,
						context,
					)
				: []),
			...(options.importInstructions
				? generateImportInstructions(packageMetadata, sectionOptions, context)
				: []),
			...((options.apiDocs ?? packageIsPublic)
				? generateApiDocs(packageMetadata.name, sectionOptions, context)
				: []),
		];
	},
);

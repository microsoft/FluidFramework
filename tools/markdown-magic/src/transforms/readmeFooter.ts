/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Transform } from "../types.js";
import { transform } from "./options.js";
import { isPublic, readPackage } from "./packageMetadata.js";
import { generateScripts } from "./packageScripts.js";
import { packageSchema } from "./schemas.js";
import { generateTemplateSection } from "./templates.js";

export const readmeFooterTransform: Transform = transform(
	"readme-footer",
	{
		...packageSchema,
		scripts: { type: "boolean", default: false },
		clientRequirements: { type: "boolean" },
		contributionGuidelines: { type: "boolean", default: true },
		help: { type: "boolean", default: true },
		trademark: { type: "boolean", default: true },
	},
	async (options, context) => {
		const packageMetadata = await readPackage(context, options);
		const sectionOptions = { includeHeading: true };
		return [
			...(options.scripts
				? generateScripts(packageMetadata.scripts ?? {}, sectionOptions, context)
				: []),
			...((options.clientRequirements ?? isPublic(packageMetadata))
				? await generateTemplateSection(
						"Client-Requirements-Template.md",
						sectionOptions,
						"Minimum Client Requirements",
						context,
					)
				: []),
			...(options.contributionGuidelines
				? await generateTemplateSection(
						"Contribution-Guidelines-Template.md",
						sectionOptions,
						"Contribution Guidelines",
						context,
					)
				: []),
			...(options.help
				? await generateTemplateSection("Help-Template.md", sectionOptions, "Help", context)
				: []),
			...(options.trademark
				? await generateTemplateSection(
						"Trademark-Template.md",
						sectionOptions,
						"Trademark",
						context,
					)
				: []),
		];
	},
);

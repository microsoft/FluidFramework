/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Transform } from "../types.js";
import { transform } from "./options.js";
import { headingSchema } from "./schemas.js";
import { generateTemplateSection } from "./templates.js";

const templateTransforms = {
	"client-requirements": ["Client-Requirements-Template.md", "Minimum Client Requirements"],
	trademark: ["Trademark-Template.md", "Trademark"],
	"contribution-guidelines": [
		"Contribution-Guidelines-Template.md",
		"Contribution Guidelines",
	],
	"dependency-guidelines": [
		"Dependency-Guidelines-Template.md",
		"Using Fluid Framework libraries",
	],
	help: ["Help-Template.md", "Help"],
} as const;

/**
 * Creates transforms backed by shared section templates.
 *
 * @returns The template transforms indexed by marker name.
 */
export function createTemplateSectionTransforms(): Record<string, Transform> {
	const transforms: Record<string, Transform> = {};
	for (const [name, [templateName, headingText]] of Object.entries(templateTransforms)) {
		transforms[name] = transform(name, headingSchema, (options, context) =>
			generateTemplateSection(templateName, options, headingText, context),
		);
	}
	return transforms;
}

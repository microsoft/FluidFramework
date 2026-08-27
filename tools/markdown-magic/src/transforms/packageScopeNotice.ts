/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { RootContent } from "mdast";

import type { Transform, TransformContext } from "../types.js";
import { getScopeKind, readPackage, type ScopeKind, scopeValues } from "./packageMetadata.js";
import { transform } from "./options.js";
import { packageSchema } from "./schemas.js";
import { readTemplateNodes } from "./templates.js";

const scopeTemplates = {
	EXAMPLE: "Example-Package-Notice-Template.md",
	EXPERIMENTAL: "Experimental-Package-Notice-Template.md",
	INTERNAL: "Internal-Package-Notice-Template.md",
	PRIVATE: "Private-Package-Notice-Template.md",
	TOOLS: "Tools-Package-Notice-Template.md",
};

/** Generates the notice for a package kind. */
export async function generateScopeNotice(
	kind: ScopeKind | undefined,
	context: TransformContext,
): Promise<RootContent[]> {
	const templateName =
		kind === undefined || kind === "FRAMEWORK" ? undefined : scopeTemplates[kind];
	return templateName === undefined ? [] : readTemplateNodes(templateName, context);
}

export const packageScopeNoticeTransform: Transform = transform(
	"package-scope-notice",
	{
		...packageSchema,
		scopeKind: { type: "string", values: scopeValues },
	},
	async (options, context) => {
		const packageMetadata = await readPackage(context, options);
		return generateScopeNotice(
			(options.scopeKind as ScopeKind | undefined) ?? getScopeKind(packageMetadata.name),
			context,
		);
	},
);

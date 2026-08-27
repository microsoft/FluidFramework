/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Transform } from "../types.js";
import { apiDocsTransform } from "./apiDocs.js";
import { exampleAppReadmeHeaderTransform } from "./exampleAppReadmeHeader.js";
import { exampleGettingStartedTransform } from "./exampleGettingStarted.js";
import { importInstructionsTransform } from "./importInstructions.js";
import { includeCodeTransform, includeTransform } from "./include.js";
import { installationInstructionsTransform } from "./installationInstructions.js";
import { libraryReadmeHeaderTransform } from "./libraryReadmeHeader.js";
import { packageScopeNoticeTransform } from "./packageScopeNotice.js";
import { packageScriptsTransform } from "./packageScripts.js";
import { readmeFooterTransform } from "./readmeFooter.js";
import { createTemplateSectionTransforms } from "./templateSections.js";

/** Creates the complete transform record. */
export function createTransforms(): Record<string, Transform> {
	return {
		...createTemplateSectionTransforms(),
		"package-scope-notice": packageScopeNoticeTransform,
		"installation-instructions": installationInstructionsTransform,
		"api-docs": apiDocsTransform,
		"import-instructions": importInstructionsTransform,
		"example-getting-started": exampleGettingStartedTransform,
		"package-scripts": packageScriptsTransform,
		"library-readme-header": libraryReadmeHeaderTransform,
		"example-app-readme-header": exampleAppReadmeHeaderTransform,
		"readme-footer": readmeFooterTransform,
		include: includeTransform,
		"include-code": includeCodeTransform,
	};
}

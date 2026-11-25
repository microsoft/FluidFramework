/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export default {
	recurse: true,
	checkCss: true,
	checkFragments: true,
	concurrency: 20,
	retryErrors: true,
	verbosity: "error",
	skip: [
		// Check only the local site, as in the previous command.
		"^(?!http://127\\.0\\.0\\.1:3000(?:/|$))",
		// Preserve the generated Docusaurus stylesheet exclusion.
		// References in other stylesheets and inline styles are still checked.
		"^http://127\\.0\\.0\\.1:3000/assets/css/styles\\..*\\.css",
		// Key Pagefind search bundle files are verified separately in
		// tools/pipelines/deploy-website.yml by "Verify Pagefind search bundle".
		"^http://127\\.0\\.0\\.1:3000/pagefind/",
	],
};

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const routes = [
	// We previously served the API docs out of `docs/apis`.
	// Forward to current version of the API docs (`docs/api`).
	{ from: "/docs/apis", to: "/docs/api" },

	// We previously only versioned our API documentation, where now we version everything.
	// Forward versioned API paths to the new hierarchy.
	{ from: "/docs/api/v1", to: "/docs/v1/api" },
	{ from: "/docs/api/v2", to: "/docs/api" },

	// We previously supported a special path alias for accessing the "current" API docs.
	// Docusaurus handles this automatically for us, but we still need to support the old pattern.
	// Forward to current version of the API docs (`docs/api`).
	{ from: "/docs/api/current", to: "/docs/api" },

	// We previously supported a special path alias for accessing the "lts" version API docs.
	// Forward to the v1 API docs (`docs/api/v1`).
	{ from: "/docs/api/lts", to: "/docs/v1/api" },

	// Docusaurus serves the "current" version of the docs from the root path.
	// If the user explicitly navigates to "v2", we should support that.
	{ from: "/docs/v2", to: "/docs" },

	// Legacy path we wish to preserve.
	{ from: "/docs/deep/architecture", to: "/docs/concepts/architecture" },

	// Counter DDS document was removed in v2.
	// Redirect legacy URL to v1 document.
	{ from: "/docs/data-structures/counter", to: "/docs/v1/data-structures/counter" },

	// Legacy file name
	{ from: "/docs/deployment/azure-frs", to: "/docs/deployment/azure-fluid-relay" },
	{
		from: "/versioned_docs/v1/deployment/azure-frs",
		to: "/versioned_docs/v1/deployment/azure-fluid-relay",
	},
];

module.exports = routes;

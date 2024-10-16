/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// TODO: generate the routes dynamically based on the versions config

/**
 * Map of incoming URL paths to redirect URLs.
 */
const routes = [
	// We previously served the API docs out of `docs/apis`.
	// Forward to current version of the API docs (`docs/api`).
	{ from: "/docs/apis", to: "/docs/api" },

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

	// TODO
];

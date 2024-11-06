/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Map of incoming URL paths to redirect URLs
const routes = [
	// We previously served the API docs out of `docs/apis`.
	// Forward to "current" version of the API docs (`docs/api/v2`).
	{ from: "/docs/apis", to: "/docs/api/v2" },

	// Special alias for the "current" API docs.
	// Forward to `docs/api/v2`.
	{ from: "/docs/api/current", to: "/docs/api/v2" },

	// Special alias for the API docs for our current LTS (long-term support) version.
	// Forward to `docs/api/v1`.
	{ from: "/docs/api/lts", to: "/docs/api/v1" },
];

module.exports = routes;

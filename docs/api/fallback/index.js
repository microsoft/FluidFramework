/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Map of incoming URL paths to redirect URLs
const routes = new Map([
	["/docs/apis", "/docs/api/v2"],
	["/docs/api/current", "/docs/api/v2"],
	["/docs/api/lts", "/docs/api/v1"],
]);

/**
 * Handles incoming HTTP requests and redirects them to the appropriate URL based on the current and LTS versions.
 * It reads the versions from /docs/data/versions.json and matches the incoming URL to a set of predefined routes.
 * If a matching route is found, it constructs and returns the redirect URL. Otherwise, it returns a 404 response.
 */
module.exports = async (context, { headers }) => {
	const route = [...routes].find(([path, _]) => headers["x-ms-original-url"].includes(path));

	context.res = {
		status: route ? 302 : 404,
		headers: { location: route ? headers["x-ms-original-url"].replace(...route) : "/404" },
	};
};

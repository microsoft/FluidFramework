/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const routes = require("./routes.js");

/**
 * Handles incoming HTTP requests and redirects them based on configured {@link routes}.
 * If no route is configured, will redirect to `/404`.
 *
 * @remarks Azure will only call this for URLs without matching static files.
 */
async function fallback(context, request) {
	const originalUrl = request.headers["x-ms-original-url"];
	const { pathname, search } = new URL(originalUrl);

	// Find the redirect for the provided path, if any.
	const route = routes.find(({ from }) => pathname.startsWith(from));

	if (route) {
		// A redirect was configured for the path.
		// Forward to the new location.
		const redirectLocation = `${pathname.replace(route.from, route.to)}${search}`;
		return {
			status: 302,
			headers: { location: redirectLocation },
		};
	} else {
		// No redirect was configured for the provided path.
		// Return 404.
		return {
			status: 404,
			headers: { location: "/404" },
		};
	}
}

module.exports = fallback;

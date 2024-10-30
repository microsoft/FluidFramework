/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// const routes = require("./routes.js");

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

	// TODO: anything else?
];

/**
 * Handles incoming HTTP requests and redirects them to the appropriate URL based on the current and LTS versions.
 * It reads the versions from /docs/data/versions.json and matches the incoming URL to a set of predefined routes.
 * If a matching route is found, it constructs and returns the redirect URL. Otherwise, it returns a 404 response.
 */
module.exports = async (context, { headers }) => {
	// This URL has been proxied as there was no static file matching it.
	const originalUrl = headers["x-ms-original-url"];
	context.log(`x-ms-original-url: ${originalUrl}`);

	if (originalUrl === undefined) {
		context.log("No original URL found. Redirecting to /404.");
		context.res = {
			status: 302,
			headers: { location: "/404" },
		};
		return;
	}

	const { pathname, search } = new URL(originalUrl);

	const route = routes.find(({ from }) => pathname.startsWith(from));

	if (route === undefined) {
		context.log(
			`No explicit redirect for ${originalUrl}. Redirecting to /404.`,
		);
		context.res = {
			status: 302,
			headers: { location: `/404?originalUrl=${encodeURIComponent(originalUrl)}` },
		};
		return;
	}

	const redirectLocation = `${pathname.replace(route.from, route.to)}${search}`;
	context.log(`Redirecting ${originalUrl} to ${redirectLocation}.`);
	context.res = {
		status: 302,
		headers: { location: redirectLocation },
	};
};

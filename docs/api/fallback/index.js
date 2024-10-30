/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const routes = require("./routes.js");

/**
 * Handles incoming HTTP requests and redirects them based on configured {@link routes}.
 * If no route is configured, will redirect to `/404`.
 */
async function fallback(context, request) {
	// This URL has been proxied as there was no static file matching it.
	const originalUrl = request.headers["x-ms-original-url"];
	context.log(`x-ms-original-url: ${originalUrl}`);

	if (!originalUrl) {
		context.log("No original URL found. Redirecting to \"/404\".");
		context.res = {
			status: 302,
			headers: { location: "/404" },
		};
		return;
	}

	const { pathname, search } = new URL(originalUrl);

	const route = routes.find(({ from }) => pathname.startsWith(from));

	if (!route) {
		context.log(
			`No explicit redirect configured for "${originalUrl}". Redirecting to "/404".`,
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

module.exports = fallback;

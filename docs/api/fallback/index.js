/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { routes } from "./routes.js";

/**
 * Handles incoming HTTP requests and redirects them to the appropriate URL based on the current and LTS versions.
 * It reads the versions from /docs/data/versions.json and matches the incoming URL to a set of predefined routes.
 * If a matching route is found, it constructs and returns the redirect URL. Otherwise, it returns a 404 response.
 */
module.exports = async (context, { headers }) => {
	const { pathname, search } = new URL(headers["x-ms-original-url"]);
	const route = routes.find(({ from }) => pathname.startsWith(from));

	console.log(`Incoming request: ${pathname}`);

	if (route === undefined) {
		context.res = {
			status: 404,
			headers: { location: "/404" },
		};
	} else {
		const redirectLocation = `${pathname.replace(route.from, route.to)}${search}`;
		console.log(`Redirecting from ${pathname} to ${redirectLocation}!`);
		context.res = {
			status: 302,
			headers: { location: redirectLocation },
		};
	}
};

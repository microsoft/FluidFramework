/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Layout from "@theme/Layout";
import React from "react";
import { v4 as uuidv4 } from "uuid";

import appInsights from "@site/src/appInsights";
import { Homepage } from "@site/src/components/home";

/**
 * Helper function to get a cookie value
 * @param name - The name of the cookie
 * @returns - The value of the cookie
 */
function getCookie(name): string | undefined {
	const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
	return match ? decodeURIComponent(match[2]) : undefined;
}

/**
 * Helper function to set a cookie value
 * @param name - The name of the cookie
 * @param value - The value to set
 * @param days - The number of days until the cookie expires
 */
function setCookie(name, value, days): void {
	const expires = new Date(Date.now() + days * 86400000).toUTCString();
	// eslint-disable-next-line unicorn/no-document-cookie
	document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Strict`;
}

/**
 * Initialize Application Insights and set the user ID.
 */
if (appInsights !== undefined) {
	const USAGE_ANALYTICS_COOKIE = "userId";
	// Retrieve or generate the userId
	let userId = getCookie(USAGE_ANALYTICS_COOKIE);
	if (userId === undefined) {
		userId = uuidv4();
		setCookie(USAGE_ANALYTICS_COOKIE, userId, { expires: 365 });
	}

	appInsights.context.user.id = userId;
}

/**
 * The website homepage root (including the header and footer injected by Docusaurus).
 */
export default function Home(): React.ReactElement {
	return (
		<Layout>
			<Homepage />
		</Layout>
	);
}

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
 * Gets a cookie value
 * @param name - The name of the cookie
 * @returns - The value of the cookie
 */
function getCookie(name: string): string | undefined {
	const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
	return match ? decodeURIComponent(match[2]) : undefined;
}

/**
 * Sets a cookie value
 * @param cookieName - The name of the cookie
 * @param value - The value to set
 * @param days - The number of days until the cookie expires
 */
function setCookie(cookieName: string, value: string, days: number): void {
	if (!/^[\w-]+$/.test(cookieName)) {
		throw new Error(
			`Invalid cookie name: "${cookieName}". Only alphanumeric characters, hyphens, and underscores are allowed.`,
		);
	}
	const expires = new Date(Date.now() + days * 86400000).toUTCString();
	// eslint-disable-next-line unicorn/no-document-cookie
	document.cookie = `${cookieName}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Strict`;
}

// Initialize Application Insights and set the user ID.
if (appInsights !== undefined) {
	const USAGE_ANALYTICS_COOKIE = "userId";
	// Retrieve or generate the userId
	let userId = getCookie(USAGE_ANALYTICS_COOKIE);
	if (userId === undefined) {
		userId = uuidv4();
		setCookie(USAGE_ANALYTICS_COOKIE, userId, 365);
	}

	appInsights.context.user.id = userId;
}

/**
 * The website homepage root (including the header and footer injected by Docusaurus).
 */
export default function Home(): React.ReactElement {
	return (
		<Layout>
			<main>
				<Homepage />
			</main>
		</Layout>
	);
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Layout from "@theme/Layout";
import React, { Suspense } from "react";
import { v4 as uuidv4 } from "uuid";

import appInsights from "../appInsights";

if (typeof window !== "undefined") {
	const userId = localStorage.getItem("userId") ?? uuidv4();
	localStorage.setItem("userId", userId);
	appInsights.context.user.id = userId;

	const currentUrl = window.location.pathname;

	let pageRoute = currentUrl;
	pageRoute = currentUrl ?? window.location.href;
	appInsights.trackPageView({ name: pageRoute });
}

appInsights.trackEvent({ name: "UserActivity", properties: { action: "Viewed Page" } });

import { Homepage } from "@site/src/components/home";

/**
 * The website homepage root (including the header and footer injected by Docusaurus).
 */
export default function Home(): React.ReactElement {
	return (
		<Layout>
			<Suspense fallback={<div />}></Suspense>
			<Homepage />
		</Layout>
	);
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Layout from "@theme/Layout";
import Cookies from "js-cookie";
import React from "react";
import { v4 as uuidv4 } from "uuid";

import appInsights from "@site/src/appInsights";
import { Homepage } from "@site/src/components/home";

/**
 * Initialize Application Insights and set the user ID.
 */
if (typeof window !== "undefined" && appInsights) {
	const USAGE_ANALYTICS_COOKIE = "userId";

	// Retrieve or generate the userId
	let userId = Cookies.get(USAGE_ANALYTICS_COOKIE);
	if (userId === undefined) {
		userId = uuidv4();
		Cookies.set(USAGE_ANALYTICS_COOKIE, userId, { expires: 30 });
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

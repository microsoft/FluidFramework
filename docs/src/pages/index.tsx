/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

 ///<reference types="@wcp/wcp-consent" />
import Layout from "@theme/Layout";
import React, {Suspense} from "react";
import appInsights from "../appInsights";
const CookieBanner = React.lazy(() => import("../components/CookieBanner"));

import {v4 as uuidv4} from "uuid";

if (typeof window !== 'undefined') {
	const userId = localStorage.getItem("userId") || uuidv4();
	localStorage.setItem("userId", userId);
	appInsights.context.user.id = userId;

	const currentUrl = window.location.pathname;

	let pageRoute = currentUrl;
	if(currentUrl === "/" || currentUrl === "") {
		pageRoute = window.location.href;
	}else {
		pageRoute = currentUrl;
	}
	appInsights.trackPageView({name: pageRoute});
}

appInsights.trackEvent({name: "UserActivity", properties: {action: "Viewed Page"}});

import { Homepage } from "@site/src/components/home";

/**
 * The website homepage root (including the header and footer injected by Docusaurus).
 */
export default function Home(): React.ReactElement {
	return (
		<Layout>
			<Suspense fallback={<div/>}>
			<CookieBanner/>
			</Suspense>
			<Homepage />
		</Layout>
	);
}

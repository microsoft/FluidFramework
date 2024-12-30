/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line spaced-comment
/// <reference types="@wcp/wcp-consent" />
import React, { useEffect, useState } from "react";

import { updateAppInsightsConsent } from "../appInsights";

/**
 * Renders the cookie banner using the WcpConsent package if available, otherwise a mock cookie banner.
 * @returns A React element representing the cookie banner.
 */
const CookieBanner = (): React.ReactElement => {
	const [wcpPackageAvailable, setWcpPackageAvailable] = useState<boolean>(false);

	const MockCookieBanner = (): React.ReactElement => {
		return (
			<div
				id="cookie-banner-test"
				style={{ backgroundColor: "#f1f1f1", padding: "10px", textAlign: "center" }}
			>
				<p>
					This site uses cookies to improve your experience. By continuing to use this
					site, you consent to the use of cookies.
				</p>
				<button onClick={() => alert("Cookies Accepted!")}>Accept</button>
				<button onClick={() => alert("Cookies Declined!")}>Decline</button>
			</div>
		);
	};

	/**
	 * Initializes the WcpConsent package if available and updates the Application Insights consent setting.
	 */
	const initializeWcpConsent = (): void => {
		try {
			let siteConsent: WcpConsent.SiteConsent;
			WcpConsent?.init(
				"en-US",
				"cookie-banner",
				(err: Error | undefined, _siteConsent) => {
					if (err) {
						console.error("WcpConsent initialization error", err);
					} else if (_siteConsent !== undefined) {
						siteConsent = _siteConsent;
						console.log("WcpConsent initialized", siteConsent);
						const consent = siteConsent.getConsent().Analytics;
						updateAppInsightsConsent(consent);
					}
				},
				(newConsent: Record<WcpConsent.consentCategories, boolean>) => {
					console.log("Consent updated", newConsent);
					updateAppInsightsConsent(newConsent.Analytics);
				},
			);
			setWcpPackageAvailable(true);
		} catch (error) {
			console.error("Error initializing WcpConsent", error);
		}
	};

	useEffect(() => {
		if (typeof window !== "undefined") {
			console.log("Initializing WcpConsent");
			initializeWcpConsent();
		}
	}, [wcpPackageAvailable]);

	return wcpPackageAvailable === true ? <div id="cookie-banner"></div> : <MockCookieBanner />;
};

export default CookieBanner;

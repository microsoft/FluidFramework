/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line spaced-comment
/// <reference types="@wcp/wcp-consent" />
import React, { useEffect, useState } from "react";

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

	useEffect(() => {
		if (typeof window !== "undefined") {
			console.log("Initializing WcpConsent");

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
							console.log("Initial consent", siteConsent.getConsent());
						}
					},
					(newConsent: Record<WcpConsent.consentCategories, boolean>) => {
						console.log("Consent changed", newConsent);
					},
				);
				setWcpPackageAvailable(true);
			} catch (error) {
				console.error("Error initializing WcpConsent", error);
			}
		}
	}, [wcpPackageAvailable]);
	return wcpPackageAvailable === true ? <div id="cookie-banner"></div> : <MockCookieBanner />;
};

export default CookieBanner;

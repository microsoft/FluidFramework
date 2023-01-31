/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fromBase64ToUtf8 } from "@fluidframework/common-utils";

/**
 * Checks if response headers contains `www-authenticate` header and extracts claims that should be
 * passed to token authority when requesting new token.
 *
 * Header sample:
 * www-authenticate=Bearer realm="",
 * authorization_uri="https://login.microsoftonline.com/common/oauth2/authorize",
 * error="insufficient_claims",
 * claims="dummy"
 *
 * Note that claims value is base64 encoded inside header but this method will return unencoded value.
 */
export function parseAuthErrorClaims(responseHeader: Headers): string | undefined {
	const authHeaderData = responseHeader.get("www-authenticate");
	if (!authHeaderData) {
		return undefined;
	}

	let claims: string | undefined;
	let detectedErrorIndicator = false;
	authHeaderData.split(",").map((section) => {
		const nameValuePair = section.split("=");
		// Values can be encoded and contain '=' symbol inside so it is possible to have more than one
		if (nameValuePair.length >= 2) {
			if (!detectedErrorIndicator && nameValuePair[0].trim().toLowerCase() === "error") {
				detectedErrorIndicator =
					JSON.parse(nameValuePair[1].trim().toLowerCase()) === "insufficient_claims";
			} else if (!claims && nameValuePair[0].trim().toLowerCase() === "claims") {
				claims = fromBase64ToUtf8(
					JSON.parse(section.substring(section.indexOf("=") + 1).trim()),
				);
			}
		}
	});

	return detectedErrorIndicator ? claims : undefined;
}

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { fromBase64ToUtf8 } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils/internal";

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
			assert(
				nameValuePair[0] !== undefined,
				"nameValuePair[0] is undefined in parseAuthErrorTenant",
			);
			if (!detectedErrorIndicator && nameValuePair[0].trim().toLowerCase() === "error") {
				assert(
					nameValuePair[1] !== undefined,
					"nameValuePair[1] is undefined in parseAuthErrorTenant",
				);
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

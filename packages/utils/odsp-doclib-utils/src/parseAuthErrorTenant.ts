/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const oAuthBearerScheme = "Bearer";

/**
 * Checks if response headers contains `www-authenticate` header and extracts tenant id that should be
 * used to identify authority which must be used to issue access token for protected resource.
 * Tenant id is represented by "realm" property. More details can be found here:
 * {@link https://tools.ietf.org/html/rfc2617#page-8}
 *
 * @example
 * Header sample:
 *
 * ```
 * www-authenticate=Bearer realm="03d0c210-38e8-47d7-9bc9-9ff2cd5ea7bc",
 * client_id="00000003-0000-0ff1-ce00-000000000000",
 * trusted_issuers="00000001-0000-0000-c000-000000000000@*,D3776938-3DBA-481F-A652-4BEDFCAB7CD8@*,
 * https://sts.windows.net/*,00000003-0000-0ff1-ce00-000000000000@90140122-8516-11e1-8eff-49304924019b",
 * authorization_uri="https://login.windows.net/common/oauth2/authorize"
 * ```
 */
export function parseAuthErrorTenant(responseHeader: Headers): string | undefined {
    const authHeaderData = responseHeader.get("www-authenticate");
    if (!authHeaderData) {
        return undefined;
    }

    // header value must contain 'Bearer' scheme
    const indexOfBearerInfo = authHeaderData.indexOf(oAuthBearerScheme);
    if (indexOfBearerInfo < 0) {
        return undefined;
    }

    let tenantId: string | undefined;
    authHeaderData
        .substring(indexOfBearerInfo + oAuthBearerScheme.length)
        .split(",")
        .map((section) => {
            if (!tenantId) {
                const nameValuePair = section.split("=");
                // values can be encoded and contain '=' symbol inside so it is possible to have more than one
                if (nameValuePair.length >= 2) {
                    if (nameValuePair[0].trim().toLowerCase() === "realm") {
                        tenantId = JSON.parse(nameValuePair[1].trim());
                    }
                }
            }
        });

    return tenantId;
  }

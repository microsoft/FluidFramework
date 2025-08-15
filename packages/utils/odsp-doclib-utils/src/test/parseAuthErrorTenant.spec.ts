/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { parseAuthErrorTenant } from "../parseAuthErrorTenant.js";

const invalidWwwAuthenticateHeaderWithoutBearerScheme =
	'Random_scheme client_id="00000003-0000-0ff1-ce00-000000000000",trusted_issuers="00000001-0000-0000-c000-000000000000@*,D3776938-3DBA-481F-A652-4BEDFCAB7CD8@*,https://sts.windows.net/*/,00000003-0000-0ff1-ce00-000000000000@90140122-8516-11e1-8eff-49304924019b",authorization_uri="https://login.windows.net/common/oauth2/authorize"';
const invalidWwwAuthenticateHeaderWithoutRealm =
	'Bearer client_id="00000003-0000-0ff1-ce00-000000000000",trusted_issuers="00000001-0000-0000-c000-000000000000@*,D3776938-3DBA-481F-A652-4BEDFCAB7CD8@*,https://sts.windows.net/*/,00000003-0000-0ff1-ce00-000000000000@90140122-8516-11e1-8eff-49304924019b",authorization_uri="https://login.windows.net/common/oauth2/authorize"';
const validWwwAuthenticateHeaderForOrgId =
	'Bearer realm="6c482541-f706-4168-9e58-8e35a9992f58",client_id="00000003-0000-0ff1-ce00-000000000000",trusted_issuers="00000001-0000-0000-c000-000000000000@*,D3776938-3DBA-481F-A652-4BEDFCAB7CD8@*,https://sts.windows.net/*/,00000003-0000-0ff1-ce00-000000000000@90140122-8516-11e1-8eff-49304924019b",authorization_uri="https://login.windows.net/common/oauth2/authorize",error="insufficient_claims",claims="eyJhY2Nlc3NfdG9rZW4iOnsibmJmIjp7ImVzc2VudGlhbCI6dHJ1ZSwgInZhbHVlIjoiMTU5Nzk1OTA5MCJ9fX0="';
const validWwwAuthenticateHeaderForMsa =
	'Wlid1.1 realm="WindowsLive", fault="BadContextToken", policy="MBI_SSL", ver="6.7.6631.0", target="ssl.live.com", siteId="ssl.live.com", Bearer realm="9188040d-6c67-4c5b-b112-36a304b66dad",client_id="00000003-0000-0ff1-ce00-000000000000",trusted_issuers="00000001-0000-0000-c000-000000000000@*,D3776938-3DBA-481F-A652-4BEDFCAB7CD8@*,https://sts.windows.net/*/,00000003-0000-0ff1-ce00-000000000000@90140122-8516-11e1-8eff-49304924019b",authorization_uri="https://login.windows.net/common/oauth2/authorize"';

describe("parseAuthErrorTenant", () => {
	it("returns undefined if headers does not have expected entry", () => {
		const headers = { get: (_name: string) => undefined } as unknown as Headers;
		const result = parseAuthErrorTenant(headers);
		assert.strictEqual(result, undefined);
	});

	it("returns undefined if header does not have expected OAuth scheme", () => {
		const headers = {
			get: (name: string) =>
				name.toLowerCase() === "www-authenticate"
					? invalidWwwAuthenticateHeaderWithoutBearerScheme
					: undefined,
		} as unknown as Headers;
		const result = parseAuthErrorTenant(headers);
		assert.strictEqual(result, undefined);
	});

	it("returns undefined if header does not have expected realm indicator", () => {
		const headers = {
			get: (name: string) =>
				name.toLowerCase() === "www-authenticate"
					? invalidWwwAuthenticateHeaderWithoutRealm
					: undefined,
		} as unknown as Headers;
		const result = parseAuthErrorTenant(headers);
		assert.strictEqual(result, undefined);
	});

	it("returns realm value in OrgId case", () => {
		const headers = {
			get: (name: string) =>
				name.toLowerCase() === "www-authenticate"
					? validWwwAuthenticateHeaderForOrgId
					: undefined,
		} as unknown as Headers;
		const result = parseAuthErrorTenant(headers);
		assert.strictEqual(result, "6c482541-f706-4168-9e58-8e35a9992f58");
	});

	it("returns realm value in MSA case", () => {
		const headers = {
			get: (name: string) =>
				name.toLowerCase() === "www-authenticate"
					? validWwwAuthenticateHeaderForMsa
					: undefined,
		} as unknown as Headers;
		const result = parseAuthErrorTenant(headers);
		assert.strictEqual(result, "9188040d-6c67-4c5b-b112-36a304b66dad");
	});
});

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */

import assert from "assert";
import { parseAuthErrorTenant } from "../parseAuthErrorTenant";

const invalidWwwAuthenticateHeaderWithoutBearerScheme =
  "Random_scheme client_id=\"00000003-0000-0ff1-ce00-000000000000\",trusted_issuers=\"00000001-0000-0000-c000-000000000000@*,D3776938-3DBA-481F-A652-4BEDFCAB7CD8@*,https://sts.windows.net/*/,00000003-0000-0ff1-ce00-000000000000@90140122-8516-11e1-8eff-49304924019b\",authorization_uri=\"https://login.windows.net/common/oauth2/authorize\"";
const invalidWwwAuthenticateHeaderWithoutRealm =
  "Bearer client_id=\"00000003-0000-0ff1-ce00-000000000000\",trusted_issuers=\"00000001-0000-0000-c000-000000000000@*,D3776938-3DBA-481F-A652-4BEDFCAB7CD8@*,https://sts.windows.net/*/,00000003-0000-0ff1-ce00-000000000000@90140122-8516-11e1-8eff-49304924019b\",authorization_uri=\"https://login.windows.net/common/oauth2/authorize\"";
const validWwwAuthenticateHeader =
  "Bearer realm=\"6c482541-f706-4168-9e58-8e35a9992f58\",client_id=\"00000003-0000-0ff1-ce00-000000000000\",trusted_issuers=\"00000001-0000-0000-c000-000000000000@*,D3776938-3DBA-481F-A652-4BEDFCAB7CD8@*,https://sts.windows.net/*/,00000003-0000-0ff1-ce00-000000000000@90140122-8516-11e1-8eff-49304924019b\",authorization_uri=\"https://login.windows.net/common/oauth2/authorize\"";

describe("parseAuthErrorTenant", () => {
  it("returns undefined if headers does not have expected entry", () => {
    const headers = { get: (_name: string) => undefined };
    const result = parseAuthErrorTenant(headers as any);
    assert.strictEqual(result, undefined);
  });

  it("returns undefined if header does not have expected OAuth scheme", () => {
    const headers = {
      get: (name: string) =>
        name.toLowerCase() === "www-authenticate" ? invalidWwwAuthenticateHeaderWithoutBearerScheme : undefined,
    };
    const result = parseAuthErrorTenant(headers as any);
    assert.strictEqual(result, undefined);
  });

  it("returns undefined if header does not have expected realm indicator", () => {
    const headers = {
      get: (name: string) =>
        name.toLowerCase() === "www-authenticate" ? invalidWwwAuthenticateHeaderWithoutRealm : undefined,
    };
    const result = parseAuthErrorTenant(headers as any);
    assert.strictEqual(result, undefined);
  });

  it("returns realm value", () => {
    const headers = {
      get: (name: string) => name.toLowerCase() === "www-authenticate" ? validWwwAuthenticateHeader : undefined,
    };
    const result = parseAuthErrorTenant(headers as any);
    assert.strictEqual(result, "6c482541-f706-4168-9e58-8e35a9992f58");
  });
});

/* eslint-disable max-len */
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { parseAuthErrorClaims } from "../parseAuthErrorClaims";

const invalidWwwAuthenticateHeaderWithoutError =
  "Bearer realm=\"6c482541-f706-4168-9e58-8e35a9992f58\",client_id=\"00000003-0000-0ff1-ce00-000000000000\",trusted_issuers=\"00000001-0000-0000-c000-000000000000@*,D3776938-3DBA-481F-A652-4BEDFCAB7CD8@*,https://sts.windows.net/*/,00000003-0000-0ff1-ce00-000000000000@90140122-8516-11e1-8eff-49304924019b\",authorization_uri=\"https://login.windows.net/common/oauth2/authorize\",not_error=\"insufficient_claims\",claims=\"eyJhY2Nlc3NfdG9rZW4iOnsibmJmIjp7ImVzc2VudGlhbCI6dHJ1ZSwgInZhbHVlIjoiMTU5Nzk1OTA5MCJ9fX0=\"";
const invalidWwwAuthenticateHeaderWithUnexpectedErrorValue =
  "Bearer realm=\"6c482541-f706-4168-9e58-8e35a9992f58\",client_id=\"00000003-0000-0ff1-ce00-000000000000\",trusted_issuers=\"00000001-0000-0000-c000-000000000000@*,D3776938-3DBA-481F-A652-4BEDFCAB7CD8@*,https://sts.windows.net/*/,00000003-0000-0ff1-ce00-000000000000@90140122-8516-11e1-8eff-49304924019b\",authorization_uri=\"https://login.windows.net/common/oauth2/authorize\",error=\"not_insufficient_claims\",claims=\"eyJhY2Nlc3NfdG9rZW4iOnsibmJmIjp7ImVzc2VudGlhbCI6dHJ1ZSwgInZhbHVlIjoiMTU5Nzk1OTA5MCJ9fX0=\"";
const invalidWwwAuthenticateHeaderWithoutClaims =
  "Bearer realm=\"6c482541-f706-4168-9e58-8e35a9992f58\",client_id=\"00000003-0000-0ff1-ce00-000000000000\",trusted_issuers=\"00000001-0000-0000-c000-000000000000@*,D3776938-3DBA-481F-A652-4BEDFCAB7CD8@*,https://sts.windows.net/*/,00000003-0000-0ff1-ce00-000000000000@90140122-8516-11e1-8eff-49304924019b\",authorization_uri=\"https://login.windows.net/common/oauth2/authorize\",error=\"insufficient_claims\",not_claims=\"eyJhY2Nlc3NfdG9rZW4iOnsibmJmIjp7ImVzc2VudGlhbCI6dHJ1ZSwgInZhbHVlIjoiMTU5Nzk1OTA5MCJ9fX0=\"";
const invalidWwwAuthenticateHeaderWithMalformedClaimsValue =
  "Bearer realm=\"6c482541-f706-4168-9e58-8e35a9992f58\",client_id=\"00000003-0000-0ff1-ce00-000000000000\",trusted_issuers=\"00000001-0000-0000-c000-000000000000@*,D3776938-3DBA-481F-A652-4BEDFCAB7CD8@*,https://sts.windows.net/*/,00000003-0000-0ff1-ce00-000000000000@90140122-8516-11e1-8eff-49304924019b\",authorization_uri=\"https://login.windows.net/common/oauth2/authorize\",error=\"insufficient_claims\",claims=\"not_encoded\"";
const validWwwAuthenticateHeader =
  "Bearer realm=\"6c482541-f706-4168-9e58-8e35a9992f58\",client_id=\"00000003-0000-0ff1-ce00-000000000000\",trusted_issuers=\"00000001-0000-0000-c000-000000000000@*,D3776938-3DBA-481F-A652-4BEDFCAB7CD8@*,https://sts.windows.net/*/,00000003-0000-0ff1-ce00-000000000000@90140122-8516-11e1-8eff-49304924019b\",authorization_uri=\"https://login.windows.net/common/oauth2/authorize\",error=\"insufficient_claims\",claims=\"eyJhY2Nlc3NfdG9rZW4iOnsibmJmIjp7ImVzc2VudGlhbCI6dHJ1ZSwgInZhbHVlIjoiMTU5Nzk1OTA5MCJ9fX0=\"";

describe("parseAuthErrorClaims", () => {
  it("returns undefined if headers does not have expected entry", async () => {
    const headers = { get: (_name: string) => undefined };
    const result = parseAuthErrorClaims(headers as any);
    assert.equal(result, undefined);
  });

  it("returns undefined if header does not have expected error indicator", async () => {
    const headers = {
      get: (name: string) =>
        name.toLowerCase() === "www-authenticate" ? invalidWwwAuthenticateHeaderWithoutError : undefined,
    };
    const result = parseAuthErrorClaims(headers as any);
    assert.equal(result, undefined);
});

  it("returns undefined if error in header does not match expected value", async () => {
    const headers = {
      get: (name: string) =>
        name.toLowerCase() === "www-authenticate" ? invalidWwwAuthenticateHeaderWithUnexpectedErrorValue : undefined,
    };
    const result = parseAuthErrorClaims(headers as any);
    assert.equal(result, undefined);
  });

  it("returns undefined if header does not have expected claims indicator", async () => {
    const headers = {
      get: (name: string) =>
        name.toLowerCase() === "www-authenticate" ? invalidWwwAuthenticateHeaderWithoutClaims : undefined,
    };
    const result = parseAuthErrorClaims(headers as any);
    assert.equal(result, undefined);
  });

  it("throws if claims value is in unexpected format", async () => {
    const headers = {
      get: (name: string) =>
        name.toLowerCase() === "www-authenticate" ? invalidWwwAuthenticateHeaderWithMalformedClaimsValue : undefined,
    };
    const testFunc = () => parseAuthErrorClaims(headers as any);
    assert.throws(testFunc);
  });

  it("returns decoded claims value", async () => {
    const headers = {
      get: (name: string) => (name.toLowerCase() === "www-authenticate" ? validWwwAuthenticateHeader : undefined),
    };
    const result = parseAuthErrorClaims(headers as any);
    assert.equal(result, "{\"access_token\":{\"nbf\":{\"essential\":true, \"value\":\"1597959090\"}}}");
  });
});

import * as assert from "assert";
import { TokenProvider } from "../token";

describe("TokenProvider", () => {

    it("Should have the correct headers", () => {
        const tokenProvider = new TokenProvider("myStorageToken", "mySocketToken");

        const headers = tokenProvider.getStorageHeaders();
        const queryParams = tokenProvider.getStorageQueryParams();

        assert.equal(Object.keys(headers).length, 1, "The header length is wrong");
        assert.equal(Object.keys(queryParams).length, 0, "The query params length is wrong");

        assert.equal(headers.Authorization, "Bearer myStorageToken", "The authorization header is wrong");
    });

    it("Should have the correct query params", () => {
        const tokenProvider = new TokenProvider("?access_token=123", "mySocketToken");

        const headers = tokenProvider.getStorageHeaders();
        const queryParams = tokenProvider.getStorageQueryParams();

        assert.equal(Object.keys(headers).length, 0, "The header length is wrong");
        assert.equal(Object.keys(queryParams).length, 1, "The query params length is wrong");

        assert.equal(queryParams.access_token, "123", "The query params value is wrong");
    });

    it("Should have the correct query params with multiple values", () => {
        const tokenProvider = new TokenProvider("?access_token=123&auth_scheme=tempauth", "mySocketToken");

        const headers = tokenProvider.getStorageHeaders();
        const queryParams = tokenProvider.getStorageQueryParams();

        assert.equal(Object.keys(headers).length, 0, "The header length is wrong");
        assert.equal(Object.keys(queryParams).length, 2, "The query params length is wrong");

        assert.equal(queryParams.access_token, "123", "The query params value is wrong");
        assert.equal(queryParams.auth_scheme, "tempauth", "The query params value is wrong");
    });
});

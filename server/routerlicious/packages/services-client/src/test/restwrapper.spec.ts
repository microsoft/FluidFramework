/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import { RestWrapper } from "../restWrapper";

describe("RestWrapper", () => {
    const baseurl = "https://fake.microsoft.com";
    const requestUrl = "/fakerequesturl/";
    const maxContentLength = 1000 * 1024 * 1024;
    let axiosMock: Partial<AxiosInstance>;
    let axiosErrorMock: Partial<AxiosInstance>;
    let requestOptions: AxiosRequestConfig;

    before(() => {
        axiosMock = {
            request: async (options?) => new Promise<AxiosResponse>(
                (resolve, reject) => {
                    requestOptions = options;
                    const response: AxiosResponse = {
                        config: {},
                        data: {},
                        headers: {},
                        request: options.responseType,
                        status: 200,
                        statusText: "OK",
                    };

                    resolve(response);
                },
            ),
        };

        axiosErrorMock = {
            request: async (options?) => new Promise<AxiosResponse>(
                (resolve, reject) => {
                    requestOptions = options;

                    const response: AxiosResponse = {
                        config: options,
                        data: {},
                        headers: {},
                        request: options.responseType,
                        status: 500,
                        statusText: "ServerError",
                    };

                    const err: AxiosError = {
                        code: "500",
                        config: options,
                        message: "",
                        name: "ServerError",
                        request: {},
                        response,
                    };

                    throw err;
                },
            ),
        };
    });

    describe(".get", () => {

        it("Invalid Response Code should reject Promise", async () => {
            // arrange
            const rw = new RestWrapper(baseurl, {}, {}, false, maxContentLength, axiosErrorMock as AxiosInstance);

            // act/assert
            await rw.get(requestUrl).then(
                // tslint:disable-next-line:no-void-expression
                () => assert.fail("Promise was not rejected"),
                // tslint:disable-next-line:no-void-expression
                (err) => assert.ok(err, "Invalid response code rejected Promise"),
            );
        });

        it("Standard properties should not change", async () => {
            // arrange
            const rw = new RestWrapper(baseurl, undefined, {}, false, maxContentLength, axiosMock as AxiosInstance);

            // act
            await rw.get(requestUrl);

            // assert
            assert.equal(baseurl, requestOptions.baseURL, "baseURL should be the same");
            assert.equal(requestUrl, requestOptions.url, "requestUrl should be the same");
            assert.equal(undefined, requestOptions.headers as {}, "Headers should be empty");
        });

        it("Default QueryString and Default Headers", async () => {
            // arrange
            const defaultHeaders = { h1: "valueh1", h2: "valueh2" };
            const defaultQueryString = { q1: "valueq1", q2: "valueq2" };
            const outputUrl = `${requestUrl}?q1=valueq1&q2=valueq2&cacheBust=`;
            const rw = new RestWrapper(
                baseurl,
                defaultHeaders,
                defaultQueryString,
                true, // cacheBust
                maxContentLength,
                axiosMock as AxiosInstance,
            );

            // act
            await rw.get(requestUrl);

            // assert
            // tslint:disable-next-line:max-line-length
            assert.equal(outputUrl, requestOptions.url.substring(0, outputUrl.length), "requestUrl should be the same");
            assert.equal(defaultHeaders.h1, requestOptions.headers.h1 as string, "Header1 value should be correct");
            assert.equal(defaultHeaders.h2, requestOptions.headers.h2 as string, "Header2 value should be correct");
        });

        it("Default and Request, QueryString and Headers", async () => {
            // arrange
            const defaultHeaders = { h1: "valueh1", h2: "valueh2" };
            const requestHeaders = { h1: "valueh11", h3: "valueh3" };
            const defaultQueryString = { q1: "valueq1", q2: "valueq2" };
            const requestQueryString = { q1: "valueq11", q3: "valueq3" };
            const outputUrl = `${requestUrl}?q1=valueq11&q2=valueq2&q3=valueq3&cacheBust=`;
            const rw = new RestWrapper(
                baseurl,
                defaultHeaders,
                defaultQueryString,
                true, // cacheBust
                maxContentLength,
                axiosMock as AxiosInstance,
            );

            // act
            await rw.get(requestUrl, requestQueryString, requestHeaders);

            // assert
            assert.equal(outputUrl, requestOptions.url.substring(0, outputUrl.length), "requestUrl should be the same");
            assert.equal(requestHeaders.h1, requestOptions.headers.h1 as string, "Header1 value should be updated");
            assert.equal(defaultHeaders.h2, requestOptions.headers.h2 as string, "Header2 value should be correct");
            assert.equal(requestHeaders.h3, requestOptions.headers.h3 as string, "Header2 value should be added");
        });
    });

    describe(".post", () => {

        it("Invalid Response Code should reject Promise", async () => {
            // arrange
            const rw = new RestWrapper(baseurl, {}, {}, false, maxContentLength, axiosErrorMock as AxiosInstance);

            // act/assert
            await rw.post(requestUrl, {}).then(
                // tslint:disable-next-line:no-void-expression
                () => assert.fail("Promise was not rejected"),
                // tslint:disable-next-line:no-void-expression
                (err) => assert.ok(err, "Invalid response code rejected Promise"),
            );
        });

        it("Standard properties should not change", async () => {
            // arrange
            const rw = new RestWrapper(baseurl, undefined, {}, false, maxContentLength, axiosMock as AxiosInstance);

            // act
            await rw.post(requestUrl, {});

            // assert
            assert.equal(baseurl, requestOptions.baseURL, "baseURL should be the same");
            assert.equal(requestUrl, requestOptions.url, "requestUrl should be the same");
            assert.equal(undefined, requestOptions.headers as {}, "Headers should be empty");
        });

        it("Default QueryString and Default Headers", async () => {
            // arrange
            const defaultHeaders = { h1: "valueh1", h2: "valueh2" };
            const defaultQueryString = { q1: "valueq1", q2: "valueq2" };
            const rw = new RestWrapper(
                baseurl,
                defaultHeaders,
                defaultQueryString,
                false,
                maxContentLength,
                axiosMock as AxiosInstance,
            );

            // act
            await rw.post(requestUrl, {});

            // assert
            assert.equal(`${requestUrl}?q1=valueq1&q2=valueq2`, requestOptions.url, "requestUrl should be the same");
            assert.equal(defaultHeaders.h1, requestOptions.headers.h1 as string, "Header1 value should be correct");
            assert.equal(defaultHeaders.h2, requestOptions.headers.h2 as string, "Header2 value should be correct");
        });

        it("Default and Request, QueryString and Headers", async () => {
            // arrange
            const defaultHeaders = { h1: "valueh1", h2: "valueh2" };
            const requestHeaders = { h1: "valueh11", h3: "valueh3" };
            const defaultQueryString = { q1: "valueq1", q2: "valueq2" };
            const requestQueryString = { q1: "valueq11", q3: "valueq3" };
            const rw = new RestWrapper(
                baseurl,
                defaultHeaders,
                defaultQueryString,
                false,
                maxContentLength,
                axiosMock as AxiosInstance,
            );

            // act
            await rw.post(requestUrl, {}, requestQueryString, requestHeaders);

            // assert
            assert.equal(
                `${requestUrl}?q1=valueq11&q2=valueq2&q3=valueq3`,
                requestOptions.url,
                "requestUrl should be the same",
            );
            assert.equal(requestHeaders.h1, requestOptions.headers.h1 as string, "Header1 value should be updated");
            assert.equal(defaultHeaders.h2, requestOptions.headers.h2 as string, "Header2 value should be correct");
            assert.equal(requestHeaders.h3, requestOptions.headers.h3 as string, "Header2 value should be added");
        });
    });

    describe(".delete", () => {

        it("Invalid Response Code should reject Promise", async () => {
            // arrange
            const rw = new RestWrapper(baseurl, {}, {}, false, maxContentLength, axiosErrorMock as AxiosInstance);

            // act/assert
            await rw.delete(requestUrl, {}).then(
                // tslint:disable-next-line:no-void-expression
                () => assert.fail("Promise was not rejected"),
                // tslint:disable-next-line:no-void-expression
                (err) => assert.ok(err, "Invalid response code rejected Promise"),
            );
        });

        it("Standard properties should not change", async () => {
            // arrange
            const rw = new RestWrapper(baseurl, undefined, {}, false, maxContentLength, axiosMock as AxiosInstance);

            // act
            await rw.delete(requestUrl);

            // assert
            assert.equal(baseurl, requestOptions.baseURL, "baseURL should be the same");
            assert.equal(requestUrl, requestOptions.url, "requestUrl should be the same");
            assert.equal(undefined, requestOptions.headers as {}, "Headers should be empty");
        });

        it("Default QueryString and Default Headers", async () => {
            // arrange
            const defaultHeaders = { h1: "valueh1", h2: "valueh2" };
            const defaultQueryString = { q1: "valueq1", q2: "valueq2" };
            const rw = new RestWrapper(
                baseurl,
                defaultHeaders,
                defaultQueryString,
                false,
                maxContentLength,
                axiosMock as AxiosInstance,
            );

            // act
            await rw.delete(requestUrl);

            // assert
            assert.equal(`${requestUrl}?q1=valueq1&q2=valueq2`, requestOptions.url, "requestUrl should be the same");
            assert.equal(defaultHeaders.h1, requestOptions.headers.h1 as string, "Header1 value should be correct");
            assert.equal(defaultHeaders.h2, requestOptions.headers.h2 as string, "Header2 value should be correct");
        });

        it("Default and Request, QueryString and Headers", async () => {
            // arrange
            const defaultHeaders = { h1: "valueh1", h2: "valueh2" };
            const requestHeaders = { h1: "valueh11", h3: "valueh3" };
            const defaultQueryString = { q1: "valueq1", q2: "valueq2" };
            const requestQueryString = { q1: "valueq11", q3: "valueq3" };
            const rw = new RestWrapper(
                baseurl,
                defaultHeaders,
                defaultQueryString,
                false,
                maxContentLength,
                axiosMock as AxiosInstance,
            );

            // act
            await rw.delete(requestUrl, requestQueryString, requestHeaders);

            // assert
            assert.equal(
                `${requestUrl}?q1=valueq11&q2=valueq2&q3=valueq3`,
                requestOptions.url,
                "requestUrl should be the same",
            );
            assert.equal(requestHeaders.h1, requestOptions.headers.h1 as string, "Header1 value should be updated");
            assert.equal(defaultHeaders.h2, requestOptions.headers.h2 as string, "Header2 value should be correct");
            assert.equal(requestHeaders.h3, requestOptions.headers.h3 as string, "Header2 value should be added");
        });
    });

    describe(".patch", () => {

        it("Invalid Response Code should reject Promise", async () => {
            // arrange
            const rw = new RestWrapper(baseurl, {}, {}, false, maxContentLength, axiosErrorMock as AxiosInstance);

            // act/assert
            await rw.patch(requestUrl, {}).then(
                // tslint:disable-next-line:no-void-expression
                () => assert.fail("Promise was not rejected"),
                // tslint:disable-next-line:no-void-expression
                (err) => assert.ok(err, "Invalid response code rejected Promise"),
            );
        });

        it("Standard properties should not change", async () => {
            // arrange
            const rw = new RestWrapper(baseurl, undefined, {}, false, maxContentLength, axiosMock as AxiosInstance);

            // act
            await rw.patch(requestUrl, {});

            // assert
            assert.equal(baseurl, requestOptions.baseURL, "baseURL should be the same");
            assert.equal(requestUrl, requestOptions.url, "requestUrl should be the same");
            assert.equal(undefined, requestOptions.headers as {}, "Headers should be empty");
        });

        it("Default QueryString and Default Headers", async () => {
            // arrange
            const defaultHeaders = { h1: "valueh1", h2: "valueh2" };
            const defaultQueryString = { q1: "valueq1", q2: "valueq2" };
            const rw = new RestWrapper(
                baseurl,
                defaultHeaders,
                defaultQueryString,
                false,
                maxContentLength,
                axiosMock as AxiosInstance,
            );

            // act
            await rw.patch(requestUrl, {});

            // assert
            assert.equal(`${requestUrl}?q1=valueq1&q2=valueq2`, requestOptions.url, "requestUrl should be the same");
            assert.equal(defaultHeaders.h1, requestOptions.headers.h1 as string, "Header1 value should be correct");
            assert.equal(defaultHeaders.h2, requestOptions.headers.h2 as string, "Header2 value should be correct");
        });

        it("Default and Request, QueryString and Headers", async () => {
            // arrange
            const defaultHeaders = { h1: "valueh1", h2: "valueh2" };
            const requestHeaders = { h1: "valueh11", h3: "valueh3" };
            const defaultQueryString = { q1: "valueq1", q2: "valueq2" };
            const requestQueryString = { q1: "valueq11", q3: "valueq3" };
            const rw = new RestWrapper(
                baseurl,
                defaultHeaders,
                defaultQueryString,
                false,
                maxContentLength,
                axiosMock as AxiosInstance,
            );

            // act
            await rw.patch(requestUrl, {}, requestQueryString, requestHeaders);

            // assert
            assert.equal(
                `${requestUrl}?q1=valueq11&q2=valueq2&q3=valueq3`,
                requestOptions.url,
                "requestUrl should be the same",
            );
            assert.equal(requestHeaders.h1, requestOptions.headers.h1 as string, "Header1 value should be updated");
            assert.equal(defaultHeaders.h2, requestOptions.headers.h2 as string, "Header2 value should be correct");
            assert.equal(requestHeaders.h3, requestOptions.headers.h3 as string, "Header2 value should be added");
        });
    });
});

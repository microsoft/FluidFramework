/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { stub } from "sinon";

/**
 * Mock response returned by {@link createResponse}.
 */
export interface MockResponse {
	ok: boolean;
	status: number;
	text: () => Promise<string>;
	arrayBuffer: () => Promise<unknown>;
	headers: Headers;
	json: () => Promise<unknown>;
}

export const createResponse = async (
	headers: { [key: string]: string },
	response: unknown,
	status: number,
): Promise<MockResponse> => ({
	ok: response !== undefined,
	status,
	text: async () => JSON.stringify(response),
	arrayBuffer: async () => response,
	headers: headers ? new Headers(headers) : new Headers(),
	json: async () => response,
});

export const okResponse = async (
	headers: { [key: string]: string },
	response: object,
): Promise<MockResponse> => createResponse(headers, response, 200);
export const notFound = async (
	headers: { [key: string]: string } = {},
): Promise<MockResponse> => createResponse(headers, undefined, 404);

export type FetchCallType = "internal" | "external" | "single";

export async function mockFetchMultiple<T>(
	callback: () => Promise<T>,
	responses: ((headers?: { [key: string]: string }) => Promise<object>)[],
	type: FetchCallType = "single",
): Promise<T> {
	const fetchStub = stub(globalThis, "fetch");
	fetchStub.callsFake(async (_, init) => {
		if (type === "external") {
			fetchStub.restore();
		}
		const cb = responses.shift();
		assert(cb !== undefined, "the end");
		return cb(Object.fromEntries(new Headers(init?.headers))) as Promise<Response>;
	});
	try {
		return await callback();
	} finally {
		if (type !== "internal") {
			fetchStub.restore();
		}
		assert(responses.length === 0, "all responses used");
	}
}

export async function mockFetchSingle<T>(
	callback: () => Promise<T>,
	responseType: (headers?: { [key: string]: string }) => Promise<object>,
	type: FetchCallType = "single",
): Promise<T> {
	return mockFetchMultiple(callback, [responseType], type);
}

export async function mockFetchOk<T>(
	callback: () => Promise<T>,
	response = {},
	headers: { [key: string]: string } = {},
): Promise<T> {
	return mockFetchSingle(callback, async () => okResponse(headers, response));
}

/**
 * Mock a fetch call that returns a 200 OK response if the request check passes.
 * @param callback - The callback to invoke for the fetch call.
 * @param check - The function to check if the request is made correctly. Throws if the check fails.
 * @param response - The response to return if the check passes.
 * @param headers - The headers to include in the response.
 * @returns The result of the callback.
 */
export async function mockFetchOKIf<T>(
	callback: () => Promise<T>,
	check: (headers?: { [key: string]: string }) => true | never,
	response = {},
	headers: { [key: string]: string } = {},
): Promise<T> {
	return mockFetchSingle(callback, async (reqHeaders) => {
		if (check(reqHeaders)) {
			return okResponse(headers, response);
		}
		throw new Error(`Unexpected fetch. requestCheck should throw if not passing.`);
	});
}

export async function mockFetchError<T>(
	callback: () => Promise<T>,
	response: Error,
	type: FetchCallType = "single",
): Promise<T> {
	const fetchStub = stub(globalThis, "fetch");
	fetchStub.callsFake(async () => {
		if (type === "external") {
			fetchStub.restore();
		}
		throw response;
	});
	try {
		return await callback();
	} finally {
		if (type !== "internal") {
			fetchStub.restore();
		}
	}
}

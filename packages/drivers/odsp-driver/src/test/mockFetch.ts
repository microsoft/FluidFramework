/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert";

import { Headers } from "node-fetch";
import { stub } from "sinon";

import { fetchHelper } from "../odspUtils.js";

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
	responses: (() => Promise<object>)[],
	type: FetchCallType = "single",
): Promise<T> {
	const fetchStub = stub(fetchHelper, "fetch");
	fetchStub.callsFake(async () => {
		if (type === "external") {
			fetchStub.restore();
		}
		const cb = responses.shift();
		assert(cb !== undefined, "the end");
		return cb() as Promise<Response>;
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
	responseType: () => Promise<object>,
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

export async function mockFetchError<T>(
	callback: () => Promise<T>,
	response: Error,
	type: FetchCallType = "single",
): Promise<T> {
	const fetchStub = stub(fetchHelper, "fetch");
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

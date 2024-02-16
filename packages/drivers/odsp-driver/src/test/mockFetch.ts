/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert";
import { stub } from "sinon";
import * as fetchModule from "node-fetch";

export const createResponse = async (
	headers: { [key: string]: string },
	// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
	response: any,
	status: number,
): Promise<Partial<fetchModule.Response>> => ({
	ok: response !== undefined,
	status,
	text: async () => JSON.stringify(response),
	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	arrayBuffer: async () => response,
	headers: headers ? new fetchModule.Headers(headers) : new fetchModule.Headers(),
	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	json: async () => response,
});

export const okResponse = async (
	headers: { [key: string]: string },
	response: object,
): Promise<Partial<fetchModule.Response>> => createResponse(headers, response, 200);
export const notFound = async (
	headers: { [key: string]: string } = {},
): Promise<Partial<fetchModule.Response>> => createResponse(headers, undefined, 404);

export type FetchCallType = "internal" | "external" | "single";

export async function mockFetchMultiple<T>(
	callback: () => Promise<T>,
	responses: (() => Promise<object>)[],
	type: FetchCallType = "single",
): Promise<T> {
	const fetchStub = stub(fetchModule, "default");
	fetchStub.callsFake(async () => {
		if (type === "external") {
			fetchStub.restore();
		}
		const cb = responses.shift();
		assert(cb !== undefined, "the end");
		return cb() as Promise<fetchModule.Response>;
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
	const fetchStub = stub(fetchModule, "default");
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

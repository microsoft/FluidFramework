/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { customFetch } from "./fetch.js";
import { IOdspAuthRequestInfo, authRequestWithRetry } from "./odspAuth.js";

/**
 * @internal
 */
export async function getAsync(
	url: string,
	authRequestInfo: IOdspAuthRequestInfo,
): Promise<Response> {
	return authRequest(authRequestInfo, async (config: RequestInit) => customFetch(url, config));
}

/**
 * @internal
 */
export async function putAsync(
	url: string,
	authRequestInfo: IOdspAuthRequestInfo,
): Promise<Response> {
	return authRequest(authRequestInfo, async (config: RequestInit) => {
		const putConfig = {
			...config,
			method: "PUT",
		};
		return fetch(url, putConfig);
	});
}

/**
 * @internal
 */
export async function postAsync(
	url: string,
	body: any,
	authRequestInfo: IOdspAuthRequestInfo,
): Promise<Response> {
	return authRequest(authRequestInfo, async (config: RequestInit) => {
		const postConfig = {
			...config,
			body,
			method: "POST",
		};
		return fetch(url, postConfig);
	});
}

/**
 * @internal
 */
export async function unauthPostAsync(url: string, body: any): Promise<Response> {
	return safeRequestCore(async () => {
		return fetch(url, { body, method: "POST" });
	});
}

async function authRequest(
	authRequestInfo: IOdspAuthRequestInfo,
	requestCallback: (config: RequestInit) => Promise<Response>,
): Promise<Response> {
	return authRequestWithRetry(authRequestInfo, async (config: RequestInit) =>
		safeRequestCore(async () => requestCallback(config)),
	);
}

async function safeRequestCore(requestCallback: () => Promise<Response>): Promise<Response> {
	let response: Response;
	try {
		response = await requestCallback();
	} catch (error: any) {
		if (error?.response?.status) {
			response = error.response;
		} else {
			throw error;
		}
	}
	return response;
}

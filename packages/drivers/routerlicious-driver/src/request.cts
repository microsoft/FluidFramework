/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Request configuration interface compatible with the existing RestWrapper API.
 * This replaces the previous axios-based types with native fetch-compatible types.
 *
 * Note: These interfaces maintain an axios-compatible shape to align with server-side
 * RestWrapper implementations, which currently use axios types directly from the axios package.
 * The legacy type aliases below provide backward compatibility for any code using the
 * axios-named types.
 */
export interface RequestConfig {
	baseURL?: string;
	url?: string;
	method?: string;
	headers?: RawRequestHeaders;
	params?: Record<string, any>;
	data?: any;
	maxBodyLength?: number;
	maxContentLength?: number;
}

/**
 * Request headers type.
 */
export type RequestHeaders = Record<string, string | number | boolean>;

/**
 * Raw request headers type allowing undefined values.
 */
export type RawRequestHeaders = Record<string, string | number | boolean | undefined>;

// Legacy type aliases for backwards compatibility
/** @deprecated Use RequestConfig instead */
export type AxiosRequestConfig = RequestConfig;
/** @deprecated Use RequestHeaders instead */
export type AxiosRequestHeaders = RequestHeaders;
/** @deprecated Use RawRequestHeaders instead */
export type RawAxiosRequestHeaders = RawRequestHeaders;

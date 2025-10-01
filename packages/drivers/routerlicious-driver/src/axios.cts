/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Request configuration interface compatible with the existing RestWrapper API.
 * This replaces the previous axios-based types with native fetch-compatible types.
 */
export interface AxiosRequestConfig {
	baseURL?: string;
	url?: string;
	method?: string;
	headers?: RawAxiosRequestHeaders;
	params?: Record<string, any>;
	data?: any;
	maxBodyLength?: number;
	maxContentLength?: number;
}

/**
 * Request headers type.
 */
export type AxiosRequestHeaders = Record<string, string | number | boolean>;

/**
 * Raw request headers type allowing undefined values.
 */
export type RawAxiosRequestHeaders = Record<string, string | number | boolean | undefined>;

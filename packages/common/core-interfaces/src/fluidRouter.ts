/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @alpha
 */
export interface IRequestHeader {
	// TODO: Use `unknown` instead (API-Breaking)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[index: string]: any;
}

/**
 * @alpha
 */
export interface IRequest {
	url: string;
	headers?: IRequestHeader;
}

/**
 * @alpha
 */
export interface IResponse {
	mimeType: string;
	status: number;
	// TODO: Use `unknown` instead (API-Breaking)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	value: any;
	// TODO: Use `unknown` instead (API-Breaking)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	headers?: { [key: string]: any };
	stack?: string;
}

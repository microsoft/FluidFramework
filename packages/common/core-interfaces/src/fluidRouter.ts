/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @public
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export interface IRequestHeader {
	// TODO: Use `unknown` instead (API-Breaking)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[index: string]: any;
}

/**
 * @public
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export interface IRequest {
	url: string;
	headers?: IRequestHeader;
}

/**
 * @public
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
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

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Represents the target URL of a link.
 * @remarks Can be fully realized, a heading ID, relative file path, etc.
 */
export type UrlTarget = string;

/**
 * Represents a link to some documentation element.
 */
export interface Link {
	/**
	 * Link text to be rendered.
	 */
	readonly text: string;

	/**
	 * Link target URL.
	 */
	readonly target: UrlTarget;
}

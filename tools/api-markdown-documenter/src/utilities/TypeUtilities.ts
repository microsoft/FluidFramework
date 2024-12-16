/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Recursive variant of the `Required<T>` utility type.
 */
export type DeepRequired<T> = {
	[K in keyof T]: DeepRequired<T[K]>;
} & Required<T>;

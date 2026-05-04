/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Logger interface used throughout the eval framework.
 * Provides a consistent logging API for CLI tools, generators, and auth modules.
 * @legacy
 * @alpha
 */
export interface Logger {
	info: (message: string) => void;
	warn: (message: string) => void;
	error: (message: string) => void;
	debug: (message: string) => void;
}

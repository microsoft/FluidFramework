/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The prefix used to identify a range string that is using the workspace protocol.
 */
export const WORKSPACE_PROTOCOL_PREFIX: string = `workspace:`;

/**
 * Parses a version string that may be using the workspace protocol.
 *
 * @param version - The version or range string to parse.
 * @returns A tuple of [isWorkspaceProtocol, parsedVersionString].
 *
 * @remarks
 *
 * Example supported strings:
 *
 * workspace:\^2.0.0-internal.1.0.0
 *
 * workspace:\~2.0.0-internal.1.0.0
 *
 * workspace:2.0.0-internal.1.0.0
 *
 * workspace:\^2.0.0
 *
 * workspace:\~2.0.0
 *
 * workspace:2.0.0
 *
 * workspace:*
 */
export const parseWorkspaceProtocol = (version: string): [boolean, string] => {
	if (version.startsWith(WORKSPACE_PROTOCOL_PREFIX)) {
		const range = version.slice(WORKSPACE_PROTOCOL_PREFIX.length);
		return [true, range];
	}

	return [false, version];
};

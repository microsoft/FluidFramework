/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * String in a valid semver format of a specific version at least specifying minor.
 *
 * @legacy
 * @alpha
 */
export type MinimumVersionForCollab =
	| `${1 | 2}.${bigint}.${bigint}`
	| `${1 | 2}.${bigint}.${bigint}-${string}`;

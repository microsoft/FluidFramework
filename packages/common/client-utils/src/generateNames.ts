/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { generateStupidName } from "sillyname";

/**
 * Utility function for generating a random name.
 *
 * @internal
 */
export function getRandomName(connector = "_", capitalize = false): string {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-call
	let [first, last] = (generateStupidName() as string).split(" ");

	// sillyname output is capitalized by default
	if (!capitalize) {
		first = first.toLowerCase();
		last = last.toLowerCase();
	}

	return `${first}${connector}${last}`;
}

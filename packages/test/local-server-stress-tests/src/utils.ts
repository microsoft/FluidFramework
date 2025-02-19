/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export function makeUnreachableCodePathProxy<T extends object>(name: string): T {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	return new Proxy({} as T, {
		get: (): never => {
			throw new Error(
				`Unexpected read of '${name}:' this indicates a bug in the DDS eventual consistency harness.`,
			);
		},
	});
}

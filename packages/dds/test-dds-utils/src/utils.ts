/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	MockContainerRuntimeForReconnection,
	MockFluidDataStoreRuntime,
} from "@fluidframework/test-runtime-utils/legacy";

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

export function reconnectAndSquash(
	containerRuntime: MockContainerRuntimeForReconnection,
	dataStoreRuntime: MockFluidDataStoreRuntime,
) {
	// The mocks don't fully plumb squashing and/or APIs for staging mode yet. To still exercise the squashing code path,
	// we patch data store runtime's resubmit to always squash while we transition to "off".
	const patchReSubmit = (
		runtime: MockFluidDataStoreRuntime,
		options: { squash: boolean },
	): (() => void) => {
		const originalReSubmit = runtime.reSubmit;
		runtime.reSubmit = (content: any, localOpMetadata: unknown, squash?: boolean) =>
			originalReSubmit.call(runtime, content, localOpMetadata, options.squash);
		return () => {
			runtime.reSubmit = originalReSubmit;
		};
	};
	const cleanup = patchReSubmit(dataStoreRuntime, {
		squash: true,
	});
	try {
		containerRuntime.connected = true;
	} finally {
		cleanup();
	}
}

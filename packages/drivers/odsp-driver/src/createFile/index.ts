/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

export async function useCreateNewModule<T = void>(
	odspLogger: ITelemetryLoggerExt,
	func: (
		m: typeof import("./createNewModule.js") /* webpackChunkName: "createNewModule" */,
	) => Promise<T>,
): Promise<T> {
	// We can delay load this module as this path will not be executed in load flows and create flow
	// while only happens once in lifetime of a document which happens in the background after creation of
	// detached container.
	const module = await import(/* webpackChunkName: "createNewModule" */ "./createNewModule.js")
		.then((m) => {
			odspLogger.sendTelemetryEvent({ eventName: "createNewModuleLoaded" });
			return m;
		})
		.catch((error) => {
			odspLogger.sendErrorEvent({ eventName: "createNewModuleLoadFailed" }, error);
			throw error;
		});

	return func(module);
}

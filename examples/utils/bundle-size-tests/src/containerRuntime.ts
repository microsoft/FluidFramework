/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ContainerRuntime } from "@fluidframework/container-runtime";

export function apisToBundle() {
	// Pass through dummy parameters, this file is only used for bundle analysis
	// eslint-disable-next-line @typescript-eslint/no-floating-promises
	ContainerRuntime.load(undefined as any, undefined as any);
}

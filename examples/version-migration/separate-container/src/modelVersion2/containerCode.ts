/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	CompositeEntryPoint,
	loadCompositeRuntime,
	migrationToolEntryPointPiece,
} from "@fluid-example/migration-tools/internal";
import type {
	IContainerContext,
	IRuntime,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import type { IContainerRuntimeOptions } from "@fluidframework/container-runtime/internal";

import { modelEntryPointPiece } from "./modelEntryPointPiece.js";

/**
 * @internal
 */
export class InventoryListContainerRuntimeFactory implements IRuntimeFactory {
	public get IRuntimeFactory(): IRuntimeFactory {
		return this;
	}

	private readonly runtimeOptions: IContainerRuntimeOptions | undefined;
	/**
	 * Constructor for the factory. Supports a test mode which spawns the summarizer instantly.
	 * @param testMode - True to enable instant summarizer spawning.
	 */
	public constructor(testMode: boolean) {
		this.runtimeOptions = testMode
			? {
					summaryOptions: {
						initialSummarizerDelayMs: 0,
					},
				}
			: undefined;
	}

	public async instantiateRuntime(
		context: IContainerContext,
		existing: boolean,
	): Promise<IRuntime> {
		const compositeEntryPoint = new CompositeEntryPoint();
		compositeEntryPoint.addEntryPointPiece(modelEntryPointPiece);
		compositeEntryPoint.addEntryPointPiece(migrationToolEntryPointPiece);
		return loadCompositeRuntime(context, existing, compositeEntryPoint, this.runtimeOptions);
	}
}

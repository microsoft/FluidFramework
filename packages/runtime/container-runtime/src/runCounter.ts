/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { BatchResubmitInfo } from "./opLifecycle/index.js";

/**
 * Utility for tracking the number of concurrent runs of a particular operation.
 */
export class RunCounter {
	#runs = 0;

	public get running(): boolean {
		return this.#runs !== 0;
	}

	public get runs(): number {
		return this.#runs;
	}

	public run<T>(act: () => T): T {
		this.#runs++;
		try {
			return act();
		} finally {
			this.#runs--;
		}
	}
}

/**
 * A specific use case of RunCounter - for when we are accumulating a batch in ContainerRuntime
 */
export class BatchRunCounter extends RunCounter {
	#resubmitInfo: BatchResubmitInfo | undefined;

	/**
	 * Gets the resubmit info if currently resubmitting a batch, or undefined if not under resubmit.
	 */
	public get resubmitInfo(): BatchResubmitInfo | undefined {
		return this.#resubmitInfo;
	}

	public run<T>(act: () => T, resubmitInfo?: BatchResubmitInfo): T {
		assert(
			this.#resubmitInfo === undefined,
			0xba2 /* Reentrancy not allowed in BatchRunCounter */,
		);
		this.#resubmitInfo = resubmitInfo;
		try {
			return super.run(act);
		} finally {
			this.#resubmitInfo = undefined;
		}
	}
}

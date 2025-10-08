/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { CompartmentOptions, LockdownOptions } from "ses";

import type { SemanticAgentOptions } from "./api.js";
import { toErrorString } from "./utils.js";

const lockdownSymbol = Symbol.for("tree-agent.ses.locked");

/**
 * Create an implementation of {@link SemanticAgentOptions.executeEdit} that uses the SES library to run the provided code in a secure environment.
 * @param createCompartment - This function can be used to optionally configure the SES Compartment used to execute the code.
 * The provided globals must be included in the compartment's globals and must not conflict with any additional globals passed in.
 * @param lockdownOptions - Optional configuration passed to the SES `lockdown` function.
 * @returns A function that can be used as the {@link SemanticAgentOptions.executeEdit | executeEdit} callback.
 * @remarks This function will both import the SES library and call its `lockdown` function the first time it is called.
 * Therefore, this function should be called only once, early in an application's lifetime.
 * @alpha
 */
export async function createSesEditEvaluator(options?: {
	compartmentOptions?: CompartmentOptions;
	lockdownOptions?: LockdownOptions;
}): Promise<SemanticAgentOptions["executeEdit"]> {
	const optionsGlobals: Map<string, unknown> =
		options?.compartmentOptions?.globals ?? new Map<string, unknown>();
	if (optionsGlobals.has("context") === true) {
		throw new Error(
			"The 'context' global is reserved and cannot be overridden in the compartment options.",
		);
	}

	// Importing 'ses' has side effects, so we do it lazily to avoid impacting environments that don't use this evaluator.
	await import("ses");

	if (!(lockdownSymbol in globalThis)) {
		try {
			lockdown(options?.lockdownOptions);
			Object.defineProperty(globalThis, lockdownSymbol, {
				value: true,
				writable: false,
				configurable: false,
				enumerable: false,
			});
		} catch (error: unknown) {
			if (toErrorString(error).includes("SES_ALREADY_LOCKED_DOWN")) {
				Object.defineProperty(globalThis, lockdownSymbol, {
					value: true,
					writable: false,
					configurable: false,
					enumerable: false,
				});
			} else {
				throw error;
			}
		}
	}

	return async (context: Record<string, unknown>, code: string) => {
		const compartmentOptions = {
			...options?.compartmentOptions,
			globals: {
				...Object.fromEntries(optionsGlobals),
				context,
			},
		};

		const compartment = new Compartment({ ...compartmentOptions, __options__: true });
		await compartment.evaluate(code);
	};
}

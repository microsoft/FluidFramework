/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { CompartmentOptions, LockdownOptions } from "ses";

import type { SemanticAgentOptions } from "./api.js";

/**
 * Create an implementation of {@link SemanticAgentOptions.evaluateEdit} that uses the SES library to run the provided code in a secure environment.
 * @param createCompartment - This function can be used to optionally configure the SES Compartment used to evaluate the code.
 * The provided globals must be included in the compartment's globals and must not conflict with any additional globals passed in.
 * @param lockdownOptions - Optional configuration passed to the SES `lockdown` function.
 * @returns A function that can be used as the {@link SemanticAgentOptions.evaluateEdit | evaluateEdit} callback.
 * @remarks This function will both import the SES library and call its `lockdown` function the first time it is called.
 * Therefore, this function should be called only once, early in an application's lifetime.
 * @alpha
 */
export async function createSesEditEvaluator(options?: {
	compartmentOptions?: CompartmentOptions;
	lockdownOptions?: LockdownOptions;
}): Promise<SemanticAgentOptions["evaluateEdit"]> {
	if (options?.compartmentOptions?.globals?.has("context") === true) {
		throw new Error(
			"The 'context' global is reserved and cannot be overridden in the compartment options.",
		);
	}

	// Importing 'ses' has side effects, so we do it lazily to avoid impacting environments that don't use this evaluator.
	await import("ses");
	lockdown(options?.lockdownOptions);
	return async (context: Record<string, unknown>, code: string) => {
		const compartmentOptions: CompartmentOptions = {
			...options?.compartmentOptions,
			globals: new Map([["context", context]]),
		};

		const compartment = new Compartment(compartmentOptions);
		await compartment.evaluate(code);
	};
}

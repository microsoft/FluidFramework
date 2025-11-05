/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import-x/no-unassigned-import
import "ses";

import type { AsynchronousEditor } from "@fluidframework/tree-agent/alpha";

/**
 * Used to track whether the SES `lockdown` function has already been called by this module.
 */
const lockdownSymbol = Symbol.for("tree-agent.ses.locked");

/**
 * Create an implementation of {@link @fluidframework/tree-agent#SemanticAgentOptions.executeEdit} that uses the SES library
 * to run the provided code in a secure environment.
 * @param options - Optional configuration for the underlying SES compartment and lockdown invocation.
 * @returns A function that can be used as the {@link @fluidframework/tree-agent#SemanticAgentOptions.executeEdit | executeEdit} callback.
 * @remarks This function will call the SES `lockdown` API the first time it is invoked. For best performance, create the executor once during application initialization.
 * @alpha
 */
export function createSesEditExecutor(options?: {
	compartmentOptions?: { globals?: Map<string, unknown>; [key: string]: unknown };
	lockdownOptions?: Record<string, unknown>;
}): AsynchronousEditor {
	const optionsGlobals: Map<string, unknown> =
		options?.compartmentOptions?.globals ?? new Map<string, unknown>();

	if (optionsGlobals.has("context") === true) {
		throw new Error(
			"The 'context' global is reserved and cannot be overridden in the compartment options.",
		);
	}

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

/**
 * Stringify an unknown error value.
 */
function toErrorString(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}

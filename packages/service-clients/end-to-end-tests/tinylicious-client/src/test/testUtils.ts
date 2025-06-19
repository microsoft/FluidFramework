/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import type { JsonDeserialized } from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";
// eslint-disable-next-line import/no-internal-modules
import type { StateSchemaValidator } from "@fluidframework/presence/beta";
import type { SinonSpy } from "sinon";
/**
 * Creates a null validator (one that does nothing) for a given type T.
 */
export function createNullValidator<T extends object>(): StateSchemaValidator<T> {
	const nullValidator: StateSchemaValidator<T> = (data: unknown) => {
		return data as JsonDeserialized<T>;
	};
	return nullValidator;
}

/**
 * A validator function spy.
 */
export type ValidatorSpy = Pick<SinonSpy, "callCount">;

/**
 * Creates a validator and a spy for test purposes.
 */
export function createSpiedValidator<T extends object>(
	validator: StateSchemaValidator<T>,
): [StateSchemaValidator<T>, ValidatorSpy] {
	const spy: ValidatorSpy = {
		callCount: 0,
	};

	const nullValidatorSpy: StateSchemaValidator<T> = (data: unknown) => {
		spy.callCount++;
		return validator(data) as JsonDeserialized<T>;
	};
	return [nullValidatorSpy, spy];
}

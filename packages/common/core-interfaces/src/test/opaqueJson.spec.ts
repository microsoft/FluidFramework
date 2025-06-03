/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	assertIdenticalTypes,
	castToOpaqueJson,
	createInstanceOf,
	exposeFromOpaqueJson,
} from "./testUtils.js";

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type {
	JsonDeserialized,
	JsonSerializable,
	OpaqueJsonDeserialized,
	OpaqueJsonSerializable,
} from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";

function saveJsonSerializable<const T>(value: JsonSerializable<T>): OpaqueJsonSerializable<T> {
	return value as unknown as OpaqueJsonSerializable<T>;
}

function forwardJsonSerializable<const T>(
	value: OpaqueJsonSerializable<T>,
): JsonSerializable<T> {
	return value as unknown as JsonSerializable<T>;
}

function saveJsonDeserialized<const T>(value: JsonDeserialized<T>): OpaqueJsonDeserialized<T> {
	return value as unknown as OpaqueJsonDeserialized<T>;
}

function saveJsonRoundTrippable<const T>(
	value: JsonSerializable<T> & JsonDeserialized<T>,
): OpaqueJsonSerializable<T> & OpaqueJsonDeserialized<T> {
	return value as unknown as OpaqueJsonSerializable<T> & OpaqueJsonDeserialized<T>;
}

function returnJsonDeserialized<const T>(
	value: OpaqueJsonDeserialized<T>,
): JsonDeserialized<T> {
	return value as unknown as JsonDeserialized<T>;
}

function returnJsonSerializableAndDeserialized<const T>(
	value: OpaqueJsonSerializable<T> & OpaqueJsonDeserialized<T>,
): JsonSerializable<T> & JsonDeserialized<T> {
	return value as unknown as JsonSerializable<T> & JsonDeserialized<T>;
}

// Use to have a value appear as used (read)
function use(_: unknown): void {}

describe("OpaqueJsonSerializable and OpaqueJsonDeserialized", () => {
	const generalValue = { a: 0 };

	describe("positive compilation tests", () => {
		const autoOpaqueValue = castToOpaqueJson(generalValue);
		assertIdenticalTypes(
			autoOpaqueValue,
			createInstanceOf<
				OpaqueJsonSerializable<typeof generalValue> &
					OpaqueJsonDeserialized<typeof generalValue>
			>(),
		);

		it("OpaqueJsonSerializable is covariant (more specific is assignable to general)", () => {
			// Setup
			let serializableGeneralValue = saveJsonSerializable({ ...generalValue });
			use(serializableGeneralValue);
			const serializableSpecificValue = saveJsonSerializable({ a: 1 });
			const serializableValueWithMore = saveJsonSerializable({ a: 2 as number, b: "test" });

			// Act & Verify
			serializableGeneralValue = serializableSpecificValue; // should be assignable
			serializableGeneralValue = serializableValueWithMore; // should be assignable
			serializableGeneralValue = autoOpaqueValue; // should be assignable
		});

		it("OpaqueJsonDeserialized is covariant (more specific is assignable to general)", () => {
			// Setup
			let deserializedGeneralValue = saveJsonDeserialized({ ...generalValue });
			use(deserializedGeneralValue);
			const deserializedSpecificValue = saveJsonDeserialized({ a: 1 });
			const deserializedValueWithMore = saveJsonDeserialized({
				a: 2 as number,
				b: "test",
			});

			// Act & Verify
			deserializedGeneralValue = deserializedSpecificValue; // should be assignable
			deserializedGeneralValue = deserializedValueWithMore; // should be assignable
			deserializedGeneralValue = autoOpaqueValue; // should be assignable
		});

		it("OpaqueJsonSerializable & OpaqueJsonDeserialized is covariant (more specific is assignable to general)", () => {
			// Setup
			let roundTrippableGeneralValue = saveJsonRoundTrippable({ ...generalValue });
			use(roundTrippableGeneralValue);
			const roundTrippableSpecificValue = saveJsonRoundTrippable({ a: 1 });
			const roundTrippableValueWithMore = saveJsonRoundTrippable({
				a: 2 as number,
				b: "test",
			});

			// Act & Verify
			roundTrippableGeneralValue = roundTrippableSpecificValue; // should be assignable
			roundTrippableGeneralValue = roundTrippableValueWithMore; // should be assignable
		});

		describe("in a generic context", <T>() => {
			it("OpaqueJsonDeserialized assignability varies with JsonDeserialized Options", () => {
				// Setup
				function acceptsOpaqueJsonDeserialized(
					_: OpaqueJsonDeserialized<T, [IFluidHandle<bigint | string>], bigint>,
				): void {}

				// Act & Verify Options variance

				// Same options are allowed
				// biome-ignore format: keep single lines for comparability
				acceptsOpaqueJsonDeserialized(createInstanceOf<OpaqueJsonDeserialized<T, [IFluidHandle<bigint|string>], bigint>>());
				// More limited AllowExtensionOf is allowed
				// biome-ignore format: keep single lines for comparability
				// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-arguments -- explicit `never` *default) for clarity
				acceptsOpaqueJsonDeserialized(createInstanceOf<OpaqueJsonDeserialized<T, [IFluidHandle<bigint|string>], never>>());

				// Broader Option_AllowExtensionOf is not allowed
				// biome-ignore format: keep single lines for comparability
				// @ts-expect-error Type 'bigint | object' is not assignable to type 'bigint'.
				acceptsOpaqueJsonDeserialized(createInstanceOf<OpaqueJsonDeserialized<T, [IFluidHandle<bigint|string>], bigint | object>>());

				// More narrow options are not allowed (for Option_AllowExactly)
				// biome-ignore format: keep single lines for comparability
				// @ts-expect-error Types of parameters 'Option_AllowExactly' and 'Option_AllowExactly' are incompatible. Type '[IFluidHandle<string | bigint>]' is not assignable to type '[IFluidHandle<string>]'.
				acceptsOpaqueJsonDeserialized(createInstanceOf<OpaqueJsonDeserialized<T, [IFluidHandle<string>], bigint>>());
				// More narrow options are not allowed (for Option_AllowExactly)
				// biome-ignore format: keep single lines for comparability
				// @ts-expect-error Types of parameters 'Option_AllowExactly' and 'Option_AllowExactly' are incompatible. Type '[IFluidHandle<string | bigint>]' is not assignable to type '[never]'.
				acceptsOpaqueJsonDeserialized(createInstanceOf<OpaqueJsonDeserialized<T, [never], bigint>>());
				// More narrow options are not allowed (for Option_AllowExactly)
				// biome-ignore format: keep single lines for comparability
				// @ts-expect-error Type '[]' is not assignable to type '[IFluidHandle<bigint|string>]'.
				acceptsOpaqueJsonDeserialized(createInstanceOf<OpaqueJsonDeserialized<T, [], bigint>>());
				// Broader options are not allowed (for Option_AllowExactly)
				// biome-ignore format: keep single lines for comparability
				// @ts-expect-error Type '[IFluidHandle<bigint|string>, never]' is not assignable to type '[IFluidHandle<bigint|string>]'.
				acceptsOpaqueJsonDeserialized(createInstanceOf<OpaqueJsonDeserialized<T, [IFluidHandle<bigint|string>, never], bigint>>());

				// Default options (more narrow) are not allowed (per Option_AllowExactly)
				// biome-ignore format: keep single lines for comparability
				// @ts-expect-error Type '[]' is not assignable to type '[IFluidHandle<bigint|string>]'.
				acceptsOpaqueJsonDeserialized(createInstanceOf<OpaqueJsonDeserialized<T>>());
				// However, similar case with unfortunate AllowExactly using `never` is allowed
				// biome-ignore format: keep single lines for comparability
				// @ts-expect-error Type '(Option_AllowExactly: [never]) => void' is not assignable to type '(Option_AllowExactly: [IFluidHandle<string | bigint>]) => void'
				acceptsOpaqueJsonDeserialized(createInstanceOf<OpaqueJsonDeserialized<T, [never]>>());
			});

			it("OpaqueJsonSerializable assignability varies with JsonSerializable Options", () => {
				// Setup
				function acceptsOpaqueJsonSerializable(
					_: OpaqueJsonSerializable<T, [IFluidHandle<bigint | string>], bigint>,
				): void {}

				// Act & Verify Options variance

				// Same options are allowed
				// biome-ignore format: keep single lines for comparability
				acceptsOpaqueJsonSerializable(createInstanceOf<OpaqueJsonSerializable<T, [IFluidHandle<bigint|string>], bigint>>());
				// More limited AllowExtensionOf is allowed
				// biome-ignore format: keep single lines for comparability
				// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-arguments -- explicit `never` *default) for clarity
				acceptsOpaqueJsonSerializable(createInstanceOf<OpaqueJsonSerializable<T, [IFluidHandle<bigint|string>], never>>());

				// Broader Option_AllowExtensionOf is not allowed
				// biome-ignore format: keep single lines for comparability
				// @ts-expect-error Type 'bigint | object' is not assignable to type 'bigint'.
				acceptsOpaqueJsonSerializable(createInstanceOf<OpaqueJsonSerializable<T, [IFluidHandle<bigint|string>], bigint | object>>());

				// More narrow options are not allowed (for Option_AllowExactly)
				// biome-ignore format: keep single lines for comparability
				// @ts-expect-error Types of parameters 'Option_AllowExactly' and 'Option_AllowExactly' are incompatible. Type '[IFluidHandle<string | bigint>]' is not assignable to type '[IFluidHandle<string>]'.
				acceptsOpaqueJsonSerializable(createInstanceOf<OpaqueJsonSerializable<T, [IFluidHandle<string>], bigint>>());
				// More narrow options are not allowed (for Option_AllowExactly)
				// biome-ignore format: keep single lines for comparability
				// @ts-expect-error Types of parameters 'Option_AllowExactly' and 'Option_AllowExactly' are incompatible. Type '[IFluidHandle<string | bigint>]' is not assignable to type '[never]'.
				acceptsOpaqueJsonSerializable(createInstanceOf<OpaqueJsonSerializable<T, [never], bigint>>());
				// More narrow options are not allowed (for Option_AllowExactly)
				// biome-ignore format: keep single lines for comparability
				// @ts-expect-error Type '[]' is not assignable to type '[IFluidHandle<bigint|string>]'.
				acceptsOpaqueJsonSerializable(createInstanceOf<OpaqueJsonSerializable<T, [], bigint>>());
				// Broader options are not allowed (for Option_AllowExactly)
				// biome-ignore format: keep single lines for comparability
				// @ts-expect-error Type '[IFluidHandle<bigint|string>, never]' is not assignable to type '[IFluidHandle<bigint|string>]'.
				acceptsOpaqueJsonSerializable(createInstanceOf<OpaqueJsonSerializable<T, [IFluidHandle<bigint|string>, never], bigint>>());

				// Default options (more narrow) are not allowed (per Option_AllowExactly)
				// biome-ignore format: keep single lines for comparability
				// @ts-expect-error Type '[]' is not assignable to type '[IFluidHandle<bigint|string>]'.
				acceptsOpaqueJsonSerializable(createInstanceOf<OpaqueJsonSerializable<T>>());
				// However, similar case with unfortunate AllowExactly using `never` is allowed
				// biome-ignore format: keep single lines for comparability
				// @ts-expect-error Type '(Option_AllowExactly: [never]) => void' is not assignable to type '(Option_AllowExactly: [IFluidHandle<string | bigint>]) => void'
				acceptsOpaqueJsonSerializable(createInstanceOf<OpaqueJsonSerializable<T, [never]>>());
			});

			it("OpaqueJsonSerializable may be forwarded as JsonSerializable", () => {
				// Setup
				let serializableGenericValue = { ...generalValue } as unknown as JsonSerializable<T>;
				const opaqueSerializableGenericValue = saveJsonSerializable(serializableGenericValue);

				// Act & Verify
				serializableGenericValue = forwardJsonSerializable(opaqueSerializableGenericValue);
				serializableGenericValue = exposeFromOpaqueJson(opaqueSerializableGenericValue);
			});

			it("OpaqueJsonDeserialized may be returned to JsonDeserialized", () => {
				// Setup
				let deserializedGenericValue = { ...generalValue } as unknown as JsonDeserialized<T>;
				const opaqueDeserializedGenericValue = saveJsonDeserialized(deserializedGenericValue);

				// Act & Verify
				deserializedGenericValue = returnJsonDeserialized(opaqueDeserializedGenericValue);
				deserializedGenericValue = exposeFromOpaqueJson(opaqueDeserializedGenericValue);
			});

			it("OpaqueJsonSerializable & OpaqueJsonDeserialized may be returned to JsonSerializable & JsonDeserialized", () => {
				// Setup
				let roundTrippableGenericValue = {
					...generalValue,
				} as unknown as JsonSerializable<T> & JsonDeserialized<T>;
				const opaqueRoundTrippableGenericValue = saveJsonRoundTrippable(
					roundTrippableGenericValue,
				);

				// Act & Verify
				roundTrippableGenericValue = returnJsonSerializableAndDeserialized(
					opaqueRoundTrippableGenericValue,
				);
				roundTrippableGenericValue = exposeFromOpaqueJson(opaqueRoundTrippableGenericValue);
			});

			it("OpaqueJsonSerializable & OpaqueJsonDeserialized may be forwarded as JsonSerializable", () => {
				// Setup
				const roundTrippableGenericValue = {
					...generalValue,
				} as unknown as JsonSerializable<T> & JsonDeserialized<T>;
				const opaqueRoundTrippableGenericValue = saveJsonRoundTrippable(
					roundTrippableGenericValue,
				);

				// Act & Verify
				const serializableGenericValue = forwardJsonSerializable(
					opaqueRoundTrippableGenericValue,
				);
				assertIdenticalTypes(
					serializableGenericValue,
					createInstanceOf<JsonSerializable<T>>(),
				);
			});

			it("OpaqueJsonSerializable & OpaqueJsonDeserialized may be returned as JsonDeserialized", () => {
				// Setup
				const roundTrippableGenericValue = {
					...generalValue,
				} as unknown as JsonSerializable<T> & JsonDeserialized<T>;
				const opaqueRoundTrippableGenericValue = saveJsonRoundTrippable(
					roundTrippableGenericValue,
				);

				// Act & Verify
				const deserializedGenericValue = returnJsonDeserialized(
					opaqueRoundTrippableGenericValue,
				);
				assertIdenticalTypes(
					deserializedGenericValue,
					createInstanceOf<JsonDeserialized<T>>(),
				);
			});
		});
	});

	describe("negative compilation tests", () => {
		it("OpaqueJsonSerializable is covariant (more general is NOT assignable to specific)", () => {
			// Setup
			const serializableGeneralValue = saveJsonSerializable(generalValue);
			let serializableSpecificValue = saveJsonSerializable({ a: 1 });
			use(serializableSpecificValue);
			let serializableValueWithMore = saveJsonSerializable({ a: 2 as number, b: "test" });
			use(serializableValueWithMore);

			// Act & Verify
			// @ts-expect-error 'OpaqueJsonSerializable<{ readonly a: number; }>' is not assignable to type 'OpaqueJsonSerializable<{ readonly a: 1; }>'
			serializableSpecificValue = serializableGeneralValue; // should not be assignable
			// @ts-expect-error 'OpaqueJsonSerializable<{ readonly a: number; }>' is not assignable to type 'OpaqueJsonSerializable<{ readonly a: number; b: "test"; }>'
			serializableValueWithMore = serializableGeneralValue; // should not be assignable
		});

		it("OpaqueJsonDeserialized is covariant (more general is NOT assignable to specific)", () => {
			// Setup
			const deserializedGeneralValue = saveJsonDeserialized(generalValue);
			let deserializedSpecificValue = saveJsonDeserialized({ a: 1 });
			use(deserializedSpecificValue);
			let deserializedValueWithMore = saveJsonDeserialized({
				a: 2 as number,
				b: "test",
			});
			use(deserializedValueWithMore);

			// Act & Verify
			// @ts-expect-error 'OpaqueJsonDeserialized<{ readonly a: number; }>' is not assignable to type 'OpaqueJsonDeserialized<{ readonly a: 1; }>'
			deserializedSpecificValue = deserializedGeneralValue; // should not be assignable
			// @ts-expect-error 'OpaqueJsonDeserialized<{ readonly a: number; }>' is not assignable to type 'OpaqueJsonDeserialized<{ readonly a: number; b: "test"; }>'
			deserializedValueWithMore = deserializedGeneralValue; // should not be assignable
		});

		it("OpaqueJsonSerializable & OpaqueJsonDeserialized is covariant (more specific is assignable to general)", () => {
			// Setup
			const roundTrippableGeneralValue = saveJsonRoundTrippable(generalValue);
			let roundTrippableSpecificValue = saveJsonRoundTrippable({ a: 1 });
			use(roundTrippableSpecificValue);
			let roundTrippableValueWithMore = saveJsonRoundTrippable({ a: 2 as number, b: "test" });
			use(roundTrippableValueWithMore);

			// Act & Verify
			// @ts-expect-error 'OpaqueJsonSerializable<{ readonly a: number; }> & OpaqueJsonDeserialized<{ readonly a: number; }>' is not assignable to type 'OpaqueJsonSerializable<{ readonly a: 1; }> & OpaqueJsonDeserialized<{ readonly a: 1; }>'
			roundTrippableSpecificValue = roundTrippableGeneralValue; // should not be assignable
			// @ts-expect-error 'OpaqueJsonSerializable<{ readonly a: number; }> & OpaqueJsonDeserialized<{ readonly a: number; }>' is not assignable to type 'OpaqueJsonSerializable<{ readonly a: number; b: "test"; }> & OpaqueJsonDeserialized<{ readonly a: number; b: "test"; }>'
			roundTrippableValueWithMore = roundTrippableGeneralValue; // should not be assignable
		});
	});
});

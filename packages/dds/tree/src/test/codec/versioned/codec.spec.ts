/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { nonProductionConditionalsIncluded } from "@fluidframework/core-utils/internal";
import { lowestMinVersionForCollab } from "@fluidframework/runtime-utils/internal";
import {
	validateAssertionError,
	validateUsageError,
} from "@fluidframework/test-runtime-utils/internal";

import {
	FluidClientVersion,
	Versioned,
	throwDecodeError,
	type DecodeErrorHandler,
	type ICodecOptions,
} from "../../../codec/index.js";
import {
	VersionDispatchingCodecBuilder,
	type CodecAndSchema,
	type CodecVersion,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../codec/versioned/codec.js";
import { FormatValidatorBasic } from "../../../external-utilities/index.js";
import { pkgVersion } from "../../../packageVersion.js";
import type { JsonCompatibleReadOnly, requireAssignableTo } from "../../../util/index.js";

describe("versioned Codecs", () => {
	describe("VersionDispatchingCodecBuilder", () => {
		interface V1 {
			version: 1;
			value1: number;
		}
		interface V2 {
			version: 2;
			value2: number;
		}
		interface VX {
			version: "X";
			valueX: number;
		}
		const codecV1: CodecAndSchema<number> = {
			encode: (x) => ({ version: 1, value1: x }),
			decode: (x) => (x as unknown as V1).value1,
			schema: Versioned,
		};
		const codecV2: CodecAndSchema<number> = {
			encode: (x) => ({ version: 2, value2: x }),
			decode: (x) => (x as unknown as V2).value2,
			schema: Versioned,
		};
		const codecVX: CodecAndSchema<number> = {
			encode: (x) => ({ version: "X", valueX: x }),
			decode: (x) => (x as unknown as VX).valueX,
			schema: Versioned,
		};

		const writableRegistry = [
			{
				minVersionForCollab: lowestMinVersionForCollab,
				formatVersion: 1,
				codec: codecV1,
			},
			{
				minVersionForCollab: FluidClientVersion.v2_43,
				formatVersion: 2,
				codec: () => codecV2,
			},
			{
				minVersionForCollab: undefined,
				formatVersion: "X",
				codec: codecVX,
			},
		] as const;
		const builder = VersionDispatchingCodecBuilder.build("Test", writableRegistry);
		const experimentalSelectorBuilder = VersionDispatchingCodecBuilder.build(
			"PerValue",
			writableRegistry,
			{
				selectWriteFormatVersion: (data, defaultVersion) => (data < 0 ? "X" : defaultVersion),
			},
		);
		const lifecycleRegistry = [
			{
				minVersionForCollab: lowestMinVersionForCollab,
				formatVersion: 1,
				codec: codecV1,
			},
			{
				minVersionForCollab: undefined,
				formatVersion: 0,
				codec: {
					schema: Versioned,
					decode: (
						data: JsonCompatibleReadOnly,
						context: void,
						onError?: DecodeErrorHandler,
					): number => {
						const value = (data as unknown as V1).value1;
						if (typeof value !== "number") {
							throwDecodeError(onError, "Invalid read-only value.");
						}
						return value;
					},
				},
			},
			{
				minVersionForCollab: undefined,
				formatVersion: undefined,
				discontinuedSince: "2.0.0",
			},
		] as const;

		it("round trip", () => {
			const codec1 = builder.build({
				minVersionForCollab: "2.0.0",
				jsonValidator: FormatValidatorBasic,
			});
			const codec2 = builder.build({
				minVersionForCollab: "2.55.0",
				jsonValidator: FormatValidatorBasic,
			});
			const v1 = codec1.encode(42);
			const v2 = codec2.encode(42);
			assert.deepEqual(v1, { version: 1, value1: 42 });
			assert.deepEqual(v2, { version: 2, value2: 42 });
			assert.equal(codec1.decode(v1), 42);
			assert.equal(codec1.decode(v2), 42);
			assert.equal(codec2.decode(v1), 42);
			assert.equal(codec2.decode(v2), 42);

			assert.throws(
				() => codec1.decode({ version: 3, value2: 42 }),
				validateUsageError(`Unsupported version 3 encountered while decoding Test data. Supported versions for this data are: [1,2,"X"].
The client which encoded this data likely specified an "minVersionForCollab" value which corresponds to a version newer than the version of this client ("${pkgVersion}").`),
			);
		});

		it("unstable version", () => {
			const codecX = builder.build({
				minVersionForCollab: "2.0.0",
				jsonValidator: FormatValidatorBasic,
				allowPossiblyIncompatibleWriteVersionOverrides: true,
				writeVersionOverrides: new Map([["Test", "X"]]),
			});
			const codec2 = builder.build({
				minVersionForCollab: "2.55.0",
				jsonValidator: FormatValidatorBasic,
			});
			const vx = codecX.encode(42);
			const v2 = codec2.encode(42);
			assert.deepEqual(vx, { version: "X", valueX: 42 });
			assert.deepEqual(v2, { version: 2, value2: 42 });
			assert.equal(codecX.decode(vx), 42);
			assert.equal(codecX.decode(v2), 42);
			assert.equal(codec2.decode(vx), 42);
			assert.equal(codec2.decode(v2), 42);
		});

		it("selects write versions per value", () => {
			const codec = experimentalSelectorBuilder.build({
				minVersionForCollab: "2.0.0",
				jsonValidator: FormatValidatorBasic,
			});

			assert.deepEqual(codec.encode(42), { version: 1, value1: 42 });
			assert.deepEqual(codec.encode(-1), { version: "X", valueX: -1 });
		});

		{
			type TestVersion = CodecVersion<number, void, 1 | "X">;
			interface InvalidStable {
				minVersionForCollab: typeof lowestMinVersionForCollab;
				formatVersion: "X";
				codec: typeof codecVX;
			}
			// @ts-expect-error Stable formats must use numeric identifiers.
			type _InvalidStable = requireAssignableTo<InvalidStable, TestVersion>;

			interface InvalidExperimental {
				minVersionForCollab: undefined;
				formatVersion: 1;
				codec: typeof codecV1;
			}
			// @ts-expect-error Experimental formats must use string identifiers.
			type _InvalidExperimental = requireAssignableTo<InvalidExperimental, TestVersion>;

			interface InvalidReadonly {
				minVersionForCollab: typeof lowestMinVersionForCollab;
				formatVersion: 1;
				codec: Pick<typeof codecV1, "schema" | "decode">;
			}
			// @ts-expect-error Stable compatibility and a read-only codec cannot be combined.
			type _InvalidReadonly = requireAssignableTo<InvalidReadonly, TestVersion>;

			interface InvalidDiscontinued {
				minVersionForCollab: undefined;
				formatVersion: 1;
				discontinuedSince: "2.0.0";
				codec: typeof codecV1;
			}
			// @ts-expect-error Discontinued behavior is derived from its declaration.
			type _InvalidDiscontinued = requireAssignableTo<InvalidDiscontinued, TestVersion>;
		}

		it("supports read-only and discontinued formats without making them writable", () => {
			const lifecycleBuilder = VersionDispatchingCodecBuilder.build(
				"Lifecycle",
				lifecycleRegistry,
				{
					// @ts-expect-error Read-only formats are not eligible for encoding.
					selectWriteFormatVersion: (data, defaultVersion) => (data < 0 ? 0 : defaultVersion),
				},
			);
			const decoder = lifecycleBuilder.buildDecoder({
				jsonValidator: FormatValidatorBasic,
			});
			assert.equal(decoder.decode({ version: 0, value1: 42 }), 42);
			assert.throws(
				() => decoder.decode({}),
				validateUsageError(
					"Cannot decode data in format undefined. The codec was discontinued in Fluid Framework client version 2.0.0.",
				),
			);
			assert.throws(
				() =>
					decoder.decode({ version: 0 }, undefined, (message) => {
						throw new Error(message);
					}),
				{ message: "Invalid read-only value." },
			);

			for (const [version, kind] of [
				[0, "readonly"],
				[undefined, "discontinued"],
			] as const) {
				assert.throws(
					() =>
						lifecycleBuilder.build({
							minVersionForCollab: "2.0.0",
							jsonValidator: FormatValidatorBasic,
							allowPossiblyIncompatibleWriteVersionOverrides: true,
							writeVersionOverrides: new Map([["Lifecycle", version]]),
						}),
					validateUsageError(
						`Codec "Lifecycle" cannot use requested format version ${version} for encoding because it is ${kind}.`,
					),
				);
			}

			const codec = lifecycleBuilder.build({
				minVersionForCollab: "2.0.0",
				jsonValidator: FormatValidatorBasic,
			});
			assert.throws(
				() => codec.encode(-1),
				validateUsageError(
					'Codec "Lifecycle" cannot encode data using readonly format version 0.',
				),
			);
		});

		it("preserves an explicitly selected undefined format", () => {
			const legacyBuilder = VersionDispatchingCodecBuilder.build("Legacy", lifecycleRegistry, {
				// @ts-expect-error Discontinued formats are not eligible for encoding.
				selectWriteFormatVersion: () => undefined,
			});
			const codec = legacyBuilder.build({
				minVersionForCollab: "2.0.0",
				jsonValidator: FormatValidatorBasic,
			});

			assert.throws(
				() => codec.encode(42),
				validateUsageError(
					'Codec "Legacy" cannot encode data using discontinued format version undefined.',
				),
			);
		});

		it("rejects per-value formats that conflict with an explicit override", () => {
			const codec = experimentalSelectorBuilder.build({
				minVersionForCollab: "2.0.0",
				jsonValidator: FormatValidatorBasic,
				writeVersionOverrides: new Map([["PerValue", 1]]),
			});

			assert.throws(
				() => codec.encode(-1),
				validateUsageError(
					'Codec "PerValue" cannot encode this data using explicitly selected format version 1. The data requires format version "X".',
				),
			);
		});

		it("rejects unsupported per-value formats", () => {
			const perValueBuilder = VersionDispatchingCodecBuilder.build(
				"PerValue",
				writableRegistry,
				{
					// @ts-expect-error Unregistered formats are not eligible for encoding.
					selectWriteFormatVersion: () => 3,
				},
			);
			const codec = perValueBuilder.build({
				minVersionForCollab: "2.0.0",
				jsonValidator: FormatValidatorBasic,
			});

			assert.throws(
				() => codec.encode(42),
				validateUsageError(
					'Codec "PerValue" selected unsupported format version 3 while encoding. Supported versions are: [1,2,"X"].',
				),
			);
		});

		it("rejects per-value stable formats incompatible with minVersionForCollab", () => {
			const perValueBuilder = VersionDispatchingCodecBuilder.build(
				"PerValue",
				writableRegistry,
				{
					selectWriteFormatVersion: (data, defaultVersion) => (data < 0 ? 2 : defaultVersion),
				},
			);
			const codec = perValueBuilder.build({
				minVersionForCollab: "2.0.0",
				jsonValidator: FormatValidatorBasic,
			});

			assert.throws(
				() => codec.encode(-1),
				validateUsageError(
					'Codec "PerValue" selected format version 2 for this data, but that format is only compatible back to client version 2.43.0 and the requested oldest compatible client was 2.0.0.',
				),
			);
		});

		it("bad override", () => {
			assert.throws(
				() =>
					builder.build({
						minVersionForCollab: "2.0.0",
						jsonValidator: FormatValidatorBasic,
						writeVersionOverrides: new Map([["Test", "X"]]),
					}),
				validateUsageError(
					`Codec "Test" does not support requested format version "X" because it is experimental. Use "allowPossiblyIncompatibleWriteVersionOverrides" to suppress this error if appropriate.`,
				),
			);

			assert.throws(
				() =>
					builder.build({
						minVersionForCollab: "2.0.0",
						jsonValidator: FormatValidatorBasic,
						allowPossiblyIncompatibleWriteVersionOverrides: true,
						writeVersionOverrides: new Map([["Test", "1"]]),
					}),
				validateUsageError(
					`Codec "Test" does not support requested format version "1". Supported writable versions are: [1,2,"X"].`,
				),
			);
		});

		it("distinct encode and decode context types", () => {
			interface EncodeContext {
				encodeOffset: number;
			}
			interface DecodeContext {
				decodeOffset: number;
			}
			interface Encoded {
				version: 1;
				value: number;
			}
			const contextualCodec: CodecAndSchema<number, EncodeContext, DecodeContext> = {
				encode: (value, context) => ({ version: 1, value: value + context.encodeOffset }),
				decode: (data, context) => (data as unknown as Encoded).value + context.decodeOffset,
				schema: Versioned,
			};
			const contextualBuilder = VersionDispatchingCodecBuilder.build("Contextual", [
				{
					minVersionForCollab: lowestMinVersionForCollab,
					formatVersion: 1,
					codec: contextualCodec,
				},
			]);
			const codec = contextualBuilder.build({
				minVersionForCollab: "2.0.0",
				jsonValidator: FormatValidatorBasic,
			});

			const encoded = codec.encode(5, { encodeOffset: 10 });
			assert.deepEqual(encoded, { version: 1, value: 15 });
			assert.equal(codec.decode(encoded, { decodeOffset: -10 }), 5);
		});

		it("preserves required factory options in a pre-annotated lifecycle registry", () => {
			interface BuildOptions extends ICodecOptions {
				offset: number;
			}
			const registry: CodecVersion<number, void, 1 | -1, BuildOptions>[] = [
				{
					minVersionForCollab: lowestMinVersionForCollab,
					formatVersion: 1,
					codec: (options: BuildOptions) => ({
						schema: Versioned,
						encode: (data: number) => ({ version: 1, value1: data + options.offset }),
						decode: (data: JsonCompatibleReadOnly) =>
							(data as unknown as V1).value1 - options.offset,
					}),
				},
				{
					minVersionForCollab: undefined,
					formatVersion: -1,
					discontinuedSince: "2.0.0",
				},
			];
			const lifecycleBuilder = VersionDispatchingCodecBuilder.build(
				"FactoryOptions",
				registry,
			);
			const buildOptions = {
				jsonValidator: FormatValidatorBasic,
				minVersionForCollab: lowestMinVersionForCollab,
				offset: 10,
			};
			const codec = lifecycleBuilder.build(buildOptions);
			assert.deepEqual(codec.encode(42), { version: 1, value1: 52 });
			assert.equal(codec.decode({ version: 1, value1: 52 }), 42);

			const missingOptions = {
				jsonValidator: FormatValidatorBasic,
				minVersionForCollab: lowestMinVersionForCollab,
			};
			type InferredOptions = Parameters<typeof lifecycleBuilder.build>[0];
			// @ts-expect-error Build options must include the factory's required offset.
			type _MissingBuildOptions = requireAssignableTo<typeof missingOptions, InferredOptions>;
		});

		it("infers factory options and contexts alongside direct and discontinued codecs", () => {
			interface EncodeContext {
				encodeOffset: number;
			}
			interface DecodeContext {
				decodeOffset: number;
			}
			interface BuildOptions extends ICodecOptions {
				offset: number;
			}
			interface ReadonlyBuildOptions extends ICodecOptions {
				readonlyOffset: number;
			}
			const contextualBuilder = VersionDispatchingCodecBuilder.build(
				"MixedFactoryOptions",
				[
					{
						minVersionForCollab: lowestMinVersionForCollab,
						formatVersion: 1,
						codec: codecV1,
					},
					{
						minVersionForCollab: FluidClientVersion.v2_43,
						formatVersion: 2,
						codec: (_options: ICodecOptions) => codecV2,
					},
					{
						minVersionForCollab: undefined,
						formatVersion: "X",
						codec: (options: BuildOptions) => ({
							schema: Versioned,
							encode: (data: number, context: EncodeContext) => ({
								version: "X",
								valueX: data + options.offset + context.encodeOffset,
							}),
							decode: (data: JsonCompatibleReadOnly, context: DecodeContext) =>
								(data as unknown as VX).valueX - options.offset + context.decodeOffset,
						}),
					},
					{
						minVersionForCollab: undefined,
						formatVersion: 0,
						codec: (options: ReadonlyBuildOptions) => ({
							schema: Versioned,
							decode: (data: JsonCompatibleReadOnly, context: DecodeContext) =>
								(data as unknown as V1).value1 + options.readonlyOffset + context.decodeOffset,
						}),
					},
					{
						minVersionForCollab: undefined,
						formatVersion: -1,
						discontinuedSince: "2.0.0",
					},
				],
				{
					selectWriteFormatVersion: (data, defaultVersion) =>
						data < 0 ? "X" : defaultVersion,
				},
			);
			const codec = contextualBuilder.build({
				jsonValidator: FormatValidatorBasic,
				minVersionForCollab: lowestMinVersionForCollab,
				offset: 10,
				readonlyOffset: 5,
			});
			const encoded = codec.encode(-1, { encodeOffset: 5 });
			assert.deepEqual(encoded, { version: "X", valueX: 14 });
			const decoded = codec.decode(encoded, { decodeOffset: -5 });
			assert.equal(decoded, -1);
			assert.equal(codec.decode({ version: 0, value1: 42 }, { decodeOffset: -5 }), 42);

			const missingOptions = {
				jsonValidator: FormatValidatorBasic,
				minVersionForCollab: lowestMinVersionForCollab,
			};
			type InferredOptions = Parameters<typeof contextualBuilder.build>[0];
			// @ts-expect-error Direct and discontinued entries must not erase required factory options.
			type _MissingOptions = requireAssignableTo<typeof missingOptions, InferredOptions>;
			type WritableOptions = typeof missingOptions & BuildOptions;
			// @ts-expect-error Options must satisfy the read-only factory as well as the writable factory.
			type _MissingReadonlyOptions = requireAssignableTo<WritableOptions, InferredOptions>;
			type _Decoded = requireAssignableTo<typeof decoded, number>;
			// @ts-expect-error The decoded value must retain its number type.
			type _InvalidDecoded = requireAssignableTo<typeof decoded, string>;
		});

		it("good builds", () => {
			VersionDispatchingCodecBuilder.build("Test", [
				{
					minVersionForCollab: lowestMinVersionForCollab,
					formatVersion: 1,
					codec: codecV1,
				},
			]);
		});

		describe("buildDecoder", () => {
			it("decodes all supported format versions", () => {
				const decoder = builder.buildDecoder({ jsonValidator: FormatValidatorBasic });
				assert.equal(decoder.decode({ version: 1, value1: 42 }), 42);
				assert.equal(decoder.decode({ version: 2, value2: 99 }), 99);
				assert.equal(decoder.decode({ version: "X", valueX: 7 }), 7);
			});

			it("throws UsageError for unsupported version", () => {
				const decoder = builder.buildDecoder({ jsonValidator: FormatValidatorBasic });
				assert.throws(
					() => decoder.decode({ version: 3, value2: 42 }),
					validateUsageError(
						`Unsupported version 3 encountered while decoding Test data. Supported versions for this data are: [1,2,"X"].
The client which encoded this data likely specified an "minVersionForCollab" value which corresponds to a version newer than the version of this client ("${pkgVersion}").`,
					),
				);
			});
		});

		it("bad builds", () => {
			// Build asserts are debugAsserts, so only test them when those are enabled.
			if (nonProductionConditionalsIncluded()) {
				assert.throws(
					() =>
						VersionDispatchingCodecBuilder.build("Test", [
							{
								minVersionForCollab: lowestMinVersionForCollab,
								formatVersion: 1,
								codec: codecV1,
							},
							{
								minVersionForCollab: lowestMinVersionForCollab,
								formatVersion: 2,
								codec: codecV1,
							},
						]),
					validateAssertionError(
						`Debug assert failed: Codec Test has multiple entries for version "${lowestMinVersionForCollab}"`,
					),
				);

				assert.throws(
					() =>
						VersionDispatchingCodecBuilder.build("Test", [
							{
								minVersionForCollab: lowestMinVersionForCollab,
								formatVersion: 1,
								codec: codecV1,
							},
							{
								minVersionForCollab: undefined,
								formatVersion: 1,
								codec: {
									schema: Versioned,
									decode: (data: JsonCompatibleReadOnly) => (data as unknown as V1).value1,
								},
							},
						]),
					validateAssertionError(`Debug assert failed: duplicate codec format Test 1`),
				);
			}
		});
	});
});

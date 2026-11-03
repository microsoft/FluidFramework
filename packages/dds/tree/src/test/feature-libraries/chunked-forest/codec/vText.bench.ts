/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { IsoBuffer } from "@fluid-internal/client-utils";
import {
	BenchmarkMode,
	BenchmarkType,
	benchmarkDurationBatchless,
	benchmarkIt,
	currentBenchmarkMode,
	ValueType,
	type CollectedData,
} from "@fluid-tools/benchmark";

import { currentVersion, FormatValidatorNoOp } from "../../../../codec/index.js";
import type { JsonableTree, TreeStoredSchema } from "../../../../core/index.js";
import {
	noSpecialization,
	schemaCompressedEncodeVTextExperimental,
	type SpecializationStrategy,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../../feature-libraries/chunked-forest/codec/schemaBasedEncodeVText.js";
import {
	cursorForJsonableTreeField,
	defaultSchemaPolicy,
	FieldBatchFormatVersion,
	fieldBatchCodecBuilder,
	jsonableTreeFromCursor,
	jsonableTreeFromFieldCursor,
	TreeCompressionStrategy,
} from "../../../../feature-libraries/index.js";
import { JsonAsTree } from "../../../../jsonDomainSchema.js";
import type {
	ImplicitFieldSchema,
	InsertableField,
	UnsafeUnknownSchema,
} from "../../../../simple-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { toInitialSchema } from "../../../../simple-tree/toStoredSchema.js";
import { PlainText } from "../../../../text/index.js";
import type { JsonCompatible } from "../../../../util/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { generateCanada } from "../../../domains/json/canada.js";
// eslint-disable-next-line import-x/no-internal-modules
import { generateCitmJson } from "../../../domains/json/citm.js";
// eslint-disable-next-line import-x/no-internal-modules
import { generateTwitterJsonByNumStatuses } from "../../../domains/json/twitter.js";
import { singleJsonCursor } from "../../../json/index.js";
import {
	makeDeepContentSimple,
	makeWideContentWithEndValueSimple,
} from "../../../scalableTestTrees.js";
import { Table } from "../../../tablePerformanceTestUtilities.js";
// eslint-disable-next-line import-x/no-internal-modules
import { FormattedTextTest } from "../../../text/formattedTextTest.js";
import {
	configureBenchmarkHooks,
	fieldCursorFromInsertable,
	makeTestFieldBatchContexts,
} from "../../../utils.js";

interface DatasetContent {
	readonly tree: JsonableTree[];
	readonly schema: TreeStoredSchema;
}

interface Dataset {
	readonly name: string;
	readonly benchmarkType: BenchmarkType;
	readonly build: () => DatasetContent;
}

const specializationStrategies: ReadonlyMap<string, SpecializationStrategy> = new Map([
	["noSpecialization", noSpecialization],
]);

function fromSimpleTree(
	schema: ImplicitFieldSchema,
	content: InsertableField<UnsafeUnknownSchema>,
): DatasetContent {
	return {
		tree: jsonableTreeFromFieldCursor(
			fieldCursorFromInsertable<UnsafeUnknownSchema>(schema, content),
		),
		schema: toInitialSchema(schema),
	};
}

function fromJson(json: JsonCompatible): DatasetContent {
	return {
		tree: [jsonableTreeFromCursor(singleJsonCursor(json))],
		schema: toInitialSchema(JsonAsTree.Tree),
	};
}

function makeText(size: number): string {
	const sample = "The quick brown fox jumps over the lazy dog. ";
	return sample.repeat(Math.ceil(size / sample.length)).slice(0, size);
}

function makeModeratelyFormattedText(size: number): FormattedTextTest.Tree {
	const text = FormattedTextTest.Tree.fromString("");
	const content = makeText(size);
	for (let index = 0; index < size; index += 100) {
		text.insertAt(text.characterCount(), content.slice(index, index + 80), {
			bold: false,
			size: 12,
			font: "Arial",
		});
		if (index + 80 < size) {
			text.insertAt(text.characterCount(), content.slice(index + 80, index + 100), {
				bold: true,
				size: 12,
				font: "Arial",
			});
		}
	}
	return text;
}

function makeTable(size: number, value: (row: number, column: number) => string): Table {
	const columnIds = Array.from({ length: size }, (_, index) => `column-${index}`);
	return Table.create({
		columns: columnIds.map((id) => ({ id })),
		rows: Array.from({ length: size }, (_, row) => ({
			id: `row-${row}`,
			cells: Object.fromEntries(columnIds.map((id, column) => [id, value(row, column)])),
		})),
	});
}

/**
 * Returns the sizes to run: `small` always, and `large` only in performance mode.
 */
function sizes(
	small: number,
	large: number,
): { readonly size: number; readonly benchmarkType: BenchmarkType }[] {
	return [
		{ size: small, benchmarkType: BenchmarkType.Measurement },
		...(currentBenchmarkMode === BenchmarkMode.Performance
			? [{ size: large, benchmarkType: BenchmarkType.Measurement }]
			: []),
	];
}

const datasets: readonly Dataset[] = [
	...sizes(1000, 10000).flatMap(({ size, benchmarkType }) => [
		{
			name: `Plain text, ${size} characters`,
			benchmarkType,
			build: () => fromSimpleTree(PlainText.Tree, PlainText.Tree.fromString(makeText(size))),
		},
		{
			name: `Formatted text, ${size} characters, constant format`,
			benchmarkType,
			build: () =>
				fromSimpleTree(
					FormattedTextTest.Tree,
					FormattedTextTest.Tree.fromString(makeText(size)),
				),
		},
		{
			name: `Formatted text, ${size} characters, moderate formatting (80 normal / 20 bold)`,
			benchmarkType,
			build: () => fromSimpleTree(FormattedTextTest.Tree, makeModeratelyFormattedText(size)),
		},
	]),
	...sizes(10, 40).flatMap(({ size, benchmarkType }) => [
		{
			name: `Table, ${size}x${size} cells, constant values`,
			benchmarkType,
			build: () =>
				fromSimpleTree(
					Table,
					makeTable(size, () => "cell"),
				),
		},
		{
			name: `Table, ${size}x${size} cells, alternating values`,
			benchmarkType,
			build: () =>
				fromSimpleTree(
					Table,
					makeTable(size, (row, column) => `cell-${(row + column) % 2}`),
				),
		},
		{
			name: `Table, ${size}x${size} cells, distinct values`,
			benchmarkType,
			build: () =>
				fromSimpleTree(
					Table,
					makeTable(size, (row, column) => `cell-${row}-${column}`),
				),
		},
	]),
	// Datasets without text, to catch strategies that make other tree shapes slower or larger.
	...sizes(10, 100).map(({ size, benchmarkType }) => ({
		name: `Canada JSON, ${size} segments of 50 points`,
		benchmarkType,
		build: () =>
			fromJson(
				generateCanada(Array.from({ length: size }, () => 50)) as unknown as JsonCompatible,
			),
	})),
	...sizes(20000, 200000).map(({ size, benchmarkType }) => ({
		name: `CITM JSON, at most ${size} bytes`,
		benchmarkType,
		build: () => fromJson(generateCitmJson(1, size) as unknown as JsonCompatible),
	})),
	...sizes(5, 50).map(({ size, benchmarkType }) => ({
		name: `Twitter JSON, ${size} statuses`,
		benchmarkType,
		build: () => fromJson(generateTwitterJsonByNumStatuses(size) as unknown as JsonCompatible),
	})),
	...sizes(1000, 10000).map(({ size, benchmarkType }) => ({
		name: `Wide tree, ${size} numbers`,
		benchmarkType,
		build: () => {
			const { schema, initialTree } = makeWideContentWithEndValueSimple(size);
			return fromSimpleTree(schema, initialTree);
		},
	})),
	...sizes(50, 200).map(({ size, benchmarkType }) => ({
		name: `Deep tree, ${size} levels`,
		benchmarkType,
		build: () => {
			const { schema, initialTree } = makeDeepContentSimple(size);
			return fromSimpleTree(schema, initialTree);
		},
	})),
];

/**
 * Returns a function that encodes `tree` with `strategy`.
 * @remarks
 * Calls the vText encoder directly instead of the field batch codec, because only a direct call can choose the strategy.
 * Decode benchmarks go through the codec, so they also measure its version dispatch.
 * Compare encode durations with each other, not with decode durations.
 */
function prepareEncode({ tree, schema }: DatasetContent, strategy: SpecializationStrategy) {
	const { encode } = makeTestFieldBatchContexts({
		encodeType: TreeCompressionStrategy.Compressed,
		schema: { schema, policy: defaultSchemaPolicy },
	});
	return () =>
		schemaCompressedEncodeVTextExperimental(
			schema,
			defaultSchemaPolicy,
			[cursorForJsonableTreeField(tree)],
			encode.idCompressor,
			undefined /* incrementalEncoder */,
			false /* isSummary */,
			strategy,
		);
}

function prepareDecode(dataset: Dataset, strategy: SpecializationStrategy) {
	const content = dataset.build();
	const encoded = prepareEncode(content, strategy)();
	const codec = fieldBatchCodecBuilder.build({
		jsonValidator: FormatValidatorNoOp,
		minVersionForCollab: currentVersion,
		writeVersionOverrides: new Map([
			[fieldBatchCodecBuilder.name, FieldBatchFormatVersion.vTextExperimental],
		]),
		allowPossiblyIncompatibleWriteVersionOverrides: true,
	});
	const { decode } = makeTestFieldBatchContexts({
		encodeType: TreeCompressionStrategy.Compressed,
	});
	assert.deepEqual(codec.decode(encoded, decode).map(jsonableTreeFromFieldCursor), [
		content.tree,
	]);
	return () => codec.decode(encoded, decode);
}

function durationMeasurement(setup: () => () => unknown) {
	return benchmarkDurationBatchless({
		benchmarkFn: (state) => {
			const run = setup();
			let running: boolean;
			do {
				running = state.time(run);
			} while (running);
		},
		maxBenchmarkDurationSeconds: 5,
	});
}

const measurements = [
	{
		name: "Encode duration",
		measure: (dataset: Dataset, strategy: SpecializationStrategy) =>
			durationMeasurement(() => prepareEncode(dataset.build(), strategy)),
	},
	{
		name: "Decode duration",
		measure: (dataset: Dataset, strategy: SpecializationStrategy) =>
			durationMeasurement(() => prepareDecode(dataset, strategy)),
	},
	{
		name: "Encoded JSON size",
		measure: (dataset: Dataset, strategy: SpecializationStrategy) => ({
			run: () => {
				const encoded = prepareEncode(dataset.build(), strategy)();
				return [
					{
						name: "encodedSize",
						value: IsoBuffer.from(JSON.stringify(encoded)).byteLength,
						units: "bytes",
						type: ValueType.SmallerIsBetter,
						significance: "Primary",
					},
				] satisfies CollectedData;
			},
		}),
	},
];

/**
 * Benchmarks the vTextExperimental field batch codec and its specialization strategies in isolation.
 *
 * @remarks
 * This measures only the codec, not a full SharedTree: summary wrapping, schema, and edit history are excluded.
 * For summary size and load time of whole text documents, see textDomain.integration.bench.ts.
 *
 * Each measurement is registered for every dataset and specialization strategy.
 * Tests are grouped by measurement, then dataset, so strategies appear as adjacent rows in each result table.
 * Setup runs only when a test executes, outside the measured operation.
 * The noSpecialization rows are the V2 baseline: that strategy writes the same data as V2, except for the version.
 */
describe("vText benchmarks", () => {
	configureBenchmarkHooks();

	for (const measurement of measurements) {
		describe(measurement.name, () => {
			for (const dataset of datasets) {
				describe(dataset.name, () => {
					for (const [name, strategy] of specializationStrategies) {
						benchmarkIt({
							title: name,
							type: dataset.benchmarkType,
							...measurement.measure(dataset, strategy),
						});
					}
				});
			}
		});
	}
});

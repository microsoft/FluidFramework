/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "node:assert";
import * as fs from "node:fs";

import { IRandom } from "@fluid-private/stochastic-test-utils";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";

import { walkAllChildSegments } from "../mergeTreeNodeWalk.js";
import { ISegmentPrivate, SegmentGroup } from "../mergeTreeNodes.js";
import { IMergeTreeOp, MergeTreeDeltaType, ReferenceType } from "../ops.js";
import { toMoveInfo, toRemovalInfo } from "../segmentInfos.js";
import { Side } from "../sequencePlace.js";
import { TextSegment } from "../textSegment.js";

import { _dirname } from "./dirname.cjs";
import { TestClient } from "./testClient.js";
import { TestClientLogger } from "./testClientLogger.js";

export type TestOperation = (
	client: TestClient,
	opStart: number,
	opEnd: number,
	random: IRandom,
) => IMergeTreeOp | undefined;

export const removeRange: TestOperation = (
	client: TestClient,
	opStart: number,
	opEnd: number,
) => client.removeRangeLocal(opStart, opEnd);

export const obliterateRange: TestOperation = (
	client: TestClient,
	opStart: number,
	opEnd: number,
) => client.obliterateRangeLocal(opStart, opEnd);

export const obliterateRangeSided: TestOperation = (
	client: TestClient,
	opStart: number,
	opEnd: number,
	random: IRandom,
) => {
	let startSide: Side;
	let endSide: Side;

	const oblEnd = random.integer(opStart, client.getLength() - 1);
	// TODO: to create zero length obliterate ops, change '<=' to '<'.
	// Doing so may cause different failures than those without zero length.
	// AB#19930
	if (oblEnd - opStart <= 1) {
		startSide = Side.Before;
		endSide = Side.After;
	} else {
		startSide = random.pick([Side.Before, Side.After]);
		endSide = random.pick([Side.Before, Side.After]);
	}

	const start = { pos: opStart, side: startSide };
	const end = { pos: oblEnd, side: endSide };
	return client.obliterateRangeLocal(start, end);
};

export const annotateRange: TestOperation = (
	client: TestClient,
	opStart: number,
	opEnd: number,
	random: IRandom,
) => {
	if (random.bool()) {
		return client.annotateRangeLocal(opStart, opEnd, {
			[random.integer(1, 5)]: client.longClientId,
		});
	} else {
		const max = random.pick([undefined, random.integer(-10, 100)]);
		const min = random.pick([undefined, random.integer(-100, 10)]);
		return client.annotateAdjustRangeLocal(opStart, opEnd, {
			[random.integer(0, 2).toString()]: {
				delta: random.integer(-5, 5),
				min: (min ?? max ?? 0) > (max ?? 0) ? undefined : min,
				max,
			},
		});
	}
};

export const insertAtRefPos: TestOperation = (
	client: TestClient,
	opStart: number,
	opEnd: number,
	random: IRandom,
) => {
	const segs: ISegmentPrivate[] = [];
	// gather all the segments at the pos, including removed segments
	walkAllChildSegments(client.mergeTree.root, (seg) => {
		const pos = client.getPosition(seg);
		if (pos >= opStart) {
			if (pos <= opStart) {
				segs.push(seg);
				return true;
			}
			return false;
		}
		return true;
	});
	if (segs.length > 0) {
		const text = client.longClientId!.repeat(random.integer(1, 3));
		const seg = random.pick(segs);
		const movedOrRemoved = toRemovalInfo(seg) ?? toMoveInfo(seg);
		const lref = client.createLocalReferencePosition(
			seg,
			movedOrRemoved ? 0 : random.integer(0, seg.cachedLength - 1),
			movedOrRemoved
				? ReferenceType.SlideOnRemove
				: random.pick([
						ReferenceType.Simple,
						ReferenceType.SlideOnRemove,
						ReferenceType.Transient,
					]),
			undefined,
		);

		return client.insertAtReferencePositionLocal(lref, TextSegment.make(text));
	}
};

export const insert: TestOperation = (
	client: TestClient,
	_start: number,
	_end: number,
	random: IRandom,
) => {
	// Note: the _start param is generated using exclusive range. This provides more coverage by allowing
	// insertion at the end.
	const start = random.integer(0, client.getLength());
	const text = client.longClientId!.repeat(random.integer(1, 3));
	return client.insertTextLocal(start, text);
};

const generateInsert = (client: TestClient, random: IRandom): IMergeTreeOp | undefined => {
	const len = client.getLength();
	const text = client.longClientId!.repeat(random.integer(1, 3));
	return client.insertTextLocal(random.integer(0, len), text);
};

const generateEndpoints = (
	client: TestClient,
	random: IRandom,
): { start: number; end: number } => {
	const len = client.getLength();
	const start = random.integer(0, len - 1);
	const end = random.integer(start + 1, len);
	return { start, end };
};

export interface IConfigRange {
	min: number;
	max: number;
	growthFunc?: (input: number) => number;
}

export function doOverRange(
	range: IConfigRange,
	defaultGrowthFunc: (input: number) => number,
	doAction: (current: number) => void,
): void {
	let lastCurrent = Number.NaN;
	for (
		let current = range.min;
		current <= range.max;
		current = (range.growthFunc ?? defaultGrowthFunc)(current)
	) {
		// let growth funcs be simple
		// especially around 0 and 1
		// if the value didn't change,
		// just increment it
		if (current === lastCurrent) {
			current++;
		}
		if (current <= range.max) {
			lastCurrent = current;
			doAction(current);
		}
	}
}

export function resolveRange(
	range: IConfigRange,
	defaultGrowthFunc: (input: number) => number,
): number[] {
	const results: number[] = [];
	doOverRange(range, range.growthFunc ?? defaultGrowthFunc, (num) => {
		results.push(num);
	});
	return results;
}

export function resolveRanges<T extends object>(
	ranges: T,
	defaultGrowthFunc: (input: number) => number,
): ResolvedRanges<T> {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	const resolvedRanges: ResolvedRanges<T> = {} as ResolvedRanges<T>;
	for (const [key, value] of Object.entries(ranges)) {
		if (isConfigRange(value)) {
			resolvedRanges[key] = resolveRange(value, defaultGrowthFunc);
		}
	}
	return resolvedRanges;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isConfigRange(t: any): t is IConfigRange {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
	return typeof t === "object" && typeof t.min === "number" && typeof t.max === "number";
}

type ReplaceRangeWith<T, TReplace> = T extends { min: number; max: number } ? TReplace : never;

type RangePropertyNames<T> = {
	[K in keyof T]-?: T[K] extends IConfigRange ? K : never;
}[keyof T];

type PickFromRanges<T> = {
	[K in RangePropertyNames<T>]: ReplaceRangeWith<T[K], number>;
};

type ResolvedRanges<T> = {
	[K in RangePropertyNames<T>]: ReplaceRangeWith<T[K], number[]>;
};

interface ProvidesGrowthFunc {
	growthFunc: (input: number) => number;
}

export function doOverRanges<T extends ProvidesGrowthFunc>(
	ranges: T,
	doAction: (selection: PickFromRanges<T>, description: string) => void,
): void {
	const rangeEntries: [string, IConfigRange][] = [];
	for (const [key, value] of Object.entries(ranges)) {
		if (isConfigRange(value)) {
			rangeEntries.push([key, value]);
		}
	}

	const doOverRangesHelper = (selections: [string, number][]): void => {
		if (selections.length === rangeEntries.length) {
			const selectionsObj = {};
			for (const [key, value] of selections) {
				selectionsObj[key] = value;
			}
			const description = selections.map(([key, value]) => `${key}:${value}`).join("_");
			doAction(selectionsObj as PickFromRanges<T>, description);
		} else {
			const [key, value] = rangeEntries[selections.length];
			doOverRange(value, value.growthFunc ?? ranges.growthFunc, (selection) => {
				selections.push([key, selection]);
				doOverRangesHelper(selections);
				selections.pop();
			});
		}
	};

	doOverRangesHelper([]);
}

export interface IMergeTreeOperationRunnerConfig {
	readonly rounds: number;
	readonly opsPerRoundRange: IConfigRange;
	readonly incrementalLog?: boolean;
	readonly operations: readonly TestOperation[];
	readonly applyOpDuringGeneration?: boolean;
	growthFunc(input: number): number;
	resultsFilePostfix?: string;
	insertText?: (client: TestClient, random: IRandom) => IMergeTreeOp | undefined;
	updateEndpoints?: (client: TestClient, random: IRandom) => { start: number; end: number };
}

export interface ReplayGroup {
	msgs: ISequencedDocumentMessage[];
	initialText: string;
	resultText: string;
	seq: number;
}

export const replayResultsPath = `${_dirname}/../../src/test/results`;

export function runMergeTreeOperationRunner(
	random: IRandom,
	startingSeq: number,
	clients: readonly TestClient[],
	minLength: number,
	config: IMergeTreeOperationRunnerConfig,
	apply: ApplyMessagesFn = applyMessages,
): number {
	let seq = startingSeq;
	const results: ReplayGroup[] = [];

	let fakeTime = 1725916319097;

	doOverRange(config.opsPerRoundRange, config.growthFunc, (opsPerRound) => {
		if (config.incrementalLog) {
			console.log(
				`MinLength: ${minLength} Clients: ${clients.length} Ops: ${opsPerRound} Seq: ${seq}`,
			);
		}
		for (let round = 0; round < config.rounds; round++) {
			const initialText = clients[0].getText();
			const logger = new TestClientLogger(
				clients,
				`Clients: ${clients.length} Ops: ${opsPerRound} Round: ${round}`,
			);
			const messageData = generateOperationMessagesForClients(
				random,
				seq,
				clients,
				logger,
				opsPerRound,
				minLength,
				config.operations,
				config.applyOpDuringGeneration,
				config.insertText,
				config.updateEndpoints,
			);
			seq = apply(messageData[0][0].sequenceNumber - 1, messageData, clients, logger, random);
			const resultText = logger.validate();
			results.push({
				initialText,
				resultText,
				msgs: messageData.map((md) => ({ ...md[0], timestamp: fakeTime++ })),
				seq,
			});
			logger.dispose();
		}
	});

	if (config.resultsFilePostfix !== undefined) {
		const resultsFilePath = `${replayResultsPath}/len_${minLength}-clients_${clients.length}-${config.resultsFilePostfix}`;
		fs.writeFileSync(resultsFilePath, JSON.stringify(results, undefined, "\t"));
	}

	return seq;
}

export function generateOperationMessagesForClients(
	random: IRandom,
	startingSeq: number,
	clients: readonly TestClient[],
	logger: TestClientLogger,
	opsPerRound: number,
	minLength: number,
	operations: readonly TestOperation[],
	applyOpDuringGeneration?: boolean,
	insertText?: (client: TestClient, random: IRandom) => IMergeTreeOp | undefined,
	updateEndpoints?: (client: TestClient, random: IRandom) => { start: number; end: number },
): [ISequencedDocumentMessage, SegmentGroup | SegmentGroup[]][] {
	const minimumSequenceNumber = startingSeq;
	let runningSeq = startingSeq;
	const messages: [ISequencedDocumentMessage, SegmentGroup | SegmentGroup[]][] = [];

	for (let i = 0; i < opsPerRound; i++) {
		// pick a client greater than 0, client 0 only applies remote ops
		// and is our baseline
		const client = clients[random.integer(1, clients.length - 1)];

		if (applyOpDuringGeneration === true && messages.length > 0 && random.bool()) {
			const toApply = messages
				.filter(([msg]) => msg.sequenceNumber > client.getCollabWindow().currentSeq)
				.slice(0, random.integer(1, 3));
			applyMessages(toApply[0][0].sequenceNumber - 1, toApply, [client], logger);
		}
		const len = client.getLength();
		const sg = client.peekPendingSegmentGroups();
		let op: IMergeTreeOp | undefined;
		if (len === 0 || len < minLength) {
			op =
				insertText === undefined ? generateInsert(client, random) : insertText(client, random);
		} else {
			let opIndex = random.integer(0, operations.length - 1);
			// TODO: without accounting for potential fields here, we hit MergeTree insert failures.
			const { start, end } =
				updateEndpoints === undefined
					? generateEndpoints(client, random)
					: updateEndpoints(client, random);

			for (let y = 0; y < operations.length && op === undefined; y++) {
				op = operations[opIndex](client, start, end, random);
				opIndex++;
				opIndex %= operations.length;
			}
		}
		if (op !== undefined) {
			// Pre-check to avoid logger.toString() in the string template
			if (sg === client.peekPendingSegmentGroups()) {
				assert.notEqual(
					sg,
					client.peekPendingSegmentGroups(),
					`op created but segment group not enqueued.${logger}`,
				);
			}
			const message = client.makeOpMessage(op, ++runningSeq);
			message.minimumSequenceNumber = minimumSequenceNumber;
			messages.push([
				message,
				client.peekPendingSegmentGroups(
					op.type === MergeTreeDeltaType.GROUP ? op.ops.length : 1,
				)!,
			]);
		}
	}

	const maxProcessedSeq = Math.max(...clients.map((c) => c.getCollabWindow().currentSeq));
	if (messages.length > 0) {
		const index = messages.findIndex(([msg]) => msg.sequenceNumber === maxProcessedSeq);
		if (index !== -1) {
			const apply = messages.splice(0, index + 1);
			applyMessages(apply[0][0].sequenceNumber - 1, apply, clients, logger);
		}
	}

	return messages;
}

export function generateClientNames(): string[] {
	const clientNames: string[] = [];
	function addClientNames(startChar: string, count: number): void {
		const startCode = startChar.codePointAt(0);
		if (startCode === undefined) {
			throw new Error("startCode must be a single character");
		}
		for (let i = 0; i < count; i++) {
			clientNames.push(String.fromCodePoint(startCode + i));
		}
	}

	addClientNames("A", 26);
	addClientNames("a", 26);
	addClientNames("0", 17);

	return clientNames;
}

type ApplyMessagesFn = (
	startingSeq: number,
	messageData: [ISequencedDocumentMessage, SegmentGroup | SegmentGroup[]][],
	clients: readonly TestClient[],
	logger: TestClientLogger,
	random: IRandom,
) => number;

export function applyMessages(
	startingSeq: number,
	messageData: [ISequencedDocumentMessage, SegmentGroup | SegmentGroup[]][],
	clients: readonly TestClient[],
	logger: TestClientLogger,
): number {
	let seq = startingSeq;
	try {
		// log and apply all the ops created in the round
		// eslint-disable-next-line @typescript-eslint/prefer-for-of
		for (let i = 0; i < messageData.length; i++) {
			const [message] = messageData[i];
			message.sequenceNumber = ++seq;
			for (const c of clients) {
				if (c.getCollabWindow().currentSeq < message.sequenceNumber) {
					c.applyMsg(message);
				}
			}
		}
	} catch (error) {
		throw logger.addLogsToError(error);
	}
	return seq;
}

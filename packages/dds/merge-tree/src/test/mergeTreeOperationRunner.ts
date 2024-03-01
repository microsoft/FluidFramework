/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "assert";
import * as fs from "fs";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IRandom } from "@fluid-private/stochastic-test-utils";
import { IMergeTreeOp, MergeTreeDeltaType, ReferenceType } from "../ops.js";
import { TextSegment } from "../textSegment.js";
import { ISegment, SegmentGroup, toRemovalInfo } from "../mergeTreeNodes.js";
import { walkAllChildSegments } from "../mergeTreeNodeWalk.js";
import { TestClient } from "./testClient.js";
import { TestClientLogger } from "./testClientLogger.js";
import { _dirname } from "./dirname.cjs";

export type TestOperation = (
	client: TestClient,
	opStart: number,
	opEnd: number,
	random: IRandom,
) => IMergeTreeOp | undefined;

export const removeRange: TestOperation = (client: TestClient, opStart: number, opEnd: number) =>
	client.removeRangeLocal(opStart, opEnd);

export const obliterateRange: TestOperation = (
	client: TestClient,
	opStart: number,
	opEnd: number,
) => client.obliterateRangeLocal(opStart, opEnd);

export const annotateRange: TestOperation = (client: TestClient, opStart: number, opEnd: number) =>
	client.annotateRangeLocal(opStart, opEnd, { client: client.longClientId });

export const insertAtRefPos: TestOperation = (
	client: TestClient,
	opStart: number,
	opEnd: number,
	random: IRandom,
) => {
	const segs: ISegment[] = [];
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
		const lref = client.createLocalReferencePosition(
			seg,
			toRemovalInfo(seg) ? 0 : random.integer(0, seg.cachedLength - 1),
			toRemovalInfo(seg)
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

export interface IConfigRange {
	min: number;
	max: number;
	growthFunc?: (input: number) => number;
}

export function doOverRange(
	range: IConfigRange,
	defaultGrowthFunc: (input: number) => number,
	doAction: (current: number) => void,
) {
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
	return Object.entries(ranges)
		.filter(([_, value]) => isConfigRange(value))
		.map(([key, value]) => [key, resolveRange(value, defaultGrowthFunc)] as const)
		.reduce((prev, [key, resolvedRange]) => {
			prev[key] = resolvedRange;
			return prev;
		}, {}) as ResolvedRanges<T>;
}

function isConfigRange(t: any): t is IConfigRange {
	return typeof t === "object" && typeof t.min === "number" && typeof t.max === "number";
}

type ReplaceRangeWith<T, TReplace> = T extends { min: number; max: number } ? TReplace : never;

type RangePropertyNames<T> = { [K in keyof T]-?: T[K] extends IConfigRange ? K : never }[keyof T];

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
) {
	const rangeEntries: [string, IConfigRange][] = Object.entries(ranges).filter(([_, value]) =>
		isConfigRange(value),
	);

	const doOverRangesHelper = (selections: [string, number][]) => {
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
	growthFunc(input: number): number;
	resultsFilePostfix?: string;
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
) {
	let seq = startingSeq;
	const results: ReplayGroup[] = [];

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
			);
			const msgs = messageData.map((md) => md[0]);
			seq = apply(seq, messageData, clients, logger, random);
			const resultText = logger.validate();
			results.push({
				initialText,
				resultText,
				msgs,
				seq,
			});
			logger.dispose();
		}
	});

	if (config.resultsFilePostfix !== undefined) {
		const resultsFilePath = `${replayResultsPath}/len_${minLength}-clients_${clients.length}-${config.resultsFilePostfix}`;
		fs.writeFileSync(resultsFilePath, JSON.stringify(results, undefined, 4));
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
) {
	const minimumSequenceNumber = startingSeq;
	let tempSeq = startingSeq * -1;
	const messages: [ISequencedDocumentMessage, SegmentGroup | SegmentGroup[]][] = [];

	for (let i = 0; i < opsPerRound; i++) {
		// pick a client greater than 0, client 0 only applies remote ops
		// and is our baseline
		const client = clients[random.integer(1, clients.length - 1)];
		const len = client.getLength();
		const sg = client.peekPendingSegmentGroups();
		let op: IMergeTreeOp | undefined;
		if (len === 0 || len < minLength) {
			const text = client.longClientId!.repeat(random.integer(1, 3));
			op = client.insertTextLocal(random.integer(0, len), text);
		} else {
			let opIndex = random.integer(0, operations.length - 1);
			const start = random.integer(0, len - 1);
			const end = random.integer(start + 1, len);

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
			const message = client.makeOpMessage(op, --tempSeq);
			message.minimumSequenceNumber = minimumSequenceNumber;
			messages.push([
				message,
				client.peekPendingSegmentGroups(
					op.type === MergeTreeDeltaType.GROUP ? op.ops.length : 1,
				)!,
			]);
		}
	}
	return messages;
}

export function generateClientNames(): string[] {
	const clientNames: string[] = [];
	function addClientNames(startChar: string, count: number) {
		const startCode = startChar.charCodeAt(0);
		for (let i = 0; i < count; i++) {
			clientNames.push(String.fromCharCode(startCode + i));
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
) {
	let seq = startingSeq;
	try {
		// log and apply all the ops created in the round
		// eslint-disable-next-line @typescript-eslint/prefer-for-of
		for (let i = 0; i < messageData.length; i++) {
			const [message] = messageData[i];
			message.sequenceNumber = ++seq;
			clients.forEach((c) => c.applyMsg(message));
		}
	} catch (e) {
		throw logger.addLogsToError(e);
	}
	return seq;
}

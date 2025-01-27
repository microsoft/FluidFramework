/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import assert from "node:assert";

import type { IRandom } from "@fluid-private/stochastic-test-utils";

import { walkAllChildSegments } from "../mergeTreeNodeWalk.js";
import type { ISegmentPrivate } from "../mergeTreeNodes.js";
import { ReferenceType } from "../ops.js";
import { toRemovalInfo, toMoveInfo } from "../segmentInfos.js";
import { InteriorSequencePlace, Side } from "../sequencePlace.js";
import { TextSegment } from "../textSegment.js";

import type { TestOperation } from "./mergeTreeOperationRunner.js";
import type { TestClient } from "./testClient.js";

export const posInField = (
	client: TestClient,
	pos: number,
): { startPos: number; endPos: number } | undefined => {
	if (
		pos >= client.getLength() ||
		(!Number.isInteger(Number(client.getText(pos, pos + 1))) &&
			client.getText(pos, pos + 1) !== "{" &&
			client.getText(pos, pos + 1) !== "}")
	) {
		return undefined;
	}

	let startPos = pos;
	let endPos = pos;
	// To find the start and end separators, walk backwards and forwards until the desired character is found.
	while (
		startPos > 0 &&
		client.getText(startPos, startPos + 1) !== "{" &&
		(client.getText(startPos, startPos + 1) === "}" ||
			Number.isInteger(Number(client.getText(startPos, startPos + 1))))
	) {
		startPos--;
	}

	while (
		endPos < client.getLength() &&
		client.getText(endPos, endPos + 1) !== "}" &&
		(client.getText(endPos, endPos + 1) === "{" ||
			Number.isInteger(Number(client.getText(endPos, endPos + 1))))
	) {
		endPos++;
	}

	return { startPos, endPos };
};

export const getFieldEndpoints = (
	client: TestClient,
	start: number,
	end: number,
): { startPos: number; endPos: number } | undefined => {
	const startField = posInField(client, start);
	const endField = posInField(client, end);

	if (startField === undefined && endField === undefined) {
		return undefined;
	}
	return startField ?? endField;
};

export const insertField: TestOperation = (
	client: TestClient,
	opStart: number,
	opEnd: number,
	random: IRandom,
) => {
	const chunkLength = random.integer(1, 10);
	const numberText: string = (client.longClientId!.codePointAt(0)! % 10)
		.toString()
		.repeat(chunkLength);
	if (posInField(client, opStart) === undefined) {
		return client.insertTextLocal(opStart, `{${numberText}}`);
	}
};

export const obliterateField: TestOperation = (
	client: TestClient,
	opStart: number,
	opEnd: number,
	random: IRandom,
) => {
	const fieldEndpoints = getFieldEndpoints(client, opStart, opEnd);

	let endISP: InteriorSequencePlace | undefined;
	if (fieldEndpoints !== undefined) {
		const { startPos, endPos } = fieldEndpoints;
		if (endPos >= client.getLength()) {
			endISP = { pos: client.getLength() - 1, side: Side.After };
		}
		// Obliterate text bewteen the separators, but avoid the case where the obliterate range is zero length.
		if (endPos - startPos > 1) {
			const op = client.obliterateRangeLocal(
				{ pos: startPos + 1, side: Side.Before },
				endISP ?? { pos: endPos - 1, side: Side.After },
			);
			insertField(client, startPos + 1, endPos, random);
			return op;
		}
	}
	if (opEnd >= client.getLength()) {
		endISP = { pos: client.getLength() - 1, side: Side.After };
	}
	return client.obliterateRangeLocal(
		{ pos: opStart, side: Side.Before },
		endISP ?? { pos: opEnd, side: Side.After },
	);
};

export const insertAvoidField: TestOperation = (
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
		const randomOffset = random.integer(0, seg.cachedLength - 1);
		const initialPos = client.getPosition(seg) + randomOffset;
		const endpoints = posInField(client, initialPos);

		let offset = randomOffset;
		if (endpoints !== undefined) {
			const startSeg = client.getContainingSegment(endpoints.startPos);
			assert(startSeg.offset !== undefined, "offset should be defined");
			offset = startSeg.offset;
		}

		const lref = client.createLocalReferencePosition(
			seg,
			movedOrRemoved ? 0 : offset,
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

export const removeWithField: TestOperation = (
	client: TestClient,
	opStart: number,
	opEnd: number,
) => {
	const fieldEndpoints = getFieldEndpoints(client, opStart, opEnd);
	if (fieldEndpoints === undefined) {
		return client.removeRangeLocal(opStart, opEnd);
	} else {
		const { startPos, endPos } = fieldEndpoints;
		return client.removeRangeLocal(startPos, endPos + 1);
	}
};

export const annotateWithField: TestOperation = (
	client: TestClient,
	opStart: number,
	opEnd: number,
	random: IRandom,
) => {
	let start: number | undefined;
	let end: number | undefined;
	const fieldEndpoints = getFieldEndpoints(client, opStart, opEnd);
	if (fieldEndpoints !== undefined) {
		start = fieldEndpoints.startPos;
		end = fieldEndpoints.endPos + 1;
	}

	if (random.bool()) {
		return client.annotateRangeLocal(start ?? opStart, end ?? opEnd, {
			[random.integer(1, 5)]: client.longClientId,
		});
	} else {
		const max = random.pick([undefined, random.integer(-10, 100)]);
		const min = random.pick([undefined, random.integer(-100, 10)]);
		return client.annotateAdjustRangeLocal(start ?? opStart, end ?? opEnd, {
			[random.integer(0, 2).toString()]: {
				delta: random.integer(-5, 5),
				min: (min ?? max ?? 0) > (max ?? 0) ? undefined : min,
				max,
			},
		});
	}
};

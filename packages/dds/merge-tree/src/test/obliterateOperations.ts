/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import type { IRandom } from "@fluid-private/stochastic-test-utils";

import { InteriorSequencePlace, Side } from "../sequencePlace.js";

import { annotateRange, type TestOperation } from "./mergeTreeOperationRunner.js";
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
	let start = opStart;
	const endpoints = posInField(client, opStart);
	if (endpoints !== undefined) {
		start = endpoints.startPos;
	}
	return client.insertTextLocal(start, client.longClientId!.repeat(random.integer(1, 3)));
};

export const removeWithField: TestOperation = (
	client: TestClient,
	opStart: number,
	opEnd: number,
) => {
	let start = opStart;
	let end = opEnd;
	const fieldEndpoints = getFieldEndpoints(client, opStart, opEnd);
	if (fieldEndpoints !== undefined) {
		start = fieldEndpoints.startPos;
		end = fieldEndpoints.endPos + 1;
	}
	return client.removeRangeLocal(start, end);
};

export const annotateWithField: TestOperation = (
	client: TestClient,
	opStart: number,
	opEnd: number,
	random: IRandom,
) => {
	let start = opStart;
	let end = opEnd;
	const fieldEndpoints = getFieldEndpoints(client, opStart, opEnd);
	if (fieldEndpoints !== undefined) {
		start = fieldEndpoints.startPos;
		end = fieldEndpoints.endPos + 1;
	}
	return annotateRange(client, start, end, random);
};

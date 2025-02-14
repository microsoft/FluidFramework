/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "node:assert";

import type { IRandom } from "@fluid-private/stochastic-test-utils";

// import { createGroupOp } from "../opBuilder.js";
import type { IMergeTreeInsertMsg, IMergeTreeOp } from "../ops.js";
import { InteriorSequencePlace, Side } from "../sequencePlace.js";

import { annotateRange, removeRange, type TestOperation } from "./mergeTreeOperationRunner.js";
import type { TestClient } from "./testClient.js";

const posInField = (
	client: TestClient,
	pos: number,
): { startPos: number; endPos: number } | undefined => {
	const isFieldCharacter = (char: string) =>
		Number.isInteger(Number(char)) || char === "{" || char === "}";
	if (pos >= client.getLength() || !isFieldCharacter(client.getText(pos, pos + 1))) {
		// pos is not within a field.
		return undefined;
	}

	let startPos = pos;
	let endPos = pos;
	// To find the start and end separators, walk backwards and forwards until the desired character is found.
	while (startPos > 0 && client.getText(startPos, startPos + 1) !== "{") {
		const text = client.getText(endPos, endPos + 1);
		assert(
			Number.isInteger(Number(text)) || text === "}",
			"Non-integer character found within a field",
		);
		startPos--;
	}

	while (endPos < client.getLength() && client.getText(endPos, endPos + 1) !== "}") {
		const text = client.getText(endPos, endPos + 1);
		if (!(Number.isInteger(Number(text)) || text === "{")) {
			throw new Error("uh oh");
		}
		assert(
			Number.isInteger(Number(text)) || text === "{",
			"Non-integer character found within a field",
		);
		endPos++;
	}

	assert(client.getText(startPos, startPos + 1) === "{", "Start separator not found");
	assert(
		endPos < client.getLength() && client.getText(endPos, endPos + 1) === "}",
		"End separator not found",
	);

	return { startPos, endPos };
};

const getFieldEndpoints = (
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

const generateFieldText = (client: TestClient, random: IRandom): string => {
	const chunkLength = random.integer(1, 10);
	return (client.longClientId!.codePointAt(0)! % 10).toString().repeat(chunkLength);
};

const insertFieldText = (
	client: TestClient,
	opStart: number,
	random: IRandom,
): IMergeTreeInsertMsg | undefined => {
	const text = generateFieldText(client, random);
	return client.insertTextLocal(opStart, text);
};

export const insertField: TestOperation = (
	client: TestClient,
	opStart: number,
	opEnd: number,
	random: IRandom,
) => {
	const numberText = generateFieldText(client, random);
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
	const fieldEndpoints = getFieldEndpoints(
		client,
		opStart,
		// the operation runner generates endpoints with client length, but this model only supports up to client length - 1.
		Math.min(opEnd, client.getLength() - 1),
	);

	let endISP: InteriorSequencePlace | undefined;
	if (fieldEndpoints !== undefined) {
		const { startPos, endPos } = fieldEndpoints;
		// Obliterate text between the separators, but avoid the case where the obliterate range is zero length.
		if (endPos - startPos > 1) {
			const obliterateOp = client.obliterateRangeLocal(
				{ pos: startPos, side: Side.After },
				{ pos: endPos, side: Side.Before },
			);
			const insertOp = insertFieldText(client, startPos + 1, random);
			assert(insertOp !== undefined, "Insert op should not be undefined");
			// TODO: AB#31001: We should be able to sometimes use group ops here rather than submit two separate ops,
			// but this causes failures which likely indicate there are bugs with the insersection of obliterate and grouped batching.
			// const op = createGroupOp(obliterateOp, insertOp);
			return [obliterateOp, insertOp];
		} else {
			return;
		}
	}
	if (opEnd >= client.getLength()) {
		endISP = { pos: client.getLength() - 1, side: Side.After };
	}
	if (!client.getText(opStart, opEnd).includes("{")) {
		// Avoid issuing obliterates that might contain multiple fields.
		// Otherwise we may end up with field characters that look like they're outside of the field,
		// since one of these obliterates can wipe out the field including the `{}` delimiters, but
		// a "field replace" obliterate + insert can win and insert the numerical characters.
		return client.obliterateRangeLocal(
			{ pos: opStart, side: Side.Before },
			endISP ?? { pos: opEnd, side: Side.After },
		);
	}
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
	random: IRandom,
) => {
	let start = opStart;
	let end = opEnd;
	const fieldEndpoints = getFieldEndpoints(client, opStart, opEnd);
	if (fieldEndpoints !== undefined) {
		start = fieldEndpoints.startPos;
		end = fieldEndpoints.endPos + 1;
	}
	return removeRange(client, start, end, random);
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

export const generateInsertWithField = (
	client: TestClient,
	random: IRandom,
): IMergeTreeOp | undefined => {
	const text = client.longClientId!.repeat(random.integer(1, 3));
	let pos = random.integer(0, client.getLength());
	const endpoints = posInField(client, pos);
	if (endpoints !== undefined) {
		pos = 0;
	}
	return client.insertTextLocal(pos, text);
};

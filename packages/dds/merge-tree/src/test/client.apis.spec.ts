/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable guard-for-in, no-restricted-syntax */

import { strict as assert } from "assert";
import { Client } from "../client.js";
import { createMap, matchProperties, PropertySet } from "../properties.js";
import { TestClient } from "./testClient.js";

function checkGetPropertiesAtPos(
	client: Client,
	pos: number,
	props?: PropertySet,
	verbose = false,
) {
	const propsRetrieved = client.getPropertiesAtPosition(pos);
	const result = matchProperties(props, propsRetrieved);
	if (!result && verbose) {
		console.log(`At pos: ${pos}`);
		console.log("Expected props");
		for (const key in props) {
			console.log(`Key: ${key} Value: ${props[key]}`);
		}

		console.log("Actual props");
		for (const key1 in propsRetrieved) {
			console.log(`Key: ${key1} Value: ${propsRetrieved[key1]}`);
		}
	}
	return result;
}

export function clientGetPropertiesAtPositionTest() {
	const client = new TestClient();
	client.insertTextLocal(0, "the cat is on the mat");
	const props = createMap<any>();
	props.prop1 = 10;
	client.insertTextLocal(4, "fuzzy, fuzzy ", props);

	const testResult1 = checkGetPropertiesAtPos(client, 4, props, true);
	const testResult2 = checkGetPropertiesAtPos(client, 16, props, true);
	const testResult3 = checkGetPropertiesAtPos(client, 3);
	const testResult4 = checkGetPropertiesAtPos(client, 17);

	return (((testResult1 === testResult2) === testResult3) === testResult4) === true;
}

function checkGetSegmentExtentsOfPos(
	client: Client,
	pos: number,
	posStart: number,
	posAfterEnd: number,
	verbose = false,
) {
	const segExtents = client.getRangeExtentsOfPosition(pos);
	const result = segExtents.posStart === posStart && segExtents.posAfterEnd === posAfterEnd;
	if (!result && verbose) {
		console.log(`At pos: ${pos}`);
		console.log(`Expected extents -> start: ${posStart} end: ${posAfterEnd}`);
		console.log(
			`Actual extents -> start: ${segExtents.posStart} end: ${segExtents.posAfterEnd}`,
		);
	}
	return result;
}

export function clientGetSegmentExtentsOfPositionTest() {
	const client = new TestClient();
	client.insertTextLocal(0, "the cat is on the mat");
	const props = createMap<any>();
	props.prop1 = 10;
	client.insertTextLocal(4, "fuzzy, fuzzy ", props);
	client.insertTextLocal(8, "more fuzzy text", {});

	const testResult1 = checkGetSegmentExtentsOfPos(client, 26, 23, 32);
	const testResult2 = checkGetSegmentExtentsOfPos(client, 6, 4, 8);
	const testResult3 = checkGetSegmentExtentsOfPos(client, 32, 32, 49);
	return ((testResult1 === testResult2) === testResult3) === true;
}

describe("client.apis", () => {
	it("clientGetPropertiesAtPositionTest", () => {
		assert(clientGetPropertiesAtPositionTest() === true);
	});

	it("clientGetSegmentExtentsOfPositionTest", () => {
		assert(clientGetSegmentExtentsOfPositionTest() === true);
	});
});

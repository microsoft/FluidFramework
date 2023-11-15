/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import path from "path";
import { makeRandom } from "@fluid-private/stochastic-test-utils";
import { Trace } from "@fluid-internal/client-utils";
import { ReferenceType } from "../ops";
import { createMap, extend, MapLike } from "../properties";
import { ReferencePosition } from "../referencePositions";
import { TestClient } from "./testClient";
import { loadTextFromFileWithMarkers } from "./testUtils";

const clock = () => Trace.start();

function elapsedMicroseconds(trace: Trace) {
	return trace.trace().duration * 1000;
}

export function propertyCopy() {
	const propCount = 2000;
	const iterCount = 1000;
	const map = new Map<string, number>();
	const a: string[] = [];
	const v: number[] = [];
	for (let i = 0; i < propCount; i++) {
		a[i] = `prop${i}`;
		v[i] = i;
		map.set(a[i], v[i]);
	}
	let clockStart = clock();
	let obj: MapLike<number> = {};
	for (let j = 0; j < iterCount; j++) {
		obj = createMap<number>();
		for (let i = 0; i < propCount; i++) {
			obj[a[i]] = v[i];
		}
	}
	let et = elapsedMicroseconds(clockStart);
	let perIter = (et / iterCount).toFixed(3);
	let perProp = (et / (iterCount * propCount)).toFixed(3);
	console.log(
		`arr prop init time ${perIter} us per ${propCount} properties; ${perProp} us per property`,
	);
	clockStart = clock();
	for (let j = 0; j < iterCount; j++) {
		const bObj = createMap<number>();
		// eslint-disable-next-line guard-for-in, no-restricted-syntax
		for (const key in obj) {
			bObj[key] = obj[key];
		}
	}
	et = elapsedMicroseconds(clockStart);
	perIter = (et / iterCount).toFixed(3);
	perProp = (et / (iterCount * propCount)).toFixed(3);
	console.log(
		`obj prop init time ${perIter} us per ${propCount} properties; ${perProp} us per property`,
	);
	clockStart = clock();
	for (let j = 0; j < iterCount; j++) {
		const bObj = createMap<number>();
		for (const [key, value] of map) {
			bObj[key] = value;
		}
	}
	et = elapsedMicroseconds(clockStart);
	perIter = (et / iterCount).toFixed(3);
	perProp = (et / (iterCount * propCount)).toFixed(2);
	console.log(
		`map prop init time ${perIter} us per ${propCount} properties; ${perProp} us per property`,
	);
	clockStart = clock();
	for (let j = 0; j < iterCount; j++) {
		const bObj = createMap<number>();
		map.forEach((value, key) => {
			bObj[key] = value;
		});
	}
	et = elapsedMicroseconds(clockStart);
	perIter = (et / iterCount).toFixed(3);
	perProp = (et / (iterCount * propCount)).toFixed(2);
	console.log(
		`map foreach prop init time ${perIter} us per ${propCount} properties; ${perProp} us per property`,
	);
	clockStart = clock();
	for (let j = 0; j < iterCount; j++) {
		const bmap = new Map<string, number>();
		map.forEach((value, key) => {
			bmap.set(key, value);
		});
	}
	et = elapsedMicroseconds(clockStart);
	perIter = (et / iterCount).toFixed(3);
	perProp = (et / (iterCount * propCount)).toFixed(2);
	console.log(
		`map to map foreach prop init time ${perIter} us per ${propCount} properties; ${perProp} us per property`,
	);
	const diffMap = new Map<string, number>();
	map.forEach((value, key) => {
		if (Math.random() < 0.5) {
			diffMap.set(key, value);
		} else {
			diffMap.set(key, value * 3);
		}
	});
	clockStart = clock();
	const grayMap = new Map<string, number>();
	for (let j = 0; j < iterCount; j++) {
		map.forEach((value, key) => {
			if (diffMap.get(key) !== value) {
				grayMap.set(key, 1);
			}
		});
	}
	perIter = (et / iterCount).toFixed(3);
	perProp = (et / (iterCount * propCount)).toFixed(2);
	console.log(`diff time ${perIter} us per ${propCount} properties; ${perProp} us per property`);
}

function makeBookmarks(client: TestClient, bookmarkCount: number) {
	const random = makeRandom(0xdeadbeef, 0xfeedbed);
	const bookmarks: ReferencePosition[] = [];
	const len = client.getLength();
	for (let i = 0; i < bookmarkCount; i++) {
		const pos = random.integer(0, len - 1);
		const segoff = client.getContainingSegment(pos);
		let refType = ReferenceType.Simple;
		if (i & 1) {
			refType = ReferenceType.SlideOnRemove;
		}
		const lref = client.mergeTree.createLocalReferencePosition(
			segoff.segment!,
			segoff.offset!,
			refType,
			undefined,
		);
		bookmarks.push(lref);
	}
	return bookmarks;
}

function measureFetch(startFile: string, withBookmarks = false) {
	const bookmarkCount = 20000;
	const client = new TestClient();
	loadTextFromFileWithMarkers(startFile, client.mergeTree);
	if (withBookmarks) {
		makeBookmarks(client, bookmarkCount);
		console.log(`inserting ${bookmarkCount} refs into text`);
	}
	const reps = 20;
	const clockStart = clock();
	let count = 0;
	for (let i = 0; i < reps; i++) {
		for (let pos = 0; pos < client.getLength(); ) {
			// curPG.pos is ca end
			const curPG = client.findTile(pos, "pg", false)!;
			const properties = curPG.tile.properties!;
			const curSegOff = client.getContainingSegment(pos)!;
			const curSeg = curSegOff.segment!;
			// Combine paragraph and direct properties
			extend(properties, curSeg.properties);
			pos += curSeg.cachedLength - curSegOff.offset!;
			count++;
		}
	}
	const et = elapsedMicroseconds(clockStart);
	console.log(
		`fetch of ${count / reps} runs over ${client.getLength()} total chars took ${(
			et / count
		).toFixed(1)} microseconds per run`,
	);
}

const baseDir = "../../src/test/literature";
const filename = path.join(__dirname, baseDir, "pp.txt");
const testTimeout = 30000;

describe("Routerlicious", () => {
	describe("merge-tree", () => {
		it("wordUnitTest", () => {
			propertyCopy();
			measureFetch(filename);
			measureFetch(filename, true);
			measureFetch(filename);
			measureFetch(filename, true);
		}).timeout(testTimeout);
	});
});

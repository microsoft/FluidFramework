/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/consistent-type-assertions, no-bitwise */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-base-to-string */

import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";

import { Trace } from "@fluid-internal/client-utils";
import { IRandom, makeRandom } from "@fluid-private/stochastic-test-utils";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";
import JsDiff from "diff";

import { MergeTreeTextHelper } from "../MergeTreeTextHelper.js";
import {
	KeyComparer,
	Property,
	PropertyAction,
	RedBlackTree,
	SortedDictionary,
} from "../collections/index.js";
import {
	LocalClientId,
	UnassignedSequenceNumber,
	UniversalSequenceNumber,
} from "../constants.js";
import { MergeTree } from "../mergeTree.js";
import { IMergeTreeDeltaOpArgs } from "../mergeTreeDeltaCallback.js";
import {
	IJSONMarkerSegment,
	IMergeNode,
	compareNumbers,
	compareStrings,
	reservedMarkerIdKey,
	type ISegmentLeaf,
} from "../mergeTreeNodes.js";
import { createRemoveRangeOp } from "../opBuilder.js";
import { IMergeTreeOp, MergeTreeDeltaType, ReferenceType } from "../ops.js";
import { reservedRangeLabelsKey, reservedTileLabelsKey } from "../referencePositions.js";
import { JsonSegmentSpecs } from "../snapshotChunks.js";
import { SnapshotLegacy } from "../snapshotlegacy.js";
import { IJSONTextSegment, TextSegment } from "../textSegment.js";

import { _dirname } from "./dirname.cjs";
import { TestClient, getStats, specToSegment } from "./testClient.js";
import { TestServer } from "./testServer.js";
import { insertText, loadTextFromFile, nodeOrdinalsHaveIntegrity } from "./testUtils.js";

function LinearDictionary<TKey, TData>(
	compareKeys: KeyComparer<TKey>,
): SortedDictionary<TKey, TData> {
	const props: Property<TKey, TData>[] = [];
	const compareProps = (a: Property<TKey, TData>, b: Property<TKey, TData>): number =>
		compareKeys(a.key, b.key);
	function mapRange<TAccum>(
		action: PropertyAction<TKey, TData>,
		accum?: TAccum,
		start?: TKey,
		end?: TKey,
	): void {
		let _start = start;
		let _end = end;

		if (props.length > 0) {
			return;
		}

		if (_start === undefined) {
			_start = min()!.key;
		}
		if (_end === undefined) {
			_end = max()!.key;
		}
		for (let i = 0, len = props.length; i < len; i++) {
			if (compareKeys(_start, props[i].key) <= 0) {
				const ecmp = compareKeys(_end, props[i].key);
				if (ecmp < 0) {
					break;
				}
				if (!action(props[i], accum)) {
					break;
				}
			}
		}
	}

	function map<TAccum>(action: PropertyAction<TKey, TData>, accum?: TAccum): void {
		mapRange(action, accum);
	}

	function min(): Property<TKey, TData> | undefined {
		if (props.length > 0) {
			return props[0];
		}
	}
	function max(): Property<TKey, TData> | undefined {
		if (props.length > 0) {
			return props[props.length - 1];
		}
	}

	function get(key: TKey): Property<TKey, TData> | undefined {
		for (let i = 0, len = props.length; i < len; i++) {
			if (props[i].key === key) {
				return props[i];
			}
		}
	}

	function put(key: TKey, data: TData): void {
		if (key !== undefined) {
			if (data === undefined) {
				remove(key);
			} else {
				props.push({ key, data });
				props.sort(compareProps); // Go to insertion sort if too slow
			}
		}
	}
	function remove(key: TKey): void {
		if (key !== undefined) {
			for (let i = 0, len = props.length; i < len; i++) {
				if (props[i].key === key) {
					props[i] = props[len - 1];
					props.length--;
					props.sort(compareProps);
					break;
				}
			}
		}
	}
	return {
		min,
		max,
		map,
		mapRange,
		remove,
		get,
		put,
	};
}

let logLines: string[];
function log(message: string | number): void {
	if (logLines) {
		logLines.push(message.toString());
	}
}

function printStringProperty(p?: Property<string, string>): boolean {
	log(`[${p?.key}, ${p?.data}]`);
	return true;
}

function printStringNumProperty(p: Property<string, number>): boolean {
	log(`[${p.key}, ${p.data}]`);
	return true;
}

export function simpleTest(): void {
	const a = ["Aardvark", "cute", "Baboon", "big", "Chameleon", "colorful", "Dingo", "wild"];

	const beast = new RedBlackTree<string, string>(compareStrings);
	for (let i = 0; i < a.length; i += 2) {
		beast.put(a[i], a[i + 1]);
	}
	beast.map((element) => printStringProperty(element));
	log("Map B D");
	log("Map Aardvark Dingo");
	log("Map Baboon Chameleon");
	printStringProperty(beast.get("Chameleon"));
}

const clock = (): Trace => Trace.start();

function took(desc: string, trace: Trace): number {
	const duration = trace.trace().duration;
	log(`${desc} took ${duration} ms`);
	return duration;
}

function elapsedMicroseconds(trace: Trace): number {
	return trace.trace().duration * 1000;
}

export function integerTest1(): number {
	const random = makeRandom(0xdeadbeef, 0xfeedbed);
	const imin = 0;
	const imax = 10000000;
	const intCount = 1100000;
	const beast = new RedBlackTree<number, number>(compareNumbers);

	const randInt = (): number => random.integer(imin, imax);
	const pos: number[] = Array.from({ length: intCount });
	let i = 0;
	let redo = false;
	function onConflict(key: number, currentKey: number): { data: number } {
		redo = true;
		return { data: currentKey };
	}
	let conflictCount = 0;
	let start = clock();
	while (i < intCount) {
		pos[i] = randInt();
		beast.put(pos[i], i, onConflict);
		if (redo) {
			conflictCount++;
			redo = false;
		} else {
			i++;
		}
	}
	took("test gen", start);
	const errorCount = 0;
	start = clock();
	for (let j = 0, len = pos.length; j < len; j++) {
		const cp = pos[j];
		/* let prop = */ beast.get(cp);
	}
	const getdur = took("get all keys", start);
	log(`cost per get is ${((1000 * getdur) / intCount).toFixed(3)} us`);
	log(`duplicates ${conflictCount}, errors ${errorCount}`);
	return errorCount;
}

export function fileTest1(): void {
	const content = fs.readFileSync(
		path.join(_dirname, "../../../public/literature/shakespeare.txt"),
		"utf8",
	);
	const a = content.split("\n");
	const iterCount = a.length >> 2;
	const removeCount = 10;
	log(`len: ${a.length}`);

	for (let k = 0; k < iterCount; k++) {
		const beast = new RedBlackTree<string, number>(compareStrings);
		const linearBeast = LinearDictionary<string, number>(compareStrings);
		for (let i = 0, len = a.length; i < len; i++) {
			a[i] = a[i].trim();
			if (a[i].length > 0) {
				beast.put(a[i], i);
				linearBeast.put(a[i], i);
			}
		}
		if (k === 0) {
			beast.map((element) => printStringNumProperty(element));
			log("BTREE...");
		}
		const removedAnimals: string[] = [];
		for (let j = 0; j < removeCount; j++) {
			const removeIndex = Math.floor(Math.random() * a.length);
			log(`Removing: ${a[removeIndex]} at ${removeIndex}`);
			beast.remove(a[removeIndex]);
			linearBeast.remove(a[removeIndex]);
			removedAnimals.push(a[removeIndex]);
		}
		for (const animal of a) {
			if (animal.length > 0 && !removedAnimals.includes(animal)) {
				const prop = beast.get(animal);
				const linProp = linearBeast.get(animal);
				// log(`Trying key ${animal}`);
				if (prop) {
					// printStringNumProperty(prop);
					if (
						linProp === undefined ||
						prop.key !== linProp.key ||
						prop.data !== linProp.data
					) {
						log(`Linear BST does not match RB BST at key ${animal}`);
					}
				} else {
					log(`hmm...bad key: ${animal}`);
				}
			}
		}
	}
}

function printTextSegment(textSegment: ISegmentLeaf, pos: number): boolean {
	log(textSegment.toString());
	log(`at [${pos}, ${pos + textSegment.cachedLength})`);
	return true;
}

export function makeTextSegment(text: string): IMergeNode {
	return new TextSegment(text);
}

function makeCollabTextSegment(text: string): TextSegment {
	return new TextSegment(text);
}

function editFlat(source: string, s: number, dl: number, nt = ""): string {
	return source.slice(0, Math.max(0, s)) + nt + source.slice(s + dl, source.length);
}

let accumTime = 0;

function checkInsertMergeTree(
	mergeTree: MergeTree,
	pos: number,
	textSegment: TextSegment,
	verbose = false,
): boolean {
	let checkText = new MergeTreeTextHelper(mergeTree).getText(
		UniversalSequenceNumber,
		LocalClientId,
	);
	checkText = editFlat(checkText, pos, 0, textSegment.text);
	const clockStart = clock();
	insertText({
		mergeTree,
		pos,
		refSeq: UniversalSequenceNumber,
		clientId: LocalClientId,
		seq: UniversalSequenceNumber,
		text: textSegment.text,
		props: undefined,
		opArgs: undefined,
	});
	accumTime += elapsedMicroseconds(clockStart);
	const updatedText = new MergeTreeTextHelper(mergeTree).getText(
		UniversalSequenceNumber,
		LocalClientId,
	);
	const result = checkText === updatedText;
	if (!result && verbose) {
		log(`mismatch(o): ${checkText}`);
		log(`mismatch(u): ${updatedText}`);
	}
	return result;
}

function checkMarkRemoveMergeTree(
	mergeTree: MergeTree,
	start: number,
	end: number,
	verbose = false,
): boolean {
	const helper = new MergeTreeTextHelper(mergeTree);
	const origText = helper.getText(UniversalSequenceNumber, LocalClientId);
	const checkText = editFlat(origText, start, end - start);
	const clockStart = clock();
	mergeTree.markRangeRemoved(
		start,
		end,
		UniversalSequenceNumber,
		LocalClientId,
		UniversalSequenceNumber,
		{ op: createRemoveRangeOp(start, end) },
	);
	accumTime += elapsedMicroseconds(clockStart);
	const updatedText = helper.getText(UniversalSequenceNumber, LocalClientId);
	const result = checkText === updatedText;
	if (!result && verbose) {
		log(`mismatch(o): ${origText}`);
		log(`mismatch(c): ${checkText}`);
		log(`mismatch(u): ${updatedText}`);
	}
	return result;
}

export function mergeTreeTest1(): void {
	const mergeTree = new MergeTree();
	mergeTree.insertSegments(
		0,
		[TextSegment.make("the cat is on the mat")],
		UniversalSequenceNumber,
		LocalClientId,
		UniversalSequenceNumber,
		undefined,
	);
	mergeTree.mapRange(printTextSegment, UniversalSequenceNumber, LocalClientId, undefined);
	let fuzzySeg = makeCollabTextSegment("fuzzy, fuzzy ");
	checkInsertMergeTree(mergeTree, 4, fuzzySeg);
	fuzzySeg = makeCollabTextSegment("fuzzy, fuzzy ");
	checkInsertMergeTree(mergeTree, 4, fuzzySeg);
	checkMarkRemoveMergeTree(mergeTree, 4, 13);
	// checkRemoveSegTree(segTree, 4, 13);
	checkInsertMergeTree(mergeTree, 4, makeCollabTextSegment("fi"));
	mergeTree.mapRange(printTextSegment, UniversalSequenceNumber, LocalClientId, undefined);
	const segoff = mergeTree.getContainingSegment<ISegmentLeaf>(
		4,
		UniversalSequenceNumber,
		LocalClientId,
	);
	log(mergeTree.getPosition(segoff.segment!, UniversalSequenceNumber, LocalClientId));
	log(new MergeTreeTextHelper(mergeTree).getText(UniversalSequenceNumber, LocalClientId));
	log(mergeTree.toString());
	TestPack().firstTest();
}

export function mergeTreeLargeTest(): void {
	const mergeTree = new MergeTree();
	mergeTree.insertSegments(
		0,
		[TextSegment.make("the cat is on the mat")],
		UniversalSequenceNumber,
		LocalClientId,
		UniversalSequenceNumber,
		undefined,
	);
	const insertCount = 1000000;
	const removeCount = 980000;
	const random = makeRandom(0xdeadbeef, 0xfeedbed);
	const imin = 1;
	const imax = 9;
	const randInt = (): number => random.integer(imin, imax);
	function randomString(len: number, c: string): string {
		let str = "";
		for (let i = 0; i < len; i++) {
			str += c;
		}
		return str;
	}
	accumTime = 0;
	let accumTreeSize = 0;
	let treeCount = 0;
	for (let i = 0; i < insertCount; i++) {
		const slen = randInt();
		const s = randomString(slen, String.fromCodePoint(48 + slen));
		const preLen = mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
		const pos = random.integer(0, preLen);
		const clockStart = clock();
		insertText({
			mergeTree,
			pos,
			refSeq: UniversalSequenceNumber,
			clientId: LocalClientId,
			seq: UniversalSequenceNumber,
			text: s,
			props: undefined,
			opArgs: undefined,
		});
		accumTime += elapsedMicroseconds(clockStart);
		if (i > 0 && 0 === i % 50000) {
			const perIter = (accumTime / (i + 1)).toFixed(3);
			treeCount++;
			accumTreeSize += mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
			const averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
			log(
				`i: ${i} time: ${accumTime}us which is average ${perIter} per insert with average tree size ${averageTreeSize}`,
			);
		}
	}
	log(process.memoryUsage().heapUsed);
	accumTime = 0;
	accumTreeSize = 0;
	treeCount = 0;
	for (let i = 0; i < removeCount; i++) {
		const dlen = randInt();
		const preLen = mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
		const pos = random.integer(0, preLen);
		// Log(itree.toString());
		const clockStart = clock();
		mergeTree.markRangeRemoved(
			pos,
			pos + dlen,
			UniversalSequenceNumber,
			LocalClientId,
			UniversalSequenceNumber,
			undefined as never,
		);
		accumTime += elapsedMicroseconds(clockStart);

		if (i > 0 && 0 === i % 50000) {
			const perIter = (accumTime / (i + 1)).toFixed(3);
			treeCount++;
			accumTreeSize += mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
			const averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
			log(
				`i: ${i} time: ${accumTime}us which is average ${perIter} per del with average tree size ${averageTreeSize}`,
			);
		}
	}
}

export function mergeTreeCheckedTest(): number {
	const mergeTree = new MergeTree();
	mergeTree.insertSegments(
		0,
		[TextSegment.make("the cat is on the mat")],
		UniversalSequenceNumber,
		LocalClientId,
		UniversalSequenceNumber,
		undefined,
	);
	const insertCount = 2000;
	const removeCount = 1400;
	const largeRemoveCount = 20;
	const random = makeRandom(0xdeadbeef, 0xfeedbed);

	const imin = 1;
	const imax = 9;
	const randInt = (): number => random.integer(imin, imax);
	const randLargeInt = (): number => random.integer(10, 1000);
	function randomString(len: number, c: string): string {
		let str = "";
		for (let i = 0; i < len; i++) {
			str += c;
		}
		return str;
	}
	accumTime = 0;
	let accumTreeSize = 0;
	let treeCount = 0;
	let errorCount = 0;
	for (let i = 0; i < insertCount; i++) {
		const slen = randInt();
		const s = randomString(slen, String.fromCodePoint(48 + slen));
		const preLen = mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
		const pos = random.integer(0, preLen);
		if (!checkInsertMergeTree(mergeTree, pos, makeCollabTextSegment(s), true)) {
			log(
				`i: ${i} preLen ${preLen} pos: ${pos} slen: ${slen} s: ${s} itree len: ${mergeTree.getLength(
					UniversalSequenceNumber,
					LocalClientId,
				)}`,
			);
			log(mergeTree.toString());
			errorCount++;
			break;
		}
		if (i > 0 && 0 === i % 1000) {
			const perIter = (accumTime / (i + 1)).toFixed(3);
			treeCount++;
			accumTreeSize += mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
			const averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
			log(
				`i: ${i} time: ${accumTime}us which is average ${perIter} per insert with average tree size ${averageTreeSize}`,
			);
		}
	}
	accumTime = 0;
	accumTreeSize = 0;
	treeCount = 0;
	for (let i = 0; i < largeRemoveCount; i++) {
		const dlen = randLargeInt();
		const preLen = mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
		const pos = random.integer(0, preLen);
		// log(itree.toString());
		if (!checkMarkRemoveMergeTree(mergeTree, pos, pos + dlen, true)) {
			log(
				`i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${mergeTree.getLength(
					UniversalSequenceNumber,
					LocalClientId,
				)}`,
			);
			log(mergeTree.toString());
			break;
		}
		if (i > 0 && 0 === i % 10) {
			const perIter = (accumTime / (i + 1)).toFixed(3);
			treeCount++;
			accumTreeSize += mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
			const averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
			log(
				`i: ${i} time: ${accumTime}us which is average ${perIter} per large del with average tree size ${averageTreeSize}`,
			);
		}
	}
	accumTime = 0;
	accumTreeSize = 0;
	treeCount = 0;
	for (let i = 0; i < removeCount; i++) {
		const dlen = randInt();
		const preLen = mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
		const pos = random.integer(0, preLen);
		// log(itree.toString());
		if (i & 1) {
			if (!checkMarkRemoveMergeTree(mergeTree, pos, pos + dlen, true)) {
				log(
					`mr i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${mergeTree.getLength(
						UniversalSequenceNumber,
						LocalClientId,
					)}`,
				);
				log(mergeTree.toString());
				errorCount++;
				break;
			}
		} else {
			if (!checkMarkRemoveMergeTree(mergeTree, pos, pos + dlen, true)) {
				log(
					`i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${mergeTree.getLength(
						UniversalSequenceNumber,
						LocalClientId,
					)}`,
				);
				log(mergeTree.toString());
				errorCount++;
				break;
			}
		}
		if (i > 0 && 0 === i % 1000) {
			const perIter = (accumTime / (i + 1)).toFixed(3);
			treeCount++;
			accumTreeSize += mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
			const averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
			log(
				`i: ${i} time: ${accumTime}us which is average ${perIter} per del with average tree size ${averageTreeSize}`,
			);
		}
	}
	accumTime = 0;
	accumTreeSize = 0;
	treeCount = 0;
	for (let i = 0; i < insertCount; i++) {
		const slen = randInt();
		const s = randomString(slen, String.fromCodePoint(48 + slen));
		const preLen = mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
		const pos = random.integer(0, preLen);
		if (!checkInsertMergeTree(mergeTree, pos, makeCollabTextSegment(s), true)) {
			log(
				`i: ${i} preLen ${preLen} pos: ${pos} slen: ${slen} s: ${s} itree len: ${mergeTree.getLength(
					UniversalSequenceNumber,
					LocalClientId,
				)}`,
			);
			log(mergeTree.toString());
			errorCount++;
			break;
		}
		if (i > 0 && 0 === i % 1000) {
			const perIter = (accumTime / (i + 1)).toFixed(3);
			treeCount++;
			accumTreeSize += mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
			const averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
			log(
				`i: ${i} time: ${accumTime}us which is average ${perIter} per insert with average tree size ${averageTreeSize}`,
			);
		}
	}
	accumTime = 0;
	accumTreeSize = 0;
	treeCount = 0;
	for (let i = 0; i < removeCount; i++) {
		const dlen = randInt();
		const preLen = mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
		const pos = random.integer(0, preLen);
		// log(itree.toString());
		if (i & 1) {
			if (!checkMarkRemoveMergeTree(mergeTree, pos, pos + dlen, true)) {
				log(
					`i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${mergeTree.getLength(
						UniversalSequenceNumber,
						LocalClientId,
					)}`,
				);
				log(mergeTree.toString());
				errorCount++;
				break;
			}
		} else {
			if (!checkMarkRemoveMergeTree(mergeTree, pos, pos + dlen, true)) {
				log(
					`i: ${i} preLen ${preLen} pos: ${pos} dlen: ${dlen} itree len: ${mergeTree.getLength(
						UniversalSequenceNumber,
						LocalClientId,
					)}`,
				);
				log(mergeTree.toString());
				errorCount++;
				break;
			}
		}
		if (i > 0 && 0 === i % 1000) {
			const perIter = (accumTime / (i + 1)).toFixed(3);
			treeCount++;
			accumTreeSize += mergeTree.getLength(UniversalSequenceNumber, LocalClientId);
			const averageTreeSize = (accumTreeSize / treeCount).toFixed(3);
			log(
				`i: ${i} time: ${accumTime}us which is average ${perIter} per del with average tree size ${averageTreeSize}`,
			);
		}
	}
	return errorCount;
}

type SharedStringJSONSegment = IJSONTextSegment & IJSONMarkerSegment;

export function TestPack(verbose = true): {
	firstTest: () => void;
	randolicious: () => number;
	clientServer: (startFile?: string, initRounds?: number) => number;
	manyMergeTrees: () => void;
} {
	const random = makeRandom(0xdeadbeef, 0xfeedbed);
	const minSegCount = 1;
	const maxSegCount = 1000;
	const randSmallSegmentCount = (): number => random.integer(1, 4);
	const randSegmentCount = (): number => random.integer(minSegCount, maxSegCount);
	const randTextLength = (): number => random.integer(1, 5);
	const zedCode = 48;
	function randomString(len: number, c: string): string {
		let str = "";
		for (let i = 0; i < len; i++) {
			str += c;
		}
		return str;
	}

	let getTextTime = 0;
	let getTextCalls = 0;
	const catchUpTime = 0;
	const catchUps = 0;

	function reportTiming(client: TestClient): void {
		if (!verbose) {
			return;
		}
		const aveTime = (client.accumTime / client.accumOps).toFixed(1);
		const stats = getStats(client.mergeTree);
		const windowTime = stats.windowTime!;
		const packTime = stats.packTime;
		const aveWindowTime = ((windowTime || 0) / client.accumOps).toFixed(1);
		const avePackTime = ((packTime ?? 0) / client.accumOps).toFixed(1);
		const aveExtraWindowTime = (client.accumWindowTime / client.accumOps).toFixed(1);
		const aveWindow = (client.accumWindow / client.accumOps).toFixed(1);
		const adjTime = (
			(client.accumTime - (windowTime - client.accumWindowTime)) /
			client.accumOps
		).toFixed(1);
		const aveGetTextTime = (getTextTime / getTextCalls).toFixed(1);
		let aveCatchUpTime = "off";
		if (catchUps > 0) {
			aveCatchUpTime = (catchUpTime / catchUps).toFixed(1);
		}
		log(`get text time: ${aveGetTextTime} catch up ${aveCatchUpTime}`);
		log(
			`accum time ${client.accumTime} us ops: ${client.accumOps} ave time ${aveTime} - wtime ${adjTime} pack ${avePackTime} ave window ${aveWindow}`,
		);
		log(
			`accum window time ${client.accumWindowTime} us ave window time total ${aveWindowTime} not in ops ${aveExtraWindowTime}; max ${client.maxWindowTime}`,
		);
	}

	function manyMergeTrees(): void {
		const mergeTreeCount = 2000000;
		const a = <MergeTree[]>Array.from({ length: mergeTreeCount });
		for (let i = 0; i < mergeTreeCount; i++) {
			a[i] = new MergeTree();
		}
		for (;;) {
			// infinite loop
		}
	}

	function clientServer(startFile?: string, initRounds = 1000): number {
		const clientCount = 5;
		const fileSegCount = 0;
		let initString = "";

		if (!startFile) {
			initString = "don't ask for whom the bell tolls; it tolls for thee";
		}
		const server = new TestServer();
		server.insertTextLocal(0, initString);
		server.measureOps = true;
		if (startFile) {
			loadTextFromFile(startFile, server.mergeTree, fileSegCount);
		}

		const clients: TestClient[] = Array.from({ length: clientCount });
		for (let i = 0; i < clientCount; i++) {
			clients[i] = new TestClient();
			clients[i].insertTextLocal(0, initString);
			clients[i].measureOps = true;
			if (startFile) {
				loadTextFromFile(startFile, clients[i].mergeTree, fileSegCount);
			}
			clients[i].startOrUpdateCollaboration(`Fred${i}`);
		}
		server.startOrUpdateCollaboration("theServer");
		server.addClients(clients);

		function checkTextMatch(): boolean {
			// log(`checking text match @${server.getCurrentSeq()}`);
			const clockStart = clock();
			const serverText = server.getText();
			getTextTime += elapsedMicroseconds(clockStart);
			getTextCalls++;
			for (const client of clients) {
				const cliText = client.getText();
				if (cliText !== serverText) {
					log(
						`mismatch @${server.getCurrentSeq()} client @${client.getCurrentSeq()} id: ${client.getClientId()}`,
					);
					// log(serverText);
					// log(cliText);
					const diffParts = JsDiff.diffChars(serverText, cliText);
					for (const diffPart of diffParts) {
						let annotes = "";
						if (diffPart.added) {
							annotes += "added ";
						} else if (diffPart.removed) {
							annotes += "removed ";
						}
						if (diffPart.count) {
							annotes += `count: ${diffPart.count}`;
						}
						log(`text: ${diffPart.value} ${annotes}`);
					}
					log(server.mergeTree.toString());
					log(client.mergeTree.toString());
					return true;
				}
			}
			return false;
		}

		const rounds = initRounds;

		function clientProcessSome(client: TestClient, all = false): void {
			const cliMsgCount = client.getMessageCount();
			const countToApply = all
				? cliMsgCount
				: random.integer(Math.floor((2 * cliMsgCount) / 3), cliMsgCount);
			client.applyMessages(countToApply);
		}

		function serverProcessSome(_server: TestClient, all = false): boolean {
			const svrMsgCount = _server.getMessageCount();
			const countToApply = all
				? svrMsgCount
				: random.integer(Math.floor((2 * svrMsgCount) / 3), svrMsgCount);
			return _server.applyMessages(countToApply);
		}

		function randomSpateOfInserts(client: TestClient, charIndex: number): void {
			const textLen = randTextLength();
			const text = randomString(
				textLen,
				String.fromCodePoint(zedCode + ((client.getCurrentSeq() + charIndex) % 50)),
			);
			const preLen = client.getLength();
			const pos = random.integer(0, preLen);
			const insertTextOp = client.insertTextLocal(pos, text);
			server.enqueueMsg(client.makeOpMessage(insertTextOp!, UnassignedSequenceNumber));

			if (TestClient.useCheckQ) {
				client.enqueueTestString();
			}
		}

		function randomSpateOfRemoves(client: TestClient): void {
			const dlen = randTextLength();
			const preLen = client.getLength();
			const pos = random.integer(0, preLen);
			const op = client.removeRangeLocal(pos, pos + dlen);
			server.enqueueMsg(client.makeOpMessage(op!));
			if (TestClient.useCheckQ) {
				client.enqueueTestString();
			}
		}

		function randomWordMove(client: TestClient): void {
			const word1 = client.findRandomWord();
			if (word1) {
				const removeStart = word1.pos;
				const removeEnd = removeStart + word1.text.length;
				const removeOp = client.removeRangeLocal(removeStart, removeEnd);
				server.enqueueMsg(client.makeOpMessage(removeOp!, UnassignedSequenceNumber));
				if (TestClient.useCheckQ) {
					client.enqueueTestString();
				}
				let word2 = client.findRandomWord();
				while (!word2) {
					word2 = client.findRandomWord();
				}
				const pos = word2.pos + word2.text.length;
				const insertOp = client.insertTextLocal(pos, word1.text);
				server.enqueueMsg(client.makeOpMessage(insertOp!, UnassignedSequenceNumber));

				if (TestClient.useCheckQ) {
					client.enqueueTestString();
				}
			}
		}

		let errorCount = 0;

		const extractSnapTime = 0;
		const extractSnapOps = 0;
		function finishRound(roundCount: number): number | undefined {
			// Process remaining messages
			if (serverProcessSome(server, true)) {
				return;
			}
			for (const client of clients) {
				clientProcessSome(client, true);
			}

			if (0 === roundCount % 100) {
				const clockStart = clock();
				if (checkTextMatch()) {
					log(`round: ${roundCount} BREAK`);
					errorCount++;
					return errorCount;
				}
				checkTime += elapsedMicroseconds(clockStart);
				if (verbose) {
					log(`wall clock is ${((Date.now() - startTime) / 1000).toFixed(1)}`);
				}
				const stats = getStats(server.mergeTree);
				const liveAve = (stats.liveCount / stats.nodeCount).toFixed(1);
				const posLeaves = stats.leafCount - stats.removedLeafCount;
				let aveExtractSnapTime = "off";
				if (extractSnapOps > 0) {
					aveExtractSnapTime = (extractSnapTime / extractSnapOps).toFixed(1);
				}
				log(
					`round: ${roundCount} seq ${server.seq} char count ${server.getLength()} height ${
						stats.maxHeight
					} lv ${stats.leafCount} rml ${stats.removedLeafCount} p ${posLeaves} nodes ${
						stats.nodeCount
					} pop ${liveAve} histo ${stats.histo}`,
				);
				if (extractSnapOps > 0) {
					aveExtractSnapTime = (extractSnapTime / extractSnapOps).toFixed(1);
					log(`ave extract snap time ${aveExtractSnapTime}`);
				}
				reportTiming(server);
				reportTiming(clients[2]);
				let totalTime = server.accumTime + server.accumWindowTime;
				for (const client of clients) {
					totalTime += client.accumTime + client.accumWindowTime;
				}
				if (verbose) {
					log(
						`total time ${(totalTime / 1000000).toFixed(1)} check time ${(checkTime / 1000000).toFixed(1)}`,
					);
				}
				// log(server.getText());
				// log(server.mergeTree.toString());
			}
			return errorCount;
		}

		function round(roundCount: number): void {
			for (const client of clients) {
				const insertSegmentCount = randSmallSegmentCount();
				for (let j = 0; j < insertSegmentCount; j++) {
					if (startFile) {
						randomWordMove(client);
					} else {
						randomSpateOfInserts(client, j);
					}
				}
				if (serverProcessSome(server)) {
					return;
				}
				clientProcessSome(client);

				let removeSegmentCount = Math.floor((3 * insertSegmentCount) / 4);
				if (removeSegmentCount < 1) {
					removeSegmentCount = 1;
				}
				for (let j = 0; j < removeSegmentCount; j++) {
					if (startFile) {
						randomWordMove(client);
					} else {
						randomSpateOfRemoves(client);
					}
				}
				if (serverProcessSome(server)) {
					return;
				}
				clientProcessSome(client);
			}
			finishRound(roundCount);
		}

		const startTime = Date.now();
		let checkTime = 0;

		for (let i = 0; i < rounds; i++) {
			round(i);
			if (errorCount > 0) {
				break;
			}
		}
		tail();

		function tail(): void {
			reportTiming(server);
			reportTiming(clients[2]);
			// log(server.getText());
			// log(server.mergeTree.toString());
		}
		return errorCount;
	}

	function randolicious(): number {
		const insertRounds = 40;
		const removeRounds = 32;

		const cliA = new TestClient();
		cliA.insertTextLocal(0, "a stitch in time saves nine");
		cliA.startOrUpdateCollaboration("FredA");
		const cliB = new TestClient();
		cliB.insertTextLocal(0, "a stitch in time saves nine");
		cliB.startOrUpdateCollaboration("FredB");
		function checkTextMatch(checkSeq: number): boolean {
			let error = false;
			if (cliA.getCurrentSeq() !== checkSeq) {
				log(`client A has seq number ${cliA.getCurrentSeq()} mismatch with ${checkSeq}`);
				error = true;
			}
			if (cliB.getCurrentSeq() !== checkSeq) {
				log(`client B has seq number ${cliB.getCurrentSeq()} mismatch with ${checkSeq}`);
				error = true;
			}
			const aText = cliA.getText();
			const bText = cliB.getText();
			if (aText !== bText) {
				log(`mismatch @${checkSeq}:`);
				log(aText);
				log(bText);
				error = true;
			}
			if (!nodeOrdinalsHaveIntegrity(cliA.mergeTree.root)) {
				error = true;
			}
			if (!nodeOrdinalsHaveIntegrity(cliB.mergeTree.root)) {
				error = true;
			}
			return error;
		}

		let min = 0;
		cliA.accumTime = 0;
		cliB.accumTime = 0;

		function insertTest(): boolean {
			for (let i = 0; i < insertRounds; i++) {
				let insertCount = randSegmentCount();
				let sequenceNumber = cliA.getCurrentSeq() + 1;
				let firstSeq = sequenceNumber;
				const cliAMsgs: ISequencedDocumentMessage[] = [];
				for (let j = 0; j < insertCount; j++) {
					const textLen = randTextLength();
					const text = randomString(
						textLen,
						String.fromCodePoint(zedCode + (sequenceNumber % 50)),
					);
					const preLen = cliA.getLength();
					const pos = random.integer(0, preLen);

					const msg = cliA.makeOpMessage(cliA.insertTextLocal(pos, text)!, sequenceNumber++);
					msg.minimumSequenceNumber = min;
					cliAMsgs.push(msg);
					cliB.applyMsg(msg);
				}
				for (let k = firstSeq; k < sequenceNumber; k++) {
					cliA.applyMsg(cliAMsgs.shift()!);
				}
				if (checkTextMatch(sequenceNumber - 1)) {
					return true;
				}

				min = sequenceNumber - 1;

				insertCount = randSegmentCount();
				sequenceNumber = cliA.getCurrentSeq() + 1;
				firstSeq = sequenceNumber;
				const cliBMsgs: ISequencedDocumentMessage[] = [];
				for (let j = 0; j < insertCount; j++) {
					const textLen = randTextLength();
					const text = randomString(
						textLen,
						String.fromCodePoint(zedCode + (sequenceNumber % 50)),
					);
					const preLen = cliB.getLength();
					const pos = random.integer(0, preLen);
					const msg = cliB.makeOpMessage(cliB.insertTextLocal(pos, text)!, sequenceNumber++);
					msg.minimumSequenceNumber = min;
					cliBMsgs.push(msg);
					cliA.applyMsg(msg);
				}
				for (let k = firstSeq; k < sequenceNumber; k++) {
					cliB.applyMsg(cliBMsgs.shift()!);
				}
				if (checkTextMatch(sequenceNumber - 1)) {
					return true;
				}

				min = sequenceNumber - 1;
			}
			return false;
		}

		function removeTest(): boolean {
			for (let i = 0; i < removeRounds; i++) {
				let removeCount = randSegmentCount();
				let sequenceNumber = cliA.getCurrentSeq() + 1;
				let firstSeq = sequenceNumber;
				const cliAMsgs: ISequencedDocumentMessage[] = [];
				for (let j = 0; j < removeCount; j++) {
					const dlen = randTextLength();
					const maxStartPos = cliA.getLength() - dlen;
					const pos = random.integer(0, maxStartPos);
					const msg = cliA.makeOpMessage(
						cliA.removeRangeLocal(pos, pos + dlen)!,
						sequenceNumber++,
					);
					msg.minimumSequenceNumber = min;
					cliAMsgs.push(msg);
					cliB.applyMsg(msg);
				}
				for (let k = firstSeq; k < sequenceNumber; k++) {
					cliA.applyMsg(cliAMsgs.shift()!);
				}
				if (checkTextMatch(sequenceNumber - 1)) {
					return true;
				}

				min = sequenceNumber - 1;

				removeCount = randSegmentCount();
				sequenceNumber = cliA.getCurrentSeq() + 1;
				firstSeq = sequenceNumber;
				const cliBMsgs: ISequencedDocumentMessage[] = [];
				for (let j = 0; j < removeCount; j++) {
					const dlen = randTextLength();
					const maxStartPos = cliB.getLength() - dlen;
					const pos = random.integer(0, maxStartPos);
					const msg = cliB.makeOpMessage(
						cliB.removeRangeLocal(pos, pos + dlen)!,
						sequenceNumber++,
					);
					msg.minimumSequenceNumber = min;
					cliBMsgs.push(msg);
					cliA.applyMsg(msg);
				}
				for (let k = firstSeq; k < sequenceNumber; k++) {
					cliB.applyMsg(cliBMsgs.shift()!);
				}
				if (checkTextMatch(sequenceNumber - 1)) {
					return true;
				}

				min = sequenceNumber - 1;
			}
			return false;
		}
		let errorCount = 0;
		if (insertTest()) {
			log(cliA.mergeTree.toString());
			log(cliB.mergeTree.toString());
			errorCount++;
		} else {
			log(`sequence number: ${cliA.getCurrentSeq()} min: ${cliA.getCollabWindow().minSeq}`);
			//            log(cliA.mergeTree.toString());

			log(`testing remove at ${cliA.getCurrentSeq()} and ${cliB.getCurrentSeq()}`);
			if (removeTest()) {
				log(cliA.mergeTree.toString());
				log(cliB.mergeTree.toString());
				errorCount++;
			}
		}
		log(`sequence number: ${cliA.getCurrentSeq()} min: ${cliA.getCollabWindow().minSeq}`);
		//                log(cliA.mergeTree.toString());
		// log(cliB.mergeTree.toString());
		// log(cliA.getText());
		const aveWindow = ((minSegCount + maxSegCount) / 2).toFixed(1);
		const aveTime = (cliA.accumTime / cliA.accumOps).toFixed(3);
		const aveWindowTime = (cliA.accumWindowTime / cliA.accumOps).toFixed(3);
		if (verbose) {
			log(
				`accum time ${cliA.accumTime} us ops: ${cliA.accumOps} ave window ${aveWindow} ave time ${aveTime}`,
			);
			log(
				`accum window time ${cliA.accumWindowTime} us ave window time ${aveWindowTime}; max ${cliA.maxWindowTime}`,
			);
		}
		// log(cliB.getText());
		return errorCount;
	}

	const clientNames = ["Ed", "Ted", "Ned", "Harv", "Marv", "Glenda", "Susan"];
	function firstTest(): void {
		let cli = new TestClient();
		cli.insertTextLocal(0, "on the mat.");
		cli.startOrUpdateCollaboration("Fred1");
		for (const cname of clientNames) {
			cli.addLongClientId(cname);
		}
		cli.insertTextRemote(0, "that ", undefined, 1, 0, "1");
		if (verbose) {
			log(cli.mergeTree.toString());
		}
		cli.insertTextRemote(0, "fat ", undefined, 2, 0, "2");
		if (verbose) {
			log(cli.mergeTree.toString());
		}
		cli.insertTextLocal(5, "cat ");
		if (verbose) {
			log(cli.mergeTree.toString());
		}
		if (verbose) {
			for (let i = 0; i < 4; i++) {
				for (let j = 0; j < 3; j++) {
					log(cli.relText(i, j));
				}
			}
		}
		cli.mergeTree.ackPendingSegment(createLocalOpArgs(MergeTreeDeltaType.INSERT, 3));
		if (verbose) {
			log(cli.mergeTree.toString());
			for (let clientId = 0; clientId < 4; clientId++) {
				for (let refSeq = 0; refSeq < 4; refSeq++) {
					log(cli.relText(clientId, refSeq));
				}
			}
		}
		cli.insertMarkerRemote(
			0,
			{ refType: ReferenceType.Tile },
			{ [reservedTileLabelsKey]: ["peach"] },
			5,
			0,
			"2",
		);
		cli.insertTextRemote(6, "very ", undefined, 6, 2, "2");
		if (verbose) {
			log(cli.mergeTree.toString());
			for (let clientId = 0; clientId < 4; clientId++) {
				for (let refSeq = 0; refSeq < 7; refSeq++) {
					log(cli.relText(clientId, refSeq));
				}
			}
		}
		const segs = <SharedStringJSONSegment[]>(
			new SnapshotLegacy(cli.mergeTree, createChildLogger({ namespace: "fluid:snapshot" }))
				.extractSync()
				.map((seg) => seg.toJSONObject() as JsonSegmentSpecs)
		);
		if (verbose) {
			for (const seg of segs) {
				log(`${specToSegment(seg)}`);
			}
		}
		cli = new TestClient();
		cli.insertTextLocal(0, " old sock!");
		cli.startOrUpdateCollaboration("Fred2");
		for (const cname of clientNames) {
			cli.addLongClientId(cname);
		}
		cli.insertTextRemote(0, "abcde", undefined, 1, 0, "2");
		cli.insertTextRemote(0, "yyy", undefined, 2, 0, "1");
		cli.insertTextRemote(2, "zzz", undefined, 3, 1, "3");
		cli.insertTextRemote(1, "EAGLE", undefined, 4, 1, "4");
		cli.insertTextRemote(4, "HAS", undefined, 5, 1, "5");
		cli.insertTextLocal(19, " LANDED");
		cli.insertTextRemote(0, "yowza: ", undefined, 6, 4, "2");
		cli.mergeTree.ackPendingSegment(createLocalOpArgs(MergeTreeDeltaType.INSERT, 7));
		if (verbose) {
			log(cli.mergeTree.toString());
			for (let clientId = 0; clientId < 6; clientId++) {
				for (let refSeq = 0; refSeq < 8; refSeq++) {
					log(cli.relText(clientId, refSeq));
				}
			}
		}
		cli.applyMsg(cli.makeOpMessage(createRemoveRangeOp(3, 5), 8, 6, "1"));
		if (verbose) {
			log(cli.mergeTree.toString());
			for (let clientId = 0; clientId < 6; clientId++) {
				for (let refSeq = 0; refSeq < 9; refSeq++) {
					log(cli.relText(clientId, refSeq));
				}
			}
		}
		cli = new TestClient();
		cli.insertTextLocal(0, "abcdefgh");
		cli.startOrUpdateCollaboration("Fred3");
		for (const cname of clientNames) {
			cli.addLongClientId(cname);
		}
		cli.applyMsg(cli.makeOpMessage(createRemoveRangeOp(1, 3), 1, 0, "3"));
		if (verbose) {
			log(cli.mergeTree.toString());
		}
		cli.insertTextRemote(2, "zzz", undefined, 2, 0, "2");
		if (verbose) {
			log(cli.mergeTree.toString());
		}
		cli.insertTextRemote(9, " chaser", undefined, 3, 2, "3");
		cli.removeRangeLocal(12, 14);
		cli.mergeTree.ackPendingSegment(createLocalOpArgs(MergeTreeDeltaType.REMOVE, 4));
		if (verbose) {
			log(cli.mergeTree.toString());
			for (let clientId = 0; clientId < 4; clientId++) {
				for (let refSeq = 0; refSeq < 5; refSeq++) {
					log(cli.relText(clientId, refSeq));
				}
			}
		}
		cli.insertTextLocal(14, "*yolumba*");
		cli.insertTextLocal(17, "-zanzibar-");
		cli.mergeTree.ackPendingSegment(createLocalOpArgs(MergeTreeDeltaType.INSERT, 5));
		cli.insertTextRemote(2, "(aaa)", undefined, 6, 4, "2");
		cli.mergeTree.ackPendingSegment(createLocalOpArgs(MergeTreeDeltaType.INSERT, 7));
		if (verbose) {
			log(cli.mergeTree.toString());
			for (let clientId = 0; clientId < 4; clientId++) {
				for (let refSeq = 0; refSeq < 8; refSeq++) {
					log(cli.relText(clientId, refSeq));
				}
			}
		}
		/*
        cli.removeRangeLocal(3,8);
        cli.removeRangeLocal(5,7);
        cli.ackPendingSegment(8);
        cli.ackPendingSegment(9);
        */
		cli.applyMsg(cli.makeOpMessage(createRemoveRangeOp(3, 8), 8, 7, "2"));
		cli.applyMsg(cli.makeOpMessage(createRemoveRangeOp(5, 7), 9, 7, "2"));
		if (verbose) {
			log(cli.mergeTree.toString());
			for (let clientId = 0; clientId < 4; clientId++) {
				for (let refSeq = 0; refSeq < 10; refSeq++) {
					log(cli.relText(clientId, refSeq));
				}
			}
		}
		const removeOp = cli.removeRangeLocal(3, 5);
		cli.applyMsg(cli.makeOpMessage(createRemoveRangeOp(3, 6), 10, 9, "2"));
		cli.applyMsg(cli.makeOpMessage(removeOp!, 11));
		if (verbose) {
			log(cli.mergeTree.toString());
			for (let clientId = 0; clientId < 4; clientId++) {
				for (let refSeq = 0; refSeq < 12; refSeq++) {
					log(cli.relText(clientId, refSeq));
				}
			}
		}
	}
	return {
		firstTest,
		randolicious,
		clientServer,
		manyMergeTrees,
	};
}

const createLocalOpArgs = (
	type: MergeTreeDeltaType,
	sequenceNumber: number,
): IMergeTreeDeltaOpArgs => ({
	op: { type } as IMergeTreeOp,
	sequencedMessage: {
		sequenceNumber,
	} as ISequencedDocumentMessage,
});

export class RandomPack {
	random: IRandom;
	constructor() {
		this.random = makeRandom(0xdeadbeef, 0xfeedbed);
	}

	randInteger(min: number, max: number): number {
		return this.random.integer(min, max);
	}

	randString(wordCount: number): string {
		const exampleWords = [
			"giraffe",
			"hut",
			"aardvark",
			"gold",
			"hover",
			"yurt",
			"hot",
			"antelope",
			"gift",
			"banana",
			"book",
			"airplane",
			"kitten",
			"moniker",
			"lemma",
			"doughnut",
			"orange",
			"tangerine",
		];
		let buf = "";
		for (let i = 0; i < wordCount; i++) {
			const exampleWord = exampleWords[this.randInteger(0, exampleWords.length - 1)];
			if (i > 0) {
				buf += " ";
			}
			buf += exampleWord;
		}
		return buf;
	}
}

export type DocumentNode = string | DocumentTree;
/**
 * Generate and model documents from the following tree grammar:
 * Row -\> row[Box*];
 * Box -\> box[Content];
 * Content -\> (Row|Paragraph)*;
 * Paragraph -\> pgtile text;
 * Document -\> Content
 */
export class DocumentTree {
	pos = 0;
	ids: Record<string, number> = { box: 0, row: 0 };
	id: string | undefined;
	static randPack = new RandomPack();

	constructor(
		public name: string,
		public children: DocumentNode[],
	) {}

	addToMergeTree(client: TestClient, docNode: DocumentNode): void {
		if (typeof docNode === "string") {
			const text = docNode;
			client.insertTextLocal(this.pos, text);
			this.pos += text.length;
		} else {
			let id: number | undefined;
			if (docNode.name === "pg") {
				client.insertMarkerLocal(this.pos, ReferenceType.Tile, {
					[reservedTileLabelsKey]: [docNode.name],
				});
				this.pos++;
			} else {
				const trid = docNode.name + this.ids[docNode.name].toString();
				docNode.id = trid;
				id = this.ids[docNode.name]++;
				const props = {
					[reservedMarkerIdKey]: trid,
					[reservedRangeLabelsKey]: [docNode.name],
				};
				let behaviors = ReferenceType.Simple;
				if (docNode.name === "row") {
					props[reservedTileLabelsKey] = ["pg"];
					behaviors |= ReferenceType.Tile;
				}

				client.insertMarkerLocal(this.pos, behaviors, props);
				this.pos++;
			}
			for (const child of docNode.children) {
				this.addToMergeTree(client, child);
			}
			if (docNode.name !== "pg") {
				const etrid = `end-${docNode.name}${id?.toString()}`;
				client.insertMarkerLocal(this.pos, ReferenceType.Simple, {
					[reservedMarkerIdKey]: etrid,
					[reservedRangeLabelsKey]: [docNode.name],
				});
				this.pos++;
			}
		}
	}

	static generateDocument(): DocumentTree {
		const tree = new DocumentTree("Document", DocumentTree.generateContent(0.6));
		return tree;
	}

	static generateContent(rowProbability: number): DocumentNode[] {
		let _rowProbability = rowProbability;
		const items = <DocumentNode[]>[];
		const docLen = DocumentTree.randPack.randInteger(7, 25);
		for (let i = 0; i < docLen; i++) {
			const rowThreshold = _rowProbability * 1000;
			const selector = DocumentTree.randPack.randInteger(1, 1000);
			if (selector >= rowThreshold) {
				const pg = DocumentTree.generateParagraph();
				items.push(pg);
			} else {
				_rowProbability /= 2;
				if (_rowProbability < 0.08) {
					_rowProbability = 0;
				}
				const row = DocumentTree.generateRow(_rowProbability);
				items.push(row);
			}
		}
		return items;
	}

	// Model pg tile as tree with single child
	static generateParagraph(): DocumentTree {
		const wordCount = DocumentTree.randPack.randInteger(1, 6);
		const text = DocumentTree.randPack.randString(wordCount);
		const pgTree = new DocumentTree("pg", [text]);
		return pgTree;
	}

	static generateRow(rowProbability: number): DocumentTree {
		const items = <DocumentNode[]>[];
		const rowLen = DocumentTree.randPack.randInteger(1, 5);
		for (let i = 0; i < rowLen; i++) {
			const item = DocumentTree.generateBox(rowProbability);
			items.push(item);
		}
		return new DocumentTree("row", items);
	}

	static generateBox(rowProbability: number): DocumentTree {
		return new DocumentTree("box", DocumentTree.generateContent(rowProbability));
	}
}

function findReplacePerf(filename: string): void {
	const client = new TestClient();
	loadTextFromFile(filename, client.mergeTree);

	const clockStart = clock();

	let cFetches = 0;
	let cReplaces = 0;
	for (let pos = 0; pos < client.getLength(); ) {
		const curSegOff = client.getContainingSegment<ISegmentLeaf>(pos);
		cFetches++;

		const curSeg = curSegOff.segment;
		const textSeg = <TextSegment>curSeg;
		if (textSeg !== null) {
			const text = textSeg.text;
			const i = text.indexOf("the");
			if (i >= 0) {
				client.mergeTree.markRangeRemoved(
					pos + i,
					pos + i + 3,
					UniversalSequenceNumber,
					client.getClientId(),
					1,
					undefined as never,
				);
				insertText({
					mergeTree: client.mergeTree,
					pos: pos + i,
					refSeq: UniversalSequenceNumber,
					clientId: client.getClientId(),
					seq: 1,
					text: "teh",
					props: undefined,
					opArgs: undefined,
				});
				pos = pos + i + 3;
				cReplaces++;
			} else {
				pos += curSeg!.cachedLength - curSegOff!.offset!;
			}
		}
	}

	const elapsed = elapsedMicroseconds(clockStart);
	log(`${cFetches} fetches and ${cReplaces} replaces took ${elapsed} microseconds`);
}

const baseDir = "../../src/test/literature";
const testTimeout = 60000;

describe("Routerlicious", () => {
	describe("merge-tree", () => {
		beforeEach(() => {
			logLines = [];
		});
		it("firstTest", () => {
			const testPack = TestPack(true);
			testPack.firstTest();
		});

		it("randolicious", () => {
			const testPack = TestPack(false);
			assert(testPack.randolicious() === 0, logLines.join("\n"));
		}).timeout(testTimeout);

		it("mergeTreeCheckedTest", () => {
			assert(mergeTreeCheckedTest() === 0, logLines.join("\n"));
		}).timeout(testTimeout);

		it("beastTest", () => {
			const testPack = TestPack(false);
			const filename = path.join(_dirname, baseDir, "pp.txt");
			assert(testPack.clientServer(filename, 250) === 0, logLines.join("\n"));
		}).timeout(testTimeout);

		it("findReplPerf", () => {
			const filename = path.join(_dirname, baseDir, "pp10.txt");
			findReplacePerf(filename);
		}).timeout(testTimeout);
	});
});

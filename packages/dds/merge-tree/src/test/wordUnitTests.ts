/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

import path from "path";
import random from "random-js";
import { Trace } from "@fluidframework/common-utils";
import { LocalReference } from "../localReference";
import * as ops from "../ops";
import * as Properties from "../properties";
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
    let obj: Properties.MapLike<number>;
    for (let j = 0; j < iterCount; j++) {
        obj = Properties.createMap<number>();
        for (let i = 0; i < propCount; i++) {
            obj[a[i]] = v[i];
        }
    }
    let et = elapsedMicroseconds(clockStart);
    let perIter = (et / iterCount).toFixed(3);
    let perProp = (et / (iterCount * propCount)).toFixed(3);
    console.log(`arr prop init time ${perIter} us per ${propCount} properties; ${perProp} us per property`);
    clockStart = clock();
    for (let j = 0; j < iterCount; j++) {
        const bObj = Properties.createMap<number>();
        // eslint-disable-next-line guard-for-in, no-restricted-syntax
        for (const key in obj) {
            bObj[key] = obj[key];
        }
    }
    et = elapsedMicroseconds(clockStart);
    perIter = (et / iterCount).toFixed(3);
    perProp = (et / (iterCount * propCount)).toFixed(3);
    console.log(`obj prop init time ${perIter} us per ${propCount} properties; ${perProp} us per property`);
    clockStart = clock();
    for (let j = 0; j < iterCount; j++) {
        const bObj = Properties.createMap<number>();
        for (const [key, value] of map) {
            bObj[key] = value;
        }
    }
    et = elapsedMicroseconds(clockStart);
    perIter = (et / iterCount).toFixed(3);
    perProp = (et / (iterCount * propCount)).toFixed(2);
    console.log(`map prop init time ${perIter} us per ${propCount} properties; ${perProp} us per property`);
    clockStart = clock();
    for (let j = 0; j < iterCount; j++) {
        const bObj = Properties.createMap<number>();
        map.forEach((value, key) => { bObj[key] = value; });
    }
    et = elapsedMicroseconds(clockStart);
    perIter = (et / iterCount).toFixed(3);
    perProp = (et / (iterCount * propCount)).toFixed(2);
    console.log(`map foreach prop init time ${perIter} us per ${propCount} properties; ${perProp} us per property`);
    clockStart = clock();
    for (let j = 0; j < iterCount; j++) {
        const bmap = new Map<string, number>();
        map.forEach((value, key) => { bmap.set(key, value); });
    }
    et = elapsedMicroseconds(clockStart);
    perIter = (et / iterCount).toFixed(3);
    perProp = (et / (iterCount * propCount)).toFixed(2);
    console.log(
        `map to map foreach prop init time ${perIter} us per ${propCount} properties; ${perProp} us per property`);
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
            // eslint-disable-next-line eqeqeq
            if (diffMap.get(key) != value) {
                grayMap.set(key, 1);
            }
        });
    }
    perIter = (et / iterCount).toFixed(3);
    perProp = (et / (iterCount * propCount)).toFixed(2);
    console.log(`diff time ${perIter} us per ${propCount} properties; ${perProp} us per property`);
}

function makeBookmarks(client: TestClient, bookmarkCount: number) {
    const mt = random.engines.mt19937();
    mt.seedWithArray([0xdeadbeef, 0xfeedbed]);
    const bookmarks: LocalReference[] = [];
    const len = client.getLength();
    for (let i = 0; i < bookmarkCount; i++) {
        const pos = random.integer(0, len - 1)(mt);
        const segoff = client.getContainingSegment(pos);
        let refType = ops.ReferenceType.Simple;
        if (i & 1) {
            refType = ops.ReferenceType.SlideOnRemove;
        }
        const lref = new LocalReference(client, segoff.segment, segoff.offset, refType);
        client.mergeTree.addLocalReference(lref);
        bookmarks.push(lref);
    }
    return bookmarks;
}

function measureFetch(startFile: string, withBookmarks = false) {
    const bookmarkCount = 20000;
    const client = new TestClient({ blockUpdateMarkers: true });
    loadTextFromFileWithMarkers(startFile, client.mergeTree);
    if (withBookmarks) {
        makeBookmarks(client, bookmarkCount);
        console.log(`inserting ${bookmarkCount} refs into text`);
    }
    const reps = 20;
    let clockStart = clock();
    let count = 0;
    for (let i = 0; i < reps; i++) {
        for (let pos = 0; pos < client.getLength();) {
            // let prevPG = client.findTile(pos, "pg");
            // let caBegin: number;
            // if (prevPG) {
            //     caBegin = prevPG.pos;
            // } else {
            //     caBegin = 0;
            // }
            // curPG.pos is ca end
            const curPG = client.findTile(pos, "pg", false);
            const properties = curPG.tile.properties;
            const curSegOff = client.getContainingSegment(pos);
            const curSeg = curSegOff.segment;
            // Combine paragraph and direct properties
            Properties.extend(properties, curSeg.properties);
            pos += (curSeg.cachedLength - curSegOff.offset);
            count++;
        }
    }
    let et = elapsedMicroseconds(clockStart);
    // eslint-disable-next-line max-len
    console.log(`fetch of ${count / reps} runs over ${client.getLength()} total chars took ${(et / count).toFixed(1)} microseconds per run`);
    // Bonus: measure clone
    clockStart = clock();
    for (let i = 0; i < reps; i++) {
        client.mergeTree.clone();
    }
    et = elapsedMicroseconds(clockStart);
    console.log(`naive clone took ${(et / (1000 * reps)).toFixed(1)} milliseconds`);
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

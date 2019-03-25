// tslint:disable

import * as MergeTree from "./mergeTree";
import { TestClient } from "./test/testClient";
import * as Properties from "./properties";
import * as ops from "./ops";
import * as path from "path";
import * as random from "random-js";
import { loadTextFromFileWithMarkers } from "./test/testUtils";

function clock() {
    return process.hrtime();
}

function elapsedMicroseconds(start: [number, number]) {
    let end: number[] = process.hrtime(start);
    let duration = Math.round((end[0] * 1000000) + (end[1] / 1000));
    return duration;
}

export function propertyCopy() {
    const propCount = 2000;
    const iterCount = 1000;
    let map = new Map<string, number>();
    let a = <string[]>[];
    let v = <number[]>[];
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
        let bObj = Properties.createMap<number>();
        for (let key in obj) {
            bObj[key] = obj[key];
        }
    }
    et = elapsedMicroseconds(clockStart);
    perIter = (et / iterCount).toFixed(3);
    perProp = (et / (iterCount * propCount)).toFixed(3);
    console.log(`obj prop init time ${perIter} us per ${propCount} properties; ${perProp} us per property`);
    clockStart = clock();
    for (let j = 0; j < iterCount; j++) {
        let bObj = Properties.createMap<number>();
        for (let [key, value] of map) {
            bObj[key] = value;
        }
    }
    et = elapsedMicroseconds(clockStart);
    perIter = (et / iterCount).toFixed(3);
    perProp = (et / (iterCount * propCount)).toFixed(2);
    console.log(`map prop init time ${perIter} us per ${propCount} properties; ${perProp} us per property`);
    clockStart = clock();
    for (let j = 0; j < iterCount; j++) {
        let bObj = Properties.createMap<number>();
        map.forEach((v, k) => { bObj[k] = v; });
    }
    et = elapsedMicroseconds(clockStart);
    perIter = (et / iterCount).toFixed(3);
    perProp = (et / (iterCount * propCount)).toFixed(2);
    console.log(`map foreach prop init time ${perIter} us per ${propCount} properties; ${perProp} us per property`);
    clockStart = clock();
    for (let j = 0; j < iterCount; j++) {
        let bmap = new Map<string, number>();
        map.forEach((v, k) => { bmap.set(k, v); });
    }
    et = elapsedMicroseconds(clockStart);
    perIter = (et / iterCount).toFixed(3);
    perProp = (et / (iterCount * propCount)).toFixed(2);
    console.log(`map to map foreach prop init time ${perIter} us per ${propCount} properties; ${perProp} us per property`);
    let diffMap = new Map<string, number>();
    map.forEach((v, k) => {
        if (Math.random() < 0.5) {
            diffMap.set(k, v);
        } else {
            diffMap.set(k, v * 3);
        }
    });
    clockStart = clock();
    let grayMap = new Map<string, number>();
    for (let j = 0; j < iterCount; j++) {
        map.forEach((v, k) => {
            if (diffMap.get(k) != v) {
                grayMap.set(k, 1);
            }
        });
    }
    perIter = (et / iterCount).toFixed(3);
    perProp = (et / (iterCount * propCount)).toFixed(2);
    console.log(`diff time ${perIter} us per ${propCount} properties; ${perProp} us per property`);
}

function makeBookmarks(client: TestClient, bookmarkCount: number) {
    let mt = random.engines.mt19937();
    mt.seedWithArray([0xdeadbeef, 0xfeedbed]);
    let bookmarks = <MergeTree.LocalReference[]>[];
    let refseq = client.getCurrentSeq();
    let clientId = client.getClientId();
    let len = client.mergeTree.getLength(MergeTree.UniversalSequenceNumber, MergeTree.NonCollabClient);
    for (let i = 0; i < bookmarkCount; i++) {
        let pos = random.integer(0, len - 1)(mt);
        let segoff = client.mergeTree.getContainingSegment(pos, refseq, clientId);
        let refType = ops.ReferenceType.Simple;
        if (i&1) {
            refType = ops.ReferenceType.SlideOnRemove;
        }
        let lref = new MergeTree.LocalReference(segoff.segment, segoff.offset, refType);
        client.mergeTree.addLocalReference(lref);
        bookmarks.push(lref);
    }
    return bookmarks;
}

function measureFetch(startFile: string, withBookmarks = false) {
    let bookmarkCount = 20000;
    let client = new TestClient("", { blockUpdateMarkers: true });
    loadTextFromFileWithMarkers(startFile, client.mergeTree);
    if (withBookmarks) {
        makeBookmarks(client, bookmarkCount);
        console.log(`inserting ${bookmarkCount} refs into text`);
    }
    let reps = 20;
    let clockStart = clock();
    let count = 0;
    for (let i = 0; i < reps; i++) {
        for (let pos = 0; pos < client.getLength();) {
            // let prevPG = client.mergeTree.findTile(pos, client.getClientId(), "pg");
            // let caBegin: number;
            // if (prevPG) {
            //     caBegin = prevPG.pos;
            // } else {
            //     caBegin = 0;
            // }
            // curPG.pos is ca end
            let curPG = client.mergeTree.findTile(pos, client.getClientId(), "pg", false);
            let properties = curPG.tile.properties;
            let curSegOff = client.mergeTree.getContainingSegment(pos, MergeTree.UniversalSequenceNumber, client.getClientId());
            let curSeg = curSegOff.segment;
            // combine paragraph and direct properties
            Properties.extend(properties, curSeg.properties);
            pos += (curSeg.cachedLength - curSegOff.offset);
            count++;
        }
    }
    let et = elapsedMicroseconds(clockStart);
    console.log(`fetch of ${count / reps} runs over ${client.getLength()} total chars took ${(et / count).toFixed(1)} microseconds per run`);
    // bonus: measure clone
    clockStart = clock();
    for (let i = 0; i < reps; i++) {
        client.mergeTree.clone();
    }
    et = elapsedMicroseconds(clockStart);
    console.log(`naive clone took ${(et / (1000*reps)).toFixed(1)} milliseconds`);
}
const filename = path.join(__dirname, "../../../routerlicious/public/literature", "pp.txt");

propertyCopy();
measureFetch(filename);
measureFetch(filename, true);
measureFetch(filename);
measureFetch(filename, true);


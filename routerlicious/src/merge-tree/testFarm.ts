import * as JsDiff from "diff";
import * as path from "path";
import * as random from "random-js";
import { findRandomWord } from "../merge-tree-utils";
import * as Collections from "./collections";
import * as MergeTree from "./mergeTree";
import * as ops from "./ops";
import * as Properties from "./properties";
import * as Text from "./text";

// tslint:disable

function clock() {
    return process.hrtime();
}

function elapsedMicroseconds(start: [number, number]) {
    let end: number[] = process.hrtime(start);
    let duration = Math.round((end[0] * 1000000) + (end[1] / 1000));
    return duration;
}

enum AsyncRoundState {
    Insert,
    Remove,
    Tail
}

interface AsyncRoundInfo {
    clientIndex: number;
    state: AsyncRoundState;
    insertSegmentCount?: number;
    removeSegmentCount?: number;
    iterIndex: number;
}

export function propertyCopy() {
    const propCount = 2000;
    const iterCount = 10000;
    let a = <string[]>[];
    let v = <number[]>[];
    for (let i = 0; i < propCount; i++) {
        a[i] = `prop${i}`;
        v[i] = i;
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
    console.log(`arr prop init time ${perIter} per init; ${perProp} per property`);
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
    console.log(`obj prop init time ${perIter} per init; ${perProp} per property`);
}

let testPropCopy = false;

if (testPropCopy) {
    propertyCopy();
}

function makeBookmarks(client: MergeTree.Client, bookmarkCount: number) {
    let mt = random.engines.mt19937();
    mt.seedWithArray([0xdeadbeef, 0xfeedbed]);
    let bookmarks = <MergeTree.LocalReference[]>[];
    let refseq = client.getCurrentSeq();
    let clientId = client.getClientId();
    let len = client.mergeTree.getLength(MergeTree.UniversalSequenceNumber, MergeTree.NonCollabClient);
    for (let i = 0; i < bookmarkCount; i++) {
        let pos = random.integer(0, len)(mt);
        let segoff = client.mergeTree.getContainingSegment(pos, refseq, clientId);
        bookmarks.push({ segment: segoff.segment, offset: segoff.offset, slideOnRemove: (i&1)!==1 });
    }
    return bookmarks;
}

export function TestPack(verbose = true) {
    let mt = random.engines.mt19937();
    mt.seedWithArray([0xdeadbeef, 0xfeedbed]);
    let smallSegmentCountDistribution = random.integer(1, 4);
    function randSmallSegmentCount() {
        return smallSegmentCountDistribution(mt);
    }
    let textLengthDistribution = random.integer(1, 5);
    function randTextLength() {
        return textLengthDistribution(mt);
    }
    const zedCode = 48
    function randomString(len: number, c: string) {
        let str = "";
        for (let i = 0; i < len; i++) {
            str += c;
        }
        return str;
    }

    let checkIncr = false;

    let getTextTime = 0;
    let getTextCalls = 0;
    let incrGetTextTime = 0;
    let incrGetTextCalls = 0;
    let catchUpTime = 0;
    let catchUps = 0;

    function reportTiming(client: MergeTree.Client) {
        if (!verbose) {
            return;
        }
        let aveTime = (client.accumTime / client.accumOps).toFixed(1);
        let aveLocalTime = (client.localTime / client.localOps).toFixed(1);
        let stats = client.mergeTree.getStats();
        let windowTime = stats.windowTime;
        let packTime = stats.packTime;
        let aveWindowTime = ((windowTime || 0) / (client.accumOps)).toFixed(1);
        let avePackTime = ((packTime || 0) / (client.accumOps)).toFixed(1);
        let aveExtraWindowTime = (client.accumWindowTime / client.accumOps).toFixed(1);
        let aveWindow = (client.accumWindow / client.accumOps).toFixed(1);
        let adjTime = ((client.accumTime - (windowTime - client.accumWindowTime)) / client.accumOps).toFixed(1);
        let aveGetTextTime = (getTextTime / getTextCalls).toFixed(1);
        let aveIncrGetTextTime = "off";
        let aveCatchUpTime = "off";
        if (catchUps > 0) {
            aveCatchUpTime = (catchUpTime / catchUps).toFixed(1);
        }
        if (checkIncr) {
            aveIncrGetTextTime = (incrGetTextTime / incrGetTextCalls).toFixed(1);
        }
        if (client.localOps > 0) {
            console.log(`local time ${client.localTime} us ops: ${client.localOps} ave time ${aveLocalTime}`);
        }
        console.log(`get text time: ${aveGetTextTime} incr: ${aveIncrGetTextTime} catch up ${aveCatchUpTime}`);
        console.log(`accum time ${client.accumTime} us ops: ${client.accumOps} ave time ${aveTime} - wtime ${adjTime} pack ${avePackTime} ave window ${aveWindow}`);
        console.log(`accum window time ${client.accumWindowTime} us ave window time total ${aveWindowTime} not in ops ${aveExtraWindowTime}; max ${client.maxWindowTime}`);
    }

    function manyMergeTrees() {
        const mergeTreeCount = 2000000;
        let a = <MergeTree.MergeTree[]>Array(mergeTreeCount);
        for (let i = 0; i < mergeTreeCount; i++) {
            a[i] = new MergeTree.MergeTree("");
        }
        for (; ;);
    }

    function clientServer(startFile?: string, initRounds = 1000) {
        const clientCount = 5;
        const fileSegCount = 0;
        let initString = "";
        let snapInProgress = false;
        let asyncExec = false;
        let addSnapClient = false;
        let extractSnap = false;
        let includeMarkers = false;
        let measureBookmarks = true;
        let bookmarkCount = 12000;
        let bookmarks: MergeTree.LocalReference[];
        let bookmarkReads = 0;
        let bookmarkReadTime = 0;

        let testSyncload = false;
        let snapClient: MergeTree.Client;

        if (!startFile) {
            initString = "don't ask for whom the bell tolls; it tolls for thee";
        }
        let server = new MergeTree.TestServer(initString);
        server.measureOps = true;
        if (startFile) {
            Text.loadTextFromFile(startFile, server.mergeTree, fileSegCount);
        }

        let clients = <MergeTree.Client[]>Array(clientCount);
        for (let i = 0; i < clientCount; i++) {
            clients[i] = new MergeTree.Client(initString);
            clients[i].measureOps = true;
            if (startFile) {
                Text.loadTextFromFile(startFile, clients[i].mergeTree, fileSegCount);
            }
            clients[i].startCollaboration(`Fred${i}`);
        }
        server.startCollaboration("theServer");
        server.addClients(clients);
        if (measureBookmarks) {
            bookmarks = makeBookmarks(server, bookmarkCount);
        }
        if (testSyncload) {
            let clockStart = clock();
            // let segs = Paparazzo.Snapshot.loadSync("snap-initial");
            console.log(`sync load time ${elapsedMicroseconds(clockStart)}`);
            let fromLoad = new MergeTree.MergeTree("");
            // fromLoad.reloadFromSegments(segs);
            let fromLoadText = fromLoad.getText(MergeTree.UniversalSequenceNumber, MergeTree.NonCollabClient);
            let serverText = server.getText();
            if (fromLoadText != serverText) {
                console.log('snap file vs. text file mismatch');
            }
        }
        if (addSnapClient) {
            snapClient = new MergeTree.Client(initString);
            if (startFile) {
                Text.loadTextFromFile(startFile, snapClient.mergeTree, fileSegCount);
            }
            snapClient.startCollaboration("snapshot");
            server.addListeners([snapClient]);
        }
        function incrGetText(client: MergeTree.Client) {
            let collabWindow = client.mergeTree.getCollabWindow();
            return client.mergeTree.incrementalGetText(collabWindow.currentSeq, collabWindow.clientId);
        }

        function checkTextMatch() {
            //console.log(`checking text match @${server.getCurrentSeq()}`);
            let clockStart = clock();
            let serverText = server.getText();
            getTextTime += elapsedMicroseconds(clockStart);
            getTextCalls++;
            if (checkIncr) {
                clockStart = clock();
                let serverIncrText = incrGetText(server);
                incrGetTextTime += elapsedMicroseconds(clockStart);
                incrGetTextCalls++;
                if (serverIncrText != serverText) {
                    console.log("incr get text mismatch");
                }
            }
            for (let client of clients) {
                let cliText = client.getText();
                if (cliText != serverText) {
                    console.log(`mismatch @${server.getCurrentSeq()} client @${client.getCurrentSeq()} id: ${client.getClientId()}`);
                    //console.log(serverText);
                    //console.log(cliText);
                    let diffParts = JsDiff.diffChars(serverText, cliText);
                    for (let diffPart of diffParts) {
                        let annotes = "";
                        if (diffPart.added) {
                            annotes += "added ";
                        }
                        else if (diffPart.removed) {
                            annotes += "removed ";
                        }
                        if (diffPart.count) {
                            annotes += `count: ${diffPart.count}`;
                        }
                        console.log(`text: ${diffPart.value} ` + annotes);
                    }
                    console.log(server.mergeTree.toString());
                    console.log(client.mergeTree.toString());
                    return true;
                }
            }
            return false;
        }

        let rounds = initRounds;

        function clientProcessSome(client: MergeTree.Client, all = false) {
            let cliMsgCount = client.q.count();
            let countToApply: number;
            if (all) {
                countToApply = cliMsgCount;
            }
            else {
                countToApply = random.integer(Math.floor(2 * cliMsgCount / 3), cliMsgCount)(mt);
            }
            client.applyMessages(countToApply);
        }

        function serverProcessSome(server: MergeTree.Client, all = false) {
            let svrMsgCount = server.q.count();
            let countToApply: number;
            if (all) {
                countToApply = svrMsgCount;
            }
            else {
                countToApply = random.integer(Math.floor(2 * svrMsgCount / 3), svrMsgCount)(mt);
            }
            return server.applyMessages(countToApply);
        }

        function randomSpateOfInserts(client: MergeTree.Client, charIndex: number) {
            let textLen = randTextLength();
            let text = randomString(textLen, String.fromCharCode(zedCode + ((client.getCurrentSeq() + charIndex) % 50)));
            let preLen = client.getLength();
            let pos = random.integer(0, preLen)(mt);
            if (includeMarkers) {
                server.enqueueMsg(client.makeInsertMarkerMsg("test", ops.MarkerBehaviors.Tile,
                    pos, MergeTree.UnassignedSequenceNumber, client.getCurrentSeq(), ""));
                client.insertMarkerLocal(pos, ops.MarkerBehaviors.Tile,
                    { [MergeTree.reservedTileLabelsKey]: "test" });
            }
            server.enqueueMsg(client.makeInsertMsg(text, pos, MergeTree.UnassignedSequenceNumber,
                client.getCurrentSeq(), server.longClientId));
            client.insertTextLocal(text, pos);
            if (MergeTree.useCheckQ) {
                client.enqueueTestString();
            }
        }

        function randomSpateOfRemoves(client: MergeTree.Client) {
            let dlen = randTextLength();
            let preLen = client.getLength();
            let pos = random.integer(0, preLen)(mt);
            server.enqueueMsg(client.makeRemoveMsg(pos, pos + dlen, MergeTree.UnassignedSequenceNumber,
                client.getCurrentSeq(), server.longClientId));
            client.removeSegmentLocal(pos, pos + dlen);
            if (MergeTree.useCheckQ) {
                client.enqueueTestString();
            }
        }

        function randomWordMove(client: MergeTree.Client) {
            let word1 = findRandomWord(client.mergeTree, client.getClientId());
            if (word1) {
                let removeStart = word1.pos;
                let removeEnd = removeStart + word1.text.length;
                server.enqueueMsg(client.makeRemoveMsg(removeStart, removeEnd, MergeTree.UnassignedSequenceNumber,
                    client.getCurrentSeq(), server.longClientId));
                client.removeSegmentLocal(removeStart, removeEnd);
                if (MergeTree.useCheckQ) {
                    client.enqueueTestString();
                }
                let word2 = findRandomWord(client.mergeTree, client.getClientId());
                while (!word2) {
                    word2 = findRandomWord(client.mergeTree, client.getClientId());
                }
                let pos = word2.pos + word2.text.length;
                server.enqueueMsg(client.makeInsertMsg(word1.text, pos, MergeTree.UnassignedSequenceNumber,
                    client.getCurrentSeq(), server.longClientId));
                client.insertTextLocal(word1.text, pos);
                if (MergeTree.useCheckQ) {
                    client.enqueueTestString();
                }
            }
        }

        let errorCount = 0;

        function asyncRoundStep(asyncInfo: AsyncRoundInfo, roundCount: number) {
            if (asyncInfo.state == AsyncRoundState.Insert) {
                if (!asyncInfo.insertSegmentCount) {
                    asyncInfo.insertSegmentCount = randSmallSegmentCount();
                }
                if (asyncInfo.clientIndex == clients.length) {
                    asyncInfo.state = AsyncRoundState.Remove;
                    asyncInfo.iterIndex = 0;
                }
                else {
                    let client = clients[asyncInfo.clientIndex];
                    if (startFile) {
                        randomWordMove(client);
                    }
                    else {
                        randomSpateOfInserts(client, asyncInfo.iterIndex);
                    }
                    asyncInfo.iterIndex++;
                    if (asyncInfo.iterIndex == asyncInfo.insertSegmentCount) {
                        asyncInfo.clientIndex++;
                        asyncInfo.insertSegmentCount = undefined;
                        asyncInfo.iterIndex = 0;
                    }
                }
            }
            if (asyncInfo.state == AsyncRoundState.Remove) {
                if (!asyncInfo.removeSegmentCount) {
                    asyncInfo.removeSegmentCount = Math.floor(3 * asyncInfo.insertSegmentCount / 4);
                    if (asyncInfo.removeSegmentCount < 1) {
                        asyncInfo.removeSegmentCount = 1;
                    }
                }
                if (asyncInfo.clientIndex == clients.length) {
                    asyncInfo.state = AsyncRoundState.Tail;
                }
                else {
                    let client = clients[asyncInfo.clientIndex];
                    if (startFile) {
                        randomWordMove(client);
                    }
                    else {
                        randomSpateOfInserts(client, asyncInfo.iterIndex);
                    }
                    asyncInfo.iterIndex++;
                    if (asyncInfo.iterIndex == asyncInfo.removeSegmentCount) {
                        asyncInfo.clientIndex++;
                        asyncInfo.removeSegmentCount = undefined;
                        asyncInfo.iterIndex = 0;
                    }
                }
            }
            if (asyncInfo.state == AsyncRoundState.Tail) {
                finishRound(roundCount);
            }
            else {
                setImmediate(asyncRoundStep, asyncInfo, roundCount);
            }
        }

        // function asyncRound(roundCount: number) {
        //     let asyncInfo = <AsyncRoundInfo>{
        //         clientIndex: 0,
        //         iterIndex: 0,
        //         state: AsyncRoundState.Insert
        //     }
        //     setImmediate(asyncRoundStep, asyncInfo, roundCount);
        // }

        let extractSnapTime = 0;
        let extractSnapOps = 0;
        function finishRound(roundCount: number) {
            // process remaining messages
            if (serverProcessSome(server, true)) {
                return;
            }
            for (let client of clients) {
                clientProcessSome(client, true);
            }

            if (measureBookmarks) {
                let bookmarkReadsPerRound = 400;
                let refseq = server.getCurrentSeq();
                let clientId = server.getClientId();
                let clockStart = clock();
                for (let i = 0; i < bookmarkReadsPerRound; i++) {
                    server.mergeTree.getOffset(bookmarks[i].segment, refseq, clientId);
                    bookmarkReads++;
                }
                bookmarkReadTime += elapsedMicroseconds(clockStart);
            }

            if (extractSnap) {
                let clockStart = clock();
                // let snapshot = new Paparazzo.Snapshot(snapClient.mergeTree);
                // snapshot.extractSync();
                extractSnapTime += elapsedMicroseconds(clockStart);
                extractSnapOps++;
            }
            /*          
                        if (checkTextMatch()) {
                            console.log(`round: ${i}`);
                            break;
                        }
            */
            // console.log(server.getText());
            // console.log(server.mergeTree.toString());
            // console.log(server.mergeTree.getStats());
            if (0 == (roundCount % 100)) {
                let clockStart = clock();
                if (checkTextMatch()) {
                    console.log(`round: ${roundCount} BREAK`);
                    errorCount++;
                    return errorCount;
                }
                checkTime += elapsedMicroseconds(clockStart);
                if (verbose) {
                    console.log(`wall clock is ${((Date.now() - startTime) / 1000.0).toFixed(1)}`);
                }
                let stats = server.mergeTree.getStats();
                let liveAve = (stats.liveCount / stats.nodeCount).toFixed(1);
                let posLeaves = stats.leafCount - stats.removedLeafCount;
                let aveExtractSnapTime = "off";
                if (extractSnapOps > 0) {
                    aveExtractSnapTime = (extractSnapTime / extractSnapOps).toFixed(1);
                }
                console.log(`round: ${roundCount} seq ${server.seq} char count ${server.getLength()} height ${stats.maxHeight} lv ${stats.leafCount} rml ${stats.removedLeafCount} p ${posLeaves} nodes ${stats.nodeCount} pop ${liveAve} histo ${stats.histo}`);
                if (extractSnapOps > 0) {
                    aveExtractSnapTime = (extractSnapTime / extractSnapOps).toFixed(1);
                    console.log(`ave extract snap time ${aveExtractSnapTime}`);
                }
                reportTiming(server);
                if (measureBookmarks) {
                    let timePerRead = (bookmarkReadTime/bookmarkReads).toFixed(2);
                    let bookmarksPerSeg = (bookmarkCount/stats.leafCount).toFixed(2);
                    console.log(`bookmark count ${bookmarkCount} ave. per seg ${bookmarksPerSeg} time/read ${timePerRead}`);
                }
                reportTiming(clients[2]);
                let totalTime = server.accumTime + server.accumWindowTime;
                for (let client of clients) {
                    totalTime += (client.accumTime + client.localTime + client.accumWindowTime);
                }
                if (verbose) {
                    console.log(`total time ${(totalTime / 1000000.0).toFixed(1)} check time ${(checkTime / 1000000.0).toFixed(1)}`);
                }
                //console.log(server.getText());
                //console.log(server.mergeTree.toString());
            }
            return errorCount;
        }

        function round(roundCount: number) {
            for (let client of clients) {
                let insertSegmentCount = randSmallSegmentCount();
                for (let j = 0; j < insertSegmentCount; j++) {
                    if (startFile) {
                        randomWordMove(client);
                    }
                    else {
                        randomSpateOfInserts(client, j);
                    }
                }
                if (serverProcessSome(server)) {
                    return;
                }
                clientProcessSome(client);

                let removeSegmentCount = Math.floor(3 * insertSegmentCount / 4);
                if (removeSegmentCount < 1) {
                    removeSegmentCount = 1;
                }
                for (let j = 0; j < removeSegmentCount; j++) {
                    if (startFile) {
                        randomWordMove(client);
                    }
                    else {
                        randomSpateOfRemoves(client);
                        if (includeMarkers) {
                            if (client.getLength() > 200) {
                                randomSpateOfRemoves(client);
                            }
                        }
                    }
                }
                if (serverProcessSome(server)) {
                    return;
                }
                clientProcessSome(client);
            }
            finishRound(roundCount);
        }

        let startTime = Date.now();
        let checkTime = 0;
        let asyncRoundCount = 0;
        let lastSnap = 0;
        // let checkSnapText = true;

        // function snapFinished() {
        //     snapInProgress = false;
        //     let curmin = snapClient.mergeTree.getCollabWindow().minSeq;
        //     console.log(`snap finished round ${asyncRoundCount} server seq ${server.getCurrentSeq()} seq ${snapClient.getCurrentSeq()} minseq ${curmin}`);
        //     let clockStart = clock();
        //     //snapClient.verboseOps = true;
        //     clientProcessSome(snapClient, true);
        //     catchUpTime += elapsedMicroseconds(clockStart);
        //     catchUps++;
        //     if (checkSnapText) {
        //         let serverText = server.getText();
        //         let snapText = snapClient.getText();
        //         if (serverText != snapText) {
        //             console.log(`mismatch @${server.getCurrentSeq()} client @${snapClient.getCurrentSeq()} id: ${snapClient.getClientId()}`);
        //         }
        //     }
        // }

        function ohSnap(filename: string) {
            snapInProgress = true;
            let curmin = snapClient.mergeTree.getCollabWindow().minSeq;
            lastSnap = curmin;
            console.log(`snap started seq ${snapClient.getCurrentSeq()} minseq ${curmin}`);
            // let snapshot = new Paparazzo.Snapshot(snapClient.mergeTree, filename, snapFinished);
            // snapshot.start();
        }

        function asyncStep() {
            round(asyncRoundCount);
            let curmin = server.mergeTree.getCollabWindow().minSeq;
            if ((!snapInProgress) && (lastSnap < curmin)) {
                ohSnap("snapit");
            }
            asyncRoundCount++;
            if (asyncRoundCount < rounds) {
                setImmediate(asyncStep);
            }
        }

        if (asyncExec) {
            ohSnap("snap-initial");
            setImmediate(asyncStep);
        }
        else {
            for (let i = 0; i < rounds; i++) {
                round(i);
                if (errorCount > 0) {
                    break;
                }
            }
            tail();
        }
        function tail() {
            reportTiming(server);
            reportTiming(clients[2]);
            //console.log(server.getText());
            //console.log(server.mergeTree.toString());
        }
        return errorCount;
    }
    return {
        clientServer: clientServer,
        manyMergeTrees: manyMergeTrees
    }
}

let testPack = TestPack();
const filename = path.join(__dirname, "../../public/literature", "pp.txt");

let ppTest = true;
if (ppTest) {
    testPack.clientServer(filename, 100000);
} else {
    testPack.clientServer(undefined, 100000);
}

export class RandomPack {
    mt: Random.MT19937;
    constructor() {
        this.mt = random.engines.mt19937();
        this.mt.seedWithArray([0xdeadbeef, 0xfeedbed]);
    }

    randInteger(min: number, max: number) {
        return random.integer(min, max)(this.mt);
    }

    randString(wordCount: number) {
        let exampleWords = ["giraffe", "hut", "aardvark", "gold", "hover",
            "yurt", "hot", "antelope", "gift", "banana", "book", "airplane",
            "kitten", "moniker", "lemma", "doughnut", "orange", "tangerine"
        ];
        let buf = "";
        for (let i = 0; i < wordCount; i++) {
            let exampleWord = exampleWords[this.randInteger(0, exampleWords.length - 1)];
            if (i > 0) {
                buf += ' ';
            }
            buf += exampleWord;
        }
        return buf;
    }
}

function docNodeToString(docNode: DocumentNode) {
    if (typeof docNode === "string") {
        return docNode;
    } else {
        return docNode.name;
    }
}

export type DocumentNode = string | DocumentTree;
/**
 * Generate and model documents from the following tree grammar:
 * Row -> row[Box*];
 * Box -> box[Content]; 
 * Content -> (Row|Paragraph)*; 
 * Paragraph -> pgtile text; 
 * Document-> Content
 */
export class DocumentTree {
    pos = 0;
    ids = { box: 0, row: 0 };
    id: string;
    static randPack = new RandomPack();

    constructor(public name: string, public children: DocumentNode[]) {
    }

    addToMergeTree(client: MergeTree.Client, docNode: DocumentNode) {
        if (typeof docNode === "string") {
            let text = <string>docNode;
            client.insertTextLocal(text, this.pos);
            this.pos += text.length;
        } else {
            let id: number;
            if (docNode.name === "pg") {
                client.insertMarkerLocal(this.pos, ops.MarkerBehaviors.Tile,
                    {
                        [MergeTree.reservedTileLabelsKey]: [docNode.name],
                    },
                );
                this.pos++;
            } else {
                let trid = docNode.name + this.ids[docNode.name].toString();
                docNode.id = trid;
                id = this.ids[docNode.name]++;
                let props = {
                    [MergeTree.reservedMarkerIdKey]: trid,
                    [MergeTree.reservedRangeLabelsKey]: [docNode.name],
                };
                let behaviors = ops.MarkerBehaviors.RangeBegin;
                if (docNode.name === "row") {
                    props[MergeTree.reservedTileLabelsKey] = ["pg"];
                    behaviors |= ops.MarkerBehaviors.Tile;
                }

                client.insertMarkerLocal(this.pos, behaviors, props);
                this.pos++;
            }
            for (let child of docNode.children) {
                this.addToMergeTree(client, child);
            }
            if (docNode.name !== "pg") {
                let etrid = "end-" + docNode.name + id.toString();
                client.insertMarkerLocal(this.pos, ops.MarkerBehaviors.RangeEnd,
                    {
                        [MergeTree.reservedMarkerIdKey]: etrid,
                        [MergeTree.reservedRangeLabelsKey]: [docNode.name],
                    },
                );
                this.pos++;
            }
        }
    }

    checkStacksAllPositions(client: MergeTree.Client) {
        let errorCount = 0;
        let pos = 0;
        let verbose = false;
        let stacks = {
            box: new Collections.Stack<string>(),
            row: new Collections.Stack<string>()
        };

        function printStack(stack: Collections.Stack<string>) {
            for (let item in stack.items) {
                console.log(item);
            }
        }

        function printStacks() {
            for (let name of ["box", "row"]) {
                console.log(name + ":");
                printStack(stacks[name]);
            }
        }

        function checkTreeStackEmpty(treeStack: Collections.Stack<string>) {
            if (!treeStack.empty()) {
                errorCount++;
                console.log("mismatch: client stack empty; tree stack not");
            }
        }

        let checkNodeStacks = (docNode: DocumentNode) => {
            if (typeof docNode === "string") {
                let text = <string>docNode;
                let epos = pos + text.length;
                if (verbose) {
                    console.log(`stacks for [${pos}, ${epos}): ${text}`);
                    printStacks();
                }
                let cliStacks = client.mergeTree.getStackContext(pos,
                    client.getClientId(), ["box", "row"]);
                for (let name of ["box", "row"]) {
                    let cliStack = cliStacks[name];
                    let treeStack = <Collections.Stack<string>>stacks[name];
                    if (cliStack) {
                        let len = cliStack.items.length;
                        if (len > 0) {
                            if (len !== treeStack.items.length) {
                                console.log(`stack length mismatch cli ${len} tree ${treeStack.items.length}`);
                                errorCount++;
                            }
                            for (let i = 0; i < len; i++) {
                                let cliMarkerId = cliStack.items[i].getId();
                                let treeMarkerId = treeStack.items[i];
                                if (cliMarkerId !== treeMarkerId) {
                                    errorCount++;
                                    console.log(`mismatch index ${i}: ${cliMarkerId} !== ${treeMarkerId} pos ${pos} text ${text}`);
                                    printStack(treeStack);
                                    console.log(client.mergeTree.toString());
                                }
                            }
                        } else {
                            checkTreeStackEmpty(treeStack);
                        }
                    } else {
                        checkTreeStackEmpty(treeStack);
                    }
                }
                pos = epos;
            } else {
                pos++;
                if (docNode.name === "pg") {
                    checkNodeStacks(docNode.children[0]);
                } else {
                    stacks[docNode.name].push(docNode.id);
                    for (let child of docNode.children) {
                        checkNodeStacks(child);
                    }
                    stacks[docNode.name].pop();
                    pos++;
                }
            }
        }

        let prevPos = -1;
        let prevChild: DocumentNode;

        // console.log(client.mergeTree.toString());
        for (let rootChild of this.children) {
            if (prevPos >= 0) {
                if ((typeof prevChild !== "string") && (prevChild.name === "row")) {
                    let id = prevChild.id;
                    let endId = "end-" + id;
                    let endRowMarker = <MergeTree.Marker>client.mergeTree.getSegmentFromId(endId);
                    let endRowPos = client.mergeTree.getOffset(endRowMarker, MergeTree.UniversalSequenceNumber,
                        client.getClientId());
                    prevPos = endRowPos;
                }
                let tilePos = client.mergeTree.findTile(prevPos, client.getClientId(), "pg", false);
                if (tilePos) {
                    if (tilePos.pos !== pos) {
                        errorCount++;
                        console.log(`next tile ${tilePos.tile} found from pos ${prevPos} at ${tilePos.pos} compare to ${pos}`);
                    }
                }
            }
            if (verbose) {
                console.log(`next child ${pos} with name ${docNodeToString(rootChild)}`);
            }
            prevPos = pos;
            prevChild = rootChild;
            // printStacks();
            checkNodeStacks(rootChild);
        }
        return errorCount;
    }

    private generateClient() {
        let client = new MergeTree.Client("", { blockUpdateMarkers: true });
        client.startCollaboration("Fred");
        for (let child of this.children) {
            this.addToMergeTree(client, child);
        }
        return client;
    }

    static test1() {
        let doc = DocumentTree.generateDocument();
        let client = doc.generateClient();
        return doc.checkStacksAllPositions(client);
    }

    static generateDocument() {
        let tree = new DocumentTree("Document", DocumentTree.generateContent(0.6));
        return tree;
    }

    static generateContent(rowProbability: number) {
        let items = <DocumentNode[]>[];
        let docLen = DocumentTree.randPack.randInteger(7, 25);
        for (let i = 0; i < docLen; i++) {
            let rowThreshold = rowProbability * 1000;
            let selector = DocumentTree.randPack.randInteger(1, 1000);
            if (selector >= rowThreshold) {
                let pg = DocumentTree.generateParagraph();
                items.push(pg);
            } else {
                rowProbability /= 2;
                if (rowProbability < 0.08) {
                    rowProbability = 0;
                }
                let row = DocumentTree.generateRow(rowProbability);
                items.push(row);
            }

        }
        return items;
    }

    // model pg tile as tree with single child
    static generateParagraph() {
        let wordCount = DocumentTree.randPack.randInteger(1, 6);
        let text = DocumentTree.randPack.randString(wordCount);
        let pgTree = new DocumentTree("pg", [text]);
        return pgTree;
    }

    static generateRow(rowProbability: number) {
        let items = <DocumentNode[]>[];
        let rowLen = DocumentTree.randPack.randInteger(1, 5);
        for (let i = 0; i < rowLen; i++) {
            let item = DocumentTree.generateBox(rowProbability);
            items.push(item);
        }
        return new DocumentTree("row", items);
    }

    static generateBox(rowProbability: number) {
        return new DocumentTree("box", DocumentTree.generateContent(rowProbability));
    }
}

DocumentTree.test1();

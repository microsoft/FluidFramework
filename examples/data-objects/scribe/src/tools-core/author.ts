/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@fluid-internal/client-api";
import { ILoader } from "@fluidframework/container-definitions";
import { ISharedMap } from "@fluidframework/map";
import * as MergeTree from "@fluidframework/merge-tree";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { ISharedString } from "@fluidframework/sequence";
// eslint-disable-next-line import/no-internal-modules
import queue from "async/queue";

// eslint-disable-next-line import/no-internal-modules
import clone from "lodash/clone";

import Counter = api.RateCounter;

let play: boolean = false;

let metrics: IScribeMetrics;

const ackCounter = new Counter();
const latencyCounter = new Counter();
const pingCounter = new Counter();
const processCounter = new Counter();
const typingCounter = new Counter();
const serverOrderCounter = new Counter();

export interface IAuthor {
    ackCounter: Counter;
    latencyCounter: Counter;
    typingCounter: Counter;
    pingCounter: Counter;
    metrics: IScribeMetrics;
    ss: ISharedString;
}

/**
 * Toggle between play and pause.
 */
export function toggleAuthorPlay() {
    play = !play;
}

/**
 * Processes the input text into a normalized form for the shared string
 */
export function normalizeText(input: string): string {
    let result = "";
    const segments = MergeTree.loadSegments(input, 0);
    for (const segment of segments) {
        result += (segment as MergeTree.TextSegment).text;
    }

    return result;
}

export interface IScribeMetrics {
    // Average latency between when a message is sent and when it is ack'd by the server
    latencyAverage?: number;
    latencyStdDev?: number;
    latencyMinimum?: number;
    latencyMaximum?: number;

    // The rate of both typing messages and receiving replies
    ackRate?: number;
    typingRate?: number;

    // Server ordering performance
    serverAverage?: number;

    // Total number of ops
    totalOps: number;

    // The progress of typing and receiving ack for messages in the range [0,1]
    typingProgress?: number;
    ackProgress?: number;

    time: number;
    textLength: number;

    pingAverage?: number;
    pingMaximum?: number;
    processAverage?: number;

    typingInterval: number;
    writers: number;
}

export declare type ScribeMetricsCallback = (metrics: IScribeMetrics) => void;
export declare type QueueCallback = (metrics: IScribeMetrics, author: IAuthor) => void;

export async function requestSharedString(loader: ILoader, urlBase: string): Promise<ISharedString> {
    const response = await loader.request({ url: `${urlBase}/sharedstring` });
    if (response.status !== 200 || response.mimeType !== "fluid/sharedstring") {
        return Promise.reject(new Error("Invalid document"));
    }

    return response.value as ISharedString;
}

export async function typeFile(
    loader: ILoader,
    urlBase: string,
    runtime: IFluidDataStoreRuntime,
    ss: ISharedString,
    chunkMap: ISharedMap,
    fileText: string,
    intervalTime: number,
    writers: number,
    scribeCallback: ScribeMetricsCallback,
): Promise<IScribeMetrics> {
    const metricsArray: IScribeMetrics[] = [];
    let q: any;

    metrics = {
        ackProgress: undefined,
        ackRate: undefined,
        latencyAverage: undefined,
        latencyMaximum: undefined,
        latencyMinimum: undefined,
        latencyStdDev: undefined,
        pingAverage: undefined,
        pingMaximum: undefined,
        processAverage: undefined,
        serverAverage: undefined,
        textLength: fileText.length,
        time: 0,
        totalOps: 0,
        typingInterval: intervalTime,
        typingProgress: undefined,
        typingRate: undefined,
        writers,
    };

    const m: IScribeMetrics = {
        ackProgress: undefined,
        ackRate: undefined,
        latencyAverage: undefined,
        latencyMaximum: undefined,
        latencyMinimum: undefined,
        latencyStdDev: undefined,
        pingAverage: undefined,
        pingMaximum: undefined,
        processAverage: undefined,
        serverAverage: undefined,
        textLength: fileText.length,
        time: 0,
        totalOps: 0,
        typingInterval: intervalTime,
        typingProgress: undefined,
        typingRate: undefined,
        writers,
    };

    let author: IAuthor = {
        ackCounter: new Counter(),
        latencyCounter: new Counter(),
        metrics: clone(m),
        pingCounter: new Counter(),
        ss,
        typingCounter: new Counter(),
    };
    const authors: IAuthor[] = [author];

    for (let i = 1; i < writers; i++) {
        const sharedString = await requestSharedString(loader, urlBase);
        author = {
            ackCounter: new Counter(),
            latencyCounter: new Counter(),
            metrics: clone(m),
            pingCounter: new Counter(),
            ss: sharedString,
            typingCounter: new Counter(),
        };
        authors.push(author);
    }

    if (writers === 1) {
        const startTime = Date.now();
        typingCounter.reset();
        ackCounter.reset();
        latencyCounter.reset();
        pingCounter.reset();

        // Wait a second before beginning to allow for quiescing
        await new Promise<void>((resolve) => setTimeout(() => resolve(), 1000));

        const metric = await typeChunk(
            authors[0], runtime, "p-0", fileText, intervalTime, scribeCallback, scribeCallback);
        metric.time = Date.now() - startTime;
        return metric;
    } else {
        let totalKeys = 0;
        let curKey = 0;
        const startTime = Date.now();
        typingCounter.reset();
        ackCounter.reset();
        latencyCounter.reset();
        pingCounter.reset();

        return new Promise((resolve, reject) => {
            q = queue(async (chunkKey, queueCallback) => {
                const chunk = chunkMap.get(chunkKey);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const a = authors.shift()!;
                curKey++;
                metrics.typingProgress = curKey / totalKeys;
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                typeChunk(a, runtime, chunkKey, chunk, intervalTime, scribeCallback, queueCallback);
            }, writers);

            for (const chunkKey of chunkMap.keys()) {
                totalKeys++;
                q.push(chunkKey, (
                    metric: IScribeMetrics,
                    a: IAuthor) => {
                    authors.push(a);
                    metricsArray.push(metric);
                });
            }
            q.drain(() => {
                const now = Date.now();
                metrics.time = now - startTime;
                resolve(metricsArray[0]);
            });
        });
    }
}
/**
 * Types the given file into the shared string - starting at the end of the string
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export async function typeChunk(
    a: IAuthor,
    runtime: IFluidDataStoreRuntime,
    chunkKey: string,
    chunk: string,
    intervalTime: number,
    scribeCallback: ScribeMetricsCallback,
    queueCallback: QueueCallback): Promise<IScribeMetrics> {
    return new Promise<IScribeMetrics>((resolve, reject) => {
        let readPosition = 0;
        let totalOps = 0;

        const histogramRange = 5;
        const histogram = new api.Histogram(histogramRange);

        // Trigger a new sample after a second has elapsed
        const samplingRate = 1000;

        let mean = 0;
        let stdDev = 0;

        runtime.deltaManager.on("pong", (latency) => {
            pingCounter.increment(latency);
        });

        runtime.deltaManager.on("op", (_, time) => {
            processCounter.increment(time);
        });

        a.ss.on("op", (message: ISequencedDocumentMessage, local) => {
            totalOps++;
            if (message.traces &&
                message.clientSequenceNumber &&
                message.clientSequenceNumber > 100 &&
                local) {
                ackCounter.increment(1);
                // Wait for at least one cycle
                if (ackCounter.elapsed() > samplingRate) {
                    const rate = ackCounter.getRate() * 1000;
                    metrics.ackRate = rate;
                }

                let clientStart: number = 0;
                let clientEnd: number = 0;
                let orderBegin: number = 0;
                let orderEnd: number = 0;

                for (const trace of message.traces) {
                    if (trace.service === "alfred" && trace.action === "start") {
                        orderBegin = trace.timestamp;
                    } else if (trace.service === "scriptorium" && trace.action === "end") {
                        orderEnd = trace.timestamp;
                    } else if (trace.service === "browser" && trace.action === "start") {
                        clientStart = trace.timestamp;
                    } else if (trace.service === "browser" && trace.action === "end") {
                        clientEnd = trace.timestamp;
                    }
                }

                // Const roundTrip = Date.now() - messageStart.pop();
                const roundTrip = clientEnd - clientStart;
                latencyCounter.increment(roundTrip);
                serverOrderCounter.increment(orderEnd - orderBegin);

                metrics.pingAverage = pingCounter.getValue() / pingCounter.getSamples();
                metrics.pingMaximum = pingCounter.getMaximum();
                metrics.processAverage = processCounter.getValue() / processCounter.getSamples();

                histogram.add(roundTrip);
                const samples = latencyCounter.getSamples();
                metrics.latencyMinimum = latencyCounter.getMinimum();
                metrics.latencyMaximum = latencyCounter.getMaximum();
                metrics.latencyAverage = latencyCounter.getValue() / samples;
                metrics.totalOps = totalOps;

                metrics.serverAverage = serverOrderCounter.getValue() / serverOrderCounter.getSamples();

                // Update std deviation using Welford's method
                stdDev = stdDev + (roundTrip - metrics.latencyAverage) * (roundTrip - mean);
                metrics.latencyStdDev =
                    samples > 1 ? Math.sqrt(stdDev / (samples - 1)) : 0;

                // Store the mean for use in the next round
                mean = metrics.latencyAverage;

                scribeCallback(clone(metrics));
            }
        });

        // Helper method to wrap a string operation with metric tracking for it
        function trackOperation(fn: () => void) {
            typingCounter.increment(1);
            fn();
        }

        function type(): boolean {
            // Stop typing once we reach the end
            if (readPosition === chunk.length) {
                const rate = typingCounter.getRate() * 1000;
                metrics.typingRate = rate;

                resolve(metrics);
                queueCallback(metrics, a);
                return false;
            }
            if (!play) {
                return true;
            }
            const relPosit: MergeTree.IRelativePosition = {
                before: true,
                id: chunkKey,
                offset: 0,
            };

            const pos = a.ss.posFromRelativePos(relPosit);

            // Start inserting text into the string
            let code = chunk.charCodeAt(readPosition);
            if (code === 13) {
                readPosition++;
                code = chunk.charCodeAt(readPosition);
            }

            trackOperation(() => {
                const char = chunk.charAt(readPosition);

                if (code === 10) {
                    a.ss.insertMarker(pos, MergeTree.ReferenceType.Tile,
                        { [MergeTree.reservedTileLabelsKey]: ["pg"] });
                    readPosition++;
                    metrics.typingProgress = readPosition / chunk.length;
                } else {
                    a.ss.insertText(pos, char);
                    readPosition++;
                }
            });

            return true;
        }

        function typeFast() {
            setImmediate(() => {
                if (type()) {
                    typeFast();
                }
            });
        }

        // If the interval time is 0 and we have access to setImmediate (i.e. running in node) then make use of it
        if (intervalTime === 0 && typeof setImmediate === "function") {
            typeFast();
        } else {
            const interval = setInterval(() => {
                for (let i = 0; i < 1; i++) {
                    if (!type()) {
                        clearInterval(interval);
                        break;
                    }
                }
            }, intervalTime);
        }
    });
}

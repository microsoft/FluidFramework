import * as queue from "async/queue";
import clone = require("lodash/clone");
import { api, core, MergeTree, utils } from "../client-api";
import { ICell, IMap } from "../data-types";

let play: boolean = false;

const saveLineFrequency = 5;

const ChartSamples = 10;

let histogramData: ICell;
let performanceData: ICell;
let metrics: IScribeMetrics;

const ackCounter = new utils.RateCounter();
const latencyCounter = new utils.RateCounter();
const pingCounter = new utils.RateCounter();
const typingCounter = new utils.RateCounter();

function padTime(value: number) {
    return `0${value}`.slice(-2);
}

interface IChartData {
    minimum: number[];
    maximum: number[];
    mean: number[];
    stdDev: number[];
    label: string[];
    index: number;
}

/**
 * Toggle between play and pause.
 */
export function togglePlay() {
    play = !play;
}

/**
 * Processes the input text into a normalized form for the shared string
 */
export function normalizeText(input: string): string {
    let result = "";
    const segments = MergeTree.loadSegments(input, 0);
    for (const segment of segments) {
        result += (<MergeTree.TextSegment> segment).text;
    }

    return result;
}

export interface IScribeMetrics {

    // Average latency between when a message is sent and when it is ack'd by the server
    latencyAverage: number;
    latencyStdDev: number;
    latencyMinimum: number;
    latencyMaximum: number;

    // The rate of both typing messages and receiving replies
    ackRate: number;
    typingRate: number;

    // The progress of typing and receiving ack for messages in the range [0,1]
    typingProgress: number;
    ackProgress: number;

    time: number;
    textLength: number;

    pingAverage: number;
    pingMaximum: number;

    typingInterval: number;
    writers: number;
}

export declare type ScribeMetricsCallback = (metrics: IScribeMetrics) => void;
export declare type QueueCallback = (metrics: IScribeMetrics, doc: api.Document, ss: MergeTree.SharedString) => void;

/**
 * Initializes empty chart data
 */
function createChartData(length: number): IChartData {
    const empty = [];
    const emptyLabel = [];
    for (let i = 0; i < length; i++) {
        empty.push(0);
        emptyLabel.push("");
    }

    return {
        index: 0,
        label: emptyLabel,
        maximum: clone(empty),
        mean: clone(empty),
        minimum: clone(empty),
        stdDev: clone(empty),
    };
}

function getChartConfiguration(data: IChartData) {
    const mean = rearrange(data.mean, data.index);
    const stddev = rearrange(data.stdDev, data.index);
    const plusStddev = combine(mean, stddev, (a, b) => a + b);
    const negStddev = combine(mean, stddev, (a, b) => a - b);

    return {
        legend: {
            position: {
                edge: "Top",
                edgePosition: "Minimum",
            },
        },
        series: [
            {
                data: {
                    categoryNames: rearrange(data.label, data.index),
                    values: mean,
                },
                id: "mean",
                layout: "Line",
                title: "Mean",
            },
            {
                data: {
                    values: plusStddev,
                },
                id: "plusstddev",
                layout: "Line",
                title: "+StdDev",
            },
            {
                data: {
                    values: negStddev,
                },
                id: "negstddev",
                layout: "Line",
                title: "-StdDev",
            },
            {
                data: {
                    values: rearrange(data.minimum, data.index),
                },
                id: "minimum",
                layout: "Line",
                title: "Minimum",
            },
            {
                data: {
                    values: rearrange(data.maximum, data.index),
                },
                id: "maximum",
                layout: "Line",
                title: "Maximum",
            },
        ],
        title: {
            position: {
                edge: "Top",
                edgePosition: "Minimum",
            },
            text: "Performance",
        },
    };
}

function getHistogramConfiguration(histogram: utils.Histogram) {
    return {
        series: [
            {
                data: {
                    categoryNames: histogram.buckets.map((bucket, index) => (index * histogram.increment).toString()),
                    values: histogram.buckets,
                },
                id: "buckets",
                layout: "Column Clustered",
                title: "Buckets",
            },
        ],
        title: {
            position: {
                edge: "Top",
                edgePosition: "Minimum",
            },
            text: "Histogram",
        },
    };
}

function rearrange(array: any[], index: number): any[] {
    const arrayClone = clone(array);
    const spliced = arrayClone.splice(0, index + 1);
    return arrayClone.concat(spliced);
}

function combine(first: number[], second: number[], combine: (a, b) => number): number[] {
    const result = [];
    for (let i = 0; i < first.length; i++) {
        result.push(combine(first[i], second[i]));
    }

    return result;
}

async function setMetrics(doc: api.Document) {

    // And also load a canvas document where we will place the metrics
    const metricsDoc = await api.load(`${doc.id}-metrics`);
    const root = await metricsDoc.getRoot().getView();

    const components = metricsDoc.createMap();
    root.set("components", components);

    // Create the two chart windows
    const performanceChart = metricsDoc.createMap();
    components.set("performance", performanceChart);
    performanceChart.set("type", "chart");
    performanceData = metricsDoc.createCell();
    performanceChart.set("size", { width: 760, height: 480 });
    performanceChart.set("position", { x: 10, y: 10 });
    performanceChart.set("data", performanceData);

    const histogramChart = metricsDoc.createMap();
    components.set("histogram", histogramChart);
    histogramData = metricsDoc.createCell();
    histogramChart.set("type", "chart");
    histogramChart.set("size", { width: 760, height: 480 });
    histogramChart.set("position", { x: 790, y: 10 });
    histogramChart.set("data", histogramData);
}

export async function typeFile(
    doc: api.Document,
    ss: MergeTree.SharedString,
    fileText: string,
    intervalTime: number,
    writers: number,
    scribeCallback: ScribeMetricsCallback): Promise<IScribeMetrics> {

        let metricsArray: IScribeMetrics[] = [];
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
            textLength: fileText.length,
            time: 0,
            typingInterval: intervalTime,
            typingProgress: undefined,
            typingRate: undefined,
            writers,
        };

        await setMetrics(doc);

        if (writers === 1) {
            console.log("Single File");
            let startTime = Date.now();
            typingCounter.reset();
            ackCounter.reset();
            latencyCounter.reset();
            pingCounter.reset();
            return typeChunk(doc, ss, "p-0", fileText, intervalTime, scribeCallback, scribeCallback)
                .then((metric) => {
                    metric.time = Date.now() - startTime;
                    return metric;
                });
        } else {
            console.log("Multi-Author");

            let docList: api.Document[] = [doc];
            let ssList: MergeTree.SharedString[] = [ss];
            for (let i = 1; i < writers; i++ ) {
                docList.push(await api.load(doc.id));
                ssList.push(await docList[i].getRoot().get("text") as MergeTree.SharedString);
            }

            return (doc.getRoot().get("chunks") as Promise<IMap>)
                .then((chunkMap) => {
                    return chunkMap.getView();
                })
                .then((chunkView) => {
                    let totalKeys = 0;
                    let curKey = 0;
                    let startTime = Date.now();
                    typingCounter.reset();
                    ackCounter.reset();
                    latencyCounter.reset();
                    pingCounter.reset();

                    return new Promise((resolve, reject) => {
                        q = queue(async (chunkKey, queueCallback) => {
                            let chunk = chunkView.get(chunkKey);
                            let newDoc = docList.shift();
                            const newSs = ssList.shift();
                            curKey++;
                            metrics.typingProgress = curKey / totalKeys;
                            typeChunk(newDoc, newSs, chunkKey, chunk, intervalTime, scribeCallback, queueCallback).then;
                        }, writers);

                        for (let chunkKey of chunkView.keys()) {
                            totalKeys++;
                            q.push(chunkKey, (
                                    metric: IScribeMetrics,
                                    document: api.Document,
                                    sharedString: MergeTree.SharedString) => {
                                docList.push(document);
                                ssList.push(sharedString);
                                metricsArray.push(metric);
                            });
                        }
                        q.drain = () => {
                            let now = Date.now();
                            metrics.time = now - startTime;
                            resolve(metricsArray[0]);
                        };
                    });
                })
                .catch((error) => {
                    console.log("No Chunk Map: " + error);
                    return null;
                });
        }
}

/**
 * Types the given file into the shared string - starting at the end of the string
 */
export async function typeChunk(
    doc: api.Document,
    ss: MergeTree.SharedString,
    chunkKey: string,
    chunk: string,
    intervalTime: number,
    scribeCallback: ScribeMetricsCallback,
    queueCallback: QueueCallback): Promise<IScribeMetrics> {

    return new Promise<IScribeMetrics>((resolve, reject) => {
        let readPosition = 0;
        let lineNumber = 0;

        const histogramRange = 5;
        const histogram = new utils.Histogram(histogramRange);

        // Trigger a new sample after a second has elapsed
        const samplingRate = 1000;

        const messageStart: number[] = [];

        let mean = 0;
        let stdDev = 0;

        // Compute and update the metrics as time progresses
        const chartData = createChartData(ChartSamples);
        const metricsInterval = setInterval(() => {
            if (metrics && metrics.latencyStdDev !== undefined) {
                const now = new Date();
                const index = chartData.index;
                chartData.label[index] =
                    `${padTime(now.getHours())}:${padTime(now.getMinutes())}:${padTime(now.getSeconds())}`;
                chartData.maximum[index] = metrics.latencyMaximum;
                chartData.mean[index] = metrics.latencyAverage;
                chartData.minimum[index] = metrics.latencyMinimum;
                chartData.stdDev[index] = metrics.latencyStdDev;

                performanceData.set(getChartConfiguration(chartData));
                histogramData.set(getHistogramConfiguration(histogram));

                chartData.index = (chartData.index + 1) % chartData.maximum.length;
            }
        }, 1000);

        ss.on("op", (message: core.ISequencedObjectMessage) => {
            if (message.clientSequenceNumber &&
                message.clientSequenceNumber > 10 &&
                message.clientId === doc.clientId) {

                ackCounter.increment(1);
                // Wait for at least one cycle
                if (ackCounter.elapsed() > samplingRate) {
                    const rate = ackCounter.getRate() * 1000;
                    metrics.ackRate = rate;
                }

                // Wait for a bit prior to starting the running calculation
                if (messageStart.length > 25) {
                    const roundTrip = Date.now() - messageStart.pop();
                    latencyCounter.increment(roundTrip);

                    if (message.traces.length === 8 && message.traces[7].service === "ping") {
                        pingCounter.increment(message.traces[7].timestamp - message.traces[0].timestamp);
                    }

                    metrics.pingAverage = pingCounter.getValue() / pingCounter.getSamples();
                    metrics.pingMaximum = pingCounter.getMaximum();

                    histogram.add(roundTrip);
                    const samples = latencyCounter.getSamples();
                    metrics.latencyMinimum = latencyCounter.getMinimum();
                    metrics.latencyMaximum = latencyCounter.getMaximum();
                    metrics.latencyAverage = latencyCounter.getValue() / samples;

                    // Update std deviation using Welford's method
                    stdDev = stdDev + (roundTrip - metrics.latencyAverage) * (roundTrip - mean);
                    metrics.latencyStdDev =
                        samples > 1 ? Math.sqrt(stdDev / (samples - 1)) : 0;

                    // Store the mean for use in the next round
                    mean = metrics.latencyAverage;
                }

                scribeCallback(clone(metrics));
            }
        });

        // Helper method to wrap a string operation with metric tracking for it
        function trackOperation(fn: () => void) {
            typingCounter.increment(1);
            fn();
            messageStart.push(Date.now());
        }

        function type(): boolean {
            // Stop typing once we reach the end
            if (readPosition === chunk.length) {
                const rate = typingCounter.getRate() * 1000;
                metrics.typingRate = rate;

                clearInterval(metricsInterval);
                resolve(metrics);
                queueCallback(metrics, doc, ss);
                return false;
            }
            if (!play) {
                return true;
            }
            let pos: number;
            let relPosit: MergeTree.IRelativePosition = {
                before: true,
                id: chunkKey,
                offset: 0,
            };

            pos = ss.client.mergeTree.posFromRelativePos(relPosit);

            // Start inserting text into the string
            let code = chunk.charCodeAt(readPosition);
            if (code === 13) {
                readPosition++;
                code = chunk.charCodeAt(readPosition);
            }

            trackOperation(() => {
                let char = chunk.charAt(readPosition);

                if (code === 10) {
                    ss.insertMarker(pos, MergeTree.ReferenceType.Tile,
                        {[MergeTree.reservedTileLabelsKey]: ["pg"]});
                    readPosition++;
                    ++lineNumber;
                    if (lineNumber % saveLineFrequency === 0) {
                        doc.save(`Line ${lineNumber}`);
                    }
                    metrics.typingProgress = readPosition / chunk.length;
                } else {
                    ss.insertText(char, pos);
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

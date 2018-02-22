import clone = require("lodash/clone");
import { api, core, MergeTree, utils } from "../client-api";

let document: api.Document;
let sharedString: MergeTree.SharedString;
let play: boolean = false;

const saveLineFrequency = 5;

export interface IScribeMetrics {

    // Average latency between when a message is sent and when it is ack'd by the server
    latencyAverage: number;
    latencyStdDev: number;
    latencyMinimum: number;
    latencyMaximum: number;

    // The rate of both typing messages and receiving replies
    ackRate: number;
    typingRate: number;

    // The progress of typing and reciving ack for messages in the range [0,1]
    typingProgress: number;
    ackProgress: number;

    time: number;
    textLength: number;
}

interface IChartData {
    minimum: number[];
    maximum: number[];
    mean: number[];
    stdDev: number[];
    label: string[];
    index: number;
}

export declare type ScribeMetricsCallback = (metrics: IScribeMetrics) => void;

const RunningCalculationDelay = 10000;

const ChartSamples = 10;

function padTime(value: number) {
    return `0${value}`.slice(-2);
}

/**
 * Processes the input text into a normalized form for the shared string
 */
function normalizeText(input: string): string {
    let result = "";
    const segments = MergeTree.loadSegments(input, 0);
    for (const segment of segments) {
        result += (<MergeTree.TextSegment> segment).text;
    }

    return result;
}

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

/**
 * Types the given file into the shared string - starting at the end of the string
 */
async function typeFile(
    doc: api.Document,
    ss: MergeTree.SharedString,
    fileText: string,
    intervalTime: number,
    callback: ScribeMetricsCallback): Promise<IScribeMetrics> {

    // And also load a canvas document where we will place the metrics
    const metricsDoc = await api.load(`${doc.id}-metrics`);
    const root = await metricsDoc.getRoot().getView();

    const components = metricsDoc.createMap();
    root.set("components", components);

    // Create the two chart windows
    const performanceChart = metricsDoc.createMap();
    components.set("performance", performanceChart);
    performanceChart.set("type", "chart");
    const performanceData = metricsDoc.createCell();
    performanceChart.set("size", { width: 760, height: 480 });
    performanceChart.set("position", { x: 10, y: 10 });
    performanceChart.set("data", performanceData);

    const histogramChart = metricsDoc.createMap();
    components.set("histogram", histogramChart);
    const histogramData = metricsDoc.createCell();
    histogramChart.set("type", "chart");
    histogramChart.set("size", { width: 760, height: 480 });
    histogramChart.set("position", { x: 790, y: 10 });
    histogramChart.set("data", histogramData);

    const startTime = Date.now();

    return new Promise<IScribeMetrics>((resolve, reject) => {
        let insertPosition = ss.client.getLength();
        let readPosition = 0;
        let lineNumber = 0;

        const histogramRange = 5;
        const histogram = new utils.Histogram(histogramRange);

        fileText = normalizeText(fileText);
        const metrics: IScribeMetrics = {
            ackProgress: undefined,
            ackRate: undefined,
            latencyAverage: undefined,
            latencyMaximum: undefined,
            latencyMinimum: undefined,
            latencyStdDev: undefined,
            textLength: fileText.length,
            time: 0,
            typingProgress: undefined,
            typingRate: undefined,
        };

        // Trigger a new sample after a second has elapsed
        const samplingRate = 1000;

        const ackCounter = new utils.RateCounter();
        ackCounter.reset();
        const latencyCounter = new utils.RateCounter();
        latencyCounter.reset();
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
            if (message.clientSequenceNumber && message.clientId === doc.clientId) {

                ackCounter.increment(1);
                if (ackCounter.elapsed() > samplingRate) {
                    const rate = ackCounter.getRate() * 1000;
                    metrics.ackRate = rate;
                    ackCounter.reset();
                }

                // Wait for a bit prior to starting the running calculation
                if (Date.now() - startTime > RunningCalculationDelay) {
                    const roundTrip = Date.now() - messageStart.pop();
                    latencyCounter.increment(roundTrip);
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

                // We need a better way of hearing when our messages have been received and processed.
                // For now I just assume we are the only writer and wait to receive a message with a client
                // sequence number greater than the number of submitted operations.
                if (message.clientSequenceNumber >= fileText.length) {
                    const endTime = Date.now();
                    clearInterval(metricsInterval);
                    metrics.time = endTime - startTime;
                    resolve(metrics);
                }

                // Notify of change in metrics
                metrics.ackProgress = message.clientSequenceNumber / fileText.length;

                callback(clone(metrics));
            }
        });

        const typingCounter = new utils.RateCounter();
        typingCounter.reset();

        // Helper method to wrap a string operation with metric tracking for it
        function trackOperation(fn: () => void) {
            typingCounter.increment(1);
            if (typingCounter.elapsed() > samplingRate) {
                const rate = typingCounter.getRate() * 1000;
                metrics.typingRate = rate;
                typingCounter.reset();
            }
            fn();
            messageStart.push(Date.now());
        }

        function type(): boolean {
            // Stop typing once we reach the end
            if (readPosition === fileText.length) {
                return false;
            }
            if (!play) {
                return true;
            }
            if (ss.client.getLength() === 0) {
                // pg marker that will remain at end of text
                ss.insertMarker(insertPosition, MergeTree.ReferenceType.Tile,
                    {[MergeTree.reservedTileLabelsKey]: ["pg"]});
            }
            // Start inserting text into the string
            let code = fileText.charCodeAt(readPosition);
            if (code === 13) {
                readPosition++;
                code = fileText.charCodeAt(readPosition);
            }
            trackOperation(() => {
                if (code === 10) {
                    ss.insertMarker(insertPosition++, MergeTree.ReferenceType.Tile,
                    {[MergeTree.reservedTileLabelsKey]: ["pg"]});
                    readPosition++;
                    ++lineNumber;
                    if (lineNumber % saveLineFrequency === 0) {
                        doc.save(`Line ${lineNumber}`);
                    }
                } else {
                    ss.insertText(fileText.charAt(readPosition++), insertPosition++);
                }
            });

            metrics.typingProgress = readPosition / fileText.length;
            callback(metrics);

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

export async function create(id: string): Promise<void> {
    // Load the shared string extension we will type into
    document = await api.load(id);
    const root = await document.getRoot().getView();

    root.set("presence", document.createMap());
    sharedString = document.createString() as MergeTree.SharedString;

    /*
    const segments = MergeTree.loadSegments(" ", 0, true);
    for (const segment of segments) {
        if (segment.getType() === MergeTree.SegmentType.Text) {
            let textSegment = <MergeTree.TextSegment> segment;
            sharedString.insertText(textSegment.text, sharedString.client.getLength(),
                textSegment.properties);
        } else {
            // assume marker
            let marker = <MergeTree.Marker> segment;
            sharedString.insertMarker(sharedString.client.getLength(), marker.behaviors, marker.properties);
        }
    }*/

    root.set("text", sharedString);
    return Promise.resolve();
}

export async function type(
    intervalTime: number,
    text: string,
    callback: ScribeMetricsCallback): Promise<IScribeMetrics> {

    // Type the file.
    return new Promise<IScribeMetrics>((resolve, reject) => {
        typeFile(document, sharedString, text, intervalTime, callback).then(
            (metrics) => {
                resolve(metrics);
            },
            (error) => {
                reject(error);
            });
    });
}

/**
 * Toggle between play and pause.
 */
export function togglePlay() {
    play = !play;
}

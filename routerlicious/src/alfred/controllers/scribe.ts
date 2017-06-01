import * as _ from "lodash";
import * as socketStorage from "../../socket-storage";
import { Histogram } from "../../utils/counters";
import * as scribe from "../../utils/scribe";

// Mark socket storage as our default provider
socketStorage.registerAsDefault(document.location.origin);

// Easy access to a couple of page elements
const form = document.getElementById("text-form") as HTMLFormElement;
const inputElement = document.getElementById("file") as HTMLInputElement;
const createButton = document.getElementById("create") as HTMLButtonElement;
const createDetails = document.getElementById("create-details") as HTMLElement;
const sharedTextId = document.getElementById("shared-text-id") as HTMLInputElement;
const intervalElement = document.getElementById("interval") as HTMLInputElement;
const documentLink = document.getElementById("document-link") as HTMLAnchorElement;
const typingProgress = document.getElementById("typing-progress") as HTMLElement;
const typingProgressBar = typingProgress.getElementsByClassName("progress-bar")[0] as HTMLElement;
const ackProgress = document.getElementById("ack-progress") as HTMLElement;
const ackProgressBar = ackProgress.getElementsByClassName("progress-bar")[0] as HTMLElement;

// Text represents the loaded file text
let text: string;
let lastMetrics: scribe.IScribeMetrics;

// tslint:disable-next-line:no-string-literal
const Microsoft = window["Microsoft"];
let host = new Microsoft.Charts.Host({ base: "https://charts.microsoft.com" });

const ChartSamples = 10;

interface IChartData {
    minimum: number[];
    maximum: number[];
    mean: number[];
    stdDev: number[];
    label: string[];
    index: number;
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
        maximum: _.clone(empty),
        mean: _.clone(empty),
        minimum: _.clone(empty),
        stdDev: _.clone(empty),
    };
}

inputElement.addEventListener(
    "change",
    () => {
        handleFiles(inputElement.files);
    },
    false);

function updateProgressBar(progressBar: HTMLElement, progress: number) {
    if (progress !== undefined) {
        progressBar.style.width = `${(100 * progress).toFixed(2)}%`;
        if (progress === 1) {
            progressBar.classList.remove("active");
        }
    }
}

function resetProgressBar(progressBar: HTMLElement) {
    progressBar.style.width = "0%";
    progressBar.classList.add("active");
}

function updateMetrics(metrics: scribe.IScribeMetrics) {
    lastMetrics = _.clone(metrics);

    updateProgressBar(ackProgressBar, metrics.ackProgress);
    updateProgressBar(typingProgressBar, metrics.typingProgress);

    if (metrics.ackRate) {
        document.getElementById("ack-rate").innerText =
            `Ack rate: ${(metrics.ackRate).toFixed(2)} characters/second`;
    }

    if (metrics.latencyAverage) {
        document.getElementById("avg-latency").innerText =
            `Average latency: ${(metrics.latencyAverage).toFixed(2)} ms`;
    }

    if (metrics.latencyStdDev) {
        document.getElementById("stddev-latency").innerText =
            `Standard deviation: ${(metrics.latencyStdDev).toFixed(2)} ms`;
    }

    if (metrics.typingRate) {
        document.getElementById("typing-rate").innerText =
            `Typing rate: ${(metrics.typingRate).toFixed(2)} characters/second`;
    }
}

function rearrange(array: any[], index: number): any[] {
    const clone = _.clone(array);
    const spliced = clone.splice(0, index + 1);
    return clone.concat(spliced);
}

function combine(first: number[], second: number[], combine: (a, b) => number): number[] {
    const result = [];
    for (let i = 0; i < first.length; i++) {
        result.push(combine(first[i], second[i]));
    }

    return result;
}

function padTime(value: number) {
    return `0${value}`.slice(-2);
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
        size: {
            height: 480,
            width: 768,
        },
        title: {
            position: {
                edge: "Top",
                edgePosition: "Minimum",
            },
            text: "Performance",
        },
    };
}

function getHistogramConfiguration(histogram: Histogram) {
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
        size: {
            height: 480,
            width: 768,
        },
        title: {
            position: {
                edge: "Top",
                edgePosition: "Minimum",
            },
            text: "Histogram",
        },
    };
}

form.addEventListener("submit", (event) => {
    const id = sharedTextId.value;
    const intervalTime = Number.parseInt(intervalElement.value);

    // Initialize the scribe progress UI
    documentLink.href = `/sharedText/${id}`;
    documentLink.innerText = documentLink.href;
    resetProgressBar(ackProgressBar);
    resetProgressBar(typingProgressBar);
    createDetails.classList.remove("hidden");

    // Start typing and register to update the UI
    const typeP = scribe.type(id, intervalTime, text, updateMetrics);

    // Remove any old child divs and then add a new one
    const chartHolder = document.getElementById("chart");
    chartHolder.innerHTML = "";
    const chartDiv = document.createElement("div");
    chartHolder.appendChild(chartDiv);

    const histogramHolder = document.getElementById("histogram");
    histogramHolder.innerHTML = "";
    const histogramDiv = document.createElement("div");
    histogramHolder.appendChild(histogramDiv);

    const chart = new Microsoft.Charts.Chart(host, chartDiv);
    chart.setRenderer(Microsoft.Charts.IvyRenderer.Svg);
    const histogram = new Microsoft.Charts.Chart(host, histogramDiv);
    histogram.setRenderer(Microsoft.Charts.IvyRenderer.Svg);

    const chartData = createChartData(ChartSamples);
    const interval = setInterval(() => {
        if (lastMetrics && lastMetrics.latencyStdDev !== undefined) {
            const now = new Date();
            const index = chartData.index;
            chartData.label[index] =
                `${padTime(now.getHours())}:${padTime(now.getMinutes())}:${padTime(now.getSeconds())}`;
            chartData.maximum[index] = lastMetrics.latencyMaximum;
            chartData.mean[index] = lastMetrics.latencyAverage;
            chartData.minimum[index] = lastMetrics.latencyMinimum;
            chartData.stdDev[index] = lastMetrics.latencyStdDev;
            chart.setConfiguration(getChartConfiguration(chartData));
            chartData.index = (chartData.index + 1) % chartData.maximum.length;

            histogram.setConfiguration(getHistogramConfiguration(lastMetrics.histogram));
        }
    }, 1000);

    // Output the total time once typing is finished
    typeP.then(
        (time) => {
            document.getElementById("total-time").innerText =
                `Total time: ${(time / 1000).toFixed(2)} seconds`;
            clearInterval(interval);
            console.log("Done typing file");
        },
        (error) => {
            clearInterval(interval);
            console.error(error);
        });

    event.preventDefault();
    event.stopPropagation();
});

function handleFiles(files: FileList) {
    if (files.length !== 1) {
        createButton.classList.add("hidden");
        createDetails.classList.add("hidden");
        return;
    }

    // prep the file reader to process the selected file
    const reader = new FileReader();
    reader.onload = (event) => {
        // After loading the file show the create button
        text = reader.result;
        createButton.classList.remove("hidden");
    };

    // Read the selected file
    const file = files.item(0);
    reader.readAsText(file);
}

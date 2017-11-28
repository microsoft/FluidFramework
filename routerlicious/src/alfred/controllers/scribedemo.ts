import * as request from "request";
import * as url from "url";
import { socketStorage } from "../../client-api";
import * as scribe from "../../utils/scribe";

// Text represents the loaded file text
let text: string;
let id: string;
let intervalTime: number;
let initialRun: boolean = true;

function downloadRawText(textUrl: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        request.get(url.resolve(document.baseURI, textUrl), (error, response, body: string) => {
            if (error) {
                reject(error);
            } else if (response.statusCode !== 200) {
                reject(response.statusCode);
            } else {
                resolve(body);
            }
        });
    });
}

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

function updateMetrics(metrics: scribe.IScribeMetrics, ackProgressBar: HTMLElement, typingProgressBar: HTMLElement) {
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

export function initialize(config: any, textId: string, template: string) {
    id = textId;
    // Easy access to a few page elements
    const textForm = document.getElementById("text-form") as HTMLFormElement;
    const startForm = document.getElementById("start-form") as HTMLFormElement;
    const createButton = document.getElementById("create") as HTMLButtonElement;
    const startButton = document.getElementById("start") as HTMLButtonElement;
    const createDetails = document.getElementById("create-details") as HTMLElement;
    const typingDetails = document.getElementById("typing-details") as HTMLElement;
    const intervalElement = document.getElementById("interval") as HTMLInputElement;
    const documentLink = document.getElementById("document-link") as HTMLAnchorElement;
    const typingProgress = document.getElementById("typing-progress") as HTMLElement;
    const typingProgressBar = typingProgress.getElementsByClassName("progress-bar")[0] as HTMLElement;
    const ackProgress = document.getElementById("ack-progress") as HTMLElement;
    const ackProgressBar = ackProgress.getElementsByClassName("progress-bar")[0] as HTMLElement;

    textForm.addEventListener("submit", (event) => {
        intervalTime = Number.parseInt(intervalElement.value);

        const scribeP =  scribe.create(id);
        scribeP.then(() => {
            // Initialize the scribe link UI
            documentLink.href = `/sharedText/${id}`;
            documentLink.innerText = documentLink.href;

            const metricsLink = document.getElementById("metrics-link") as HTMLAnchorElement;
            metricsLink.href = `/canvas/${id}-metrics`;
            metricsLink.innerText = metricsLink.href;

            startButton.classList.remove("hidden");
            createDetails.classList.remove("hidden");
            createButton.classList.add("hidden");

            downloadRawText(template).then((rawText) => {
                text = rawText;
            }, (error) => {
                console.log(`Error downloading document ${error}`);
            });

        }, (err) => {
            console.log(`Error creating empty document ${err}`);
        });
        event.preventDefault();
        event.stopPropagation();
    });

    startForm.addEventListener("submit", (event) => {
        scribe.togglePlay();

        if (initialRun) {
            // Initialize the scribe progress UI.
            resetProgressBar(ackProgressBar);
            resetProgressBar(typingProgressBar);
            typingDetails.classList.remove("hidden");

            // Start typing and register to update the UI
            const typeP = scribe.type(
                intervalTime,
                text,
                (metrics) => updateMetrics(metrics, ackProgressBar, typingProgressBar));

            // Output the total time once typing is finished
            typeP.then(
                (time) => {
                    document.getElementById("total-time").innerText =
                        `Total time: ${(time / 1000).toFixed(2)} seconds`;
                    console.log("Done typing file");
                },
                (error) => {
                    console.error(error);
                });
            initialRun = false;
        }

        const buttonText = startButton.innerText;
        buttonText === "Start" ? startButton.innerText = "Pause" : startButton.innerText = "Start";

        event.preventDefault();
        event.stopPropagation();
    });

    // Mark socket storage as our default provider
    socketStorage.registerAsDefault(document.location.origin, config.blobStorageUrl, config.repository);
}

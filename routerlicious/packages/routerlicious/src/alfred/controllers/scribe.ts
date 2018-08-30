import * as request from "request";
import * as url from "url";
import { socketStorage } from "../../client-api";
import { IScribeMetrics } from "../../utils/author";
import * as scribe from "../../utils/scribe";

// Text represents the loaded file text
let text: string;
let intervalTime: number;
let authorCount: number;
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

function updateMetrics(metrics: IScribeMetrics, ackProgressBar: HTMLElement, typingProgressBar: HTMLElement) {
    if (authorCount === 1) {
        updateProgressBar(ackProgressBar, metrics.ackProgress);
        updateProgressBar(typingProgressBar, metrics.typingProgress);
    }

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

    if (metrics.serverAverage) {
        document.getElementById("server-latency").innerText =
            `Server latency (local orderer only): ${(metrics.serverAverage).toFixed(2)} ms`;
    }

    if (metrics.pingAverage) {
        document.getElementById("avg-ping").innerText =
            `Ping: ${(metrics.pingAverage).toFixed(2)} ms`;
    }

    if (metrics.totalOps) {
        document.getElementById("total-ops").innerText =
            `Total Ops: ${(metrics.totalOps).toFixed(2)}`;
    }

    if (metrics.processAverage) {
        document.getElementById("avg-process").innerText =
            `Process time: ${(metrics.processAverage).toFixed(2)}`;
    }
}

function handleFiles(createButton: HTMLButtonElement,
                     startButton: HTMLButtonElement,
                     createDetails: HTMLElement,
                     files: FileList) {
    if (files.length !== 1) {
        createButton.classList.add("hidden");
        startButton.classList.add("hidden");
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

function addLink(element: HTMLDivElement, link: string) {
    const anchor = document.createElement("a");
    anchor.href = link;
    anchor.innerText = anchor.href;
    anchor.target = "_blank";
    element.appendChild(anchor);
    element.appendChild(document.createElement("br"));
}

export function initialize(
    config: any,
    id: string,
    token: string,
    metricsToken: string,
    template: string,
    speed: number,
    authors: number,
    languages: string) {
    const loadFile = !id;

    // Easy access to a couple of page elements
    const textForm = document.getElementById("text-form") as HTMLFormElement;
    const startForm = document.getElementById("start-form") as HTMLFormElement;
    const createButton = document.getElementById("create") as HTMLButtonElement;
    const startButton = document.getElementById("start") as HTMLButtonElement;
    const createDetails = document.getElementById("create-details") as HTMLElement;
    const typingDetails = document.getElementById("typing-details") as HTMLElement;
    const intervalElement = document.getElementById("interval") as HTMLInputElement;
    const translationElement = document.getElementById("translation") as HTMLInputElement;
    const authorElement = document.getElementById("authors") as HTMLInputElement;
    const typingProgress = document.getElementById("typing-progress") as HTMLElement;
    const typingProgressBar = typingProgress.getElementsByClassName("progress-bar")[0] as HTMLElement;
    const ackProgress = document.getElementById("ack-progress") as HTMLElement;
    const ackProgressBar = ackProgress.getElementsByClassName("progress-bar")[0] as HTMLElement;

    // Set the speed and translation elements
    intervalElement.value = speed.toString();
    authorElement.value = authors.toString();
    if (translationElement) {
        translationElement.value = languages;
    }

    if (loadFile) {
        const inputElement = document.getElementById("file") as HTMLInputElement; // BINGO
        inputElement.addEventListener(
            "change",
            () => {
                handleFiles(createButton, startButton, createDetails, inputElement.files);
            },
            false);
    } else {
        downloadRawText(template).then((rawText) => {
            text = rawText;
            createButton.classList.remove("hidden");
        }, (error) => {
            console.log(`Error downloading document ${error}`);
        });
    }

    textForm.addEventListener("submit", (event) => {
        if (!id) {
            const sharedTextId = document.getElementById("shared-text-id") as HTMLInputElement;
            id = sharedTextId.value;
        }

        intervalTime = Number.parseInt(intervalElement.value, 10);
        authorCount = Number.parseInt(authorElement.value, 10);
        const scribeP = scribe.create(id, token, text);

        scribeP.then(() => {
            const linkList = document.getElementById("link-list") as HTMLDivElement;

            addLink(linkList, `/sharedText/${id}`);
            addLink(linkList, `/canvas/${id}-metrics`);
            addLink(linkList, `/maps/${id}`);

            if (languages) {
                linkList.appendChild(document.createElement("br"));
                const translationDiv = document.createElement("div");
                translationDiv.innerText = "Translations";
                linkList.appendChild(translationDiv);
                for (const language of languages.split(",")) {
                    addLink(linkList, `/sharedText/${id}?language=${language}`);
                }
            }

            startButton.classList.remove("hidden");
            createDetails.classList.remove("hidden");
            createButton.classList.add("hidden");
        }, (err) => {
            console.log(err);
        });
        event.preventDefault();
        event.stopPropagation();
    });

    startForm.addEventListener("submit", (event) => {
        scribe.togglePlay();

        if (initialRun) {
            // Initialize the scribe progress UI.
            if (authorCount === 1 ) {
                resetProgressBar(ackProgressBar);
                resetProgressBar(typingProgressBar);
            } else {
                ackProgress.classList.add("hidden");
                typingProgress.classList.add("hidden");
            }
            typingDetails.classList.remove("hidden");

            // Start typing and register to update the UI
            const typeP = scribe.type(
                intervalTime,
                text,
                authorCount,
                1,
                token,
                metricsToken,
                (metrics) => updateMetrics(metrics, ackProgressBar, typingProgressBar));

            // Output the total time once typing is finished
            typeP.then(
                (time) => {
                    document.getElementById("total-time").innerText =
                        `Total time: ${(time.time / 1000).toFixed(2)} seconds`;
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
    socketStorage.registerAsDefault(
        document.location.origin,
        config.blobStorageUrl,
        config.tenantId,
        config.trackError);
}

import * as socketStorage from "../../socket-storage";
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
    updateProgressBar(ackProgressBar, metrics.ackProgress);
    updateProgressBar(typingProgressBar, metrics.typingProgress);

    if (metrics.ackRate) {
        document.getElementById("ack-rate").innerText =
            `Ack rate: ${(metrics.ackRate).toFixed(2)} characters/second`;
    }

    if (metrics.averageLatency) {
        document.getElementById("avg-latency").innerText =
            `Average latency: ${(metrics.averageLatency).toFixed(2)} ms`;
    }

    if (metrics.typingRate) {
        document.getElementById("typing-rate").innerText =
            `Typing rate: ${(metrics.typingRate).toFixed(2)} characters/second`;
    }
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

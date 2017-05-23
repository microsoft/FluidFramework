import * as api from "../../api";
import * as SharedString from "../../merge-tree";
import * as socketStorage from "../../socket-storage";

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
const ackProgress = document.getElementById("ack-progress") as HTMLElement;

// Text represents the loaded file text
let text: string;

inputElement.addEventListener(
    "change",
    () => {
        handleFiles(inputElement.files);
    },
    false);

form.addEventListener("submit", (event) => {
    create();
    event.preventDefault();
    event.stopPropagation();
});

/**
 * Processes the input text into a normalized form for the shared string
 */
function normalizeText(input: string): string {
    let result = "";
    const segments = SharedString.loadSegments(input, 0);
    for (const segment of segments) {
        result += (<SharedString.TextSegment> segment).text;
    }

    return result;
}

/**
 * Simple class to help sample rate based counters
 */
class RateCounter {
    private start: number;
    private value = 0;

    public increment(value: number) {
        this.value += value;
    }

    /**
     * Starts the counter
     */
    public reset() {
        this.value = 0;
        this.start = Date.now();
    }

    public elapsed(): number {
        return Date.now() - this.start;
    }

    /**
     * Returns the total accumulated value
     */
    public getValue(): number {
        return this.value;
    }

    /**
     * Returns the rate for the counter
     */
    public getRate(): number {
        return this.value / this.elapsed();
    }
};

/**
 * Types the given file into the shared string - starting at the end of the string
 */
function typeFile(sharedString: SharedString.SharedString, fileText: string, intervalTime: number): Promise<number> {
    createDetails.classList.remove("hidden");

    // Initialize progress bars
    const ackProgressBar = ackProgress.getElementsByClassName("progress-bar")[0] as HTMLElement;
    ackProgressBar.style.width = "0%";
    ackProgressBar.classList.add("active");
    const typingProgressBar = typingProgress.getElementsByClassName("progress-bar")[0] as HTMLElement;
    typingProgressBar.style.width = "0%";
    typingProgressBar.classList.add("active");

    const startTime = Date.now();

    return new Promise<number>((resolve, reject) => {
        let insertPosition = sharedString.client.getLength();
        let readPosition = 0;

        fileText = normalizeText(fileText);
        // Trigger a new sample after a second has elapsed
        const samplingRate = 1000;

        const ackCounter = new RateCounter();
        ackCounter.reset();
        const latencyCounter = new RateCounter();
        latencyCounter.reset();
        const messageStart = {};

        sharedString.on("op", (message) => {
            if (message.clientSequenceNumber) {
                ackProgressBar.style.width = `${(100 * message.clientSequenceNumber / fileText.length).toFixed(2)}%`;

                ackCounter.increment(1);
                if (ackCounter.elapsed() > samplingRate) {
                    const rate = ackCounter.getRate();
                    document.getElementById("ack-rate").innerText =
                        `Ack rate: ${(rate * 1000).toFixed(2)} characters/second`;
                    ackCounter.reset();
                }

                const roundTrip = Date.now() - messageStart[message.clientSequenceNumber];
                delete messageStart[message.clientSequenceNumber];
                latencyCounter.increment(roundTrip);
                document.getElementById("avg-latency").innerText =
                    `Average latency: ${(latencyCounter.getValue() / message.clientSequenceNumber).toFixed(2)} ms`;

                // We need a better way of hearing when our messages have been received and processed.
                // For now I just assume we are the only writer and wait to receive a message with a client
                // sequence number greater than the number of submitted operations.
                if (message.clientSequenceNumber >= fileText.length) {
                    ackProgressBar.classList.remove("active");
                    const endTime = Date.now();
                    resolve(endTime - startTime);
                }
            }
        });

        const typingCounter = new RateCounter();
        typingCounter.reset();

        const interval = setInterval(() => {
            // Stop typing once we reach the end
            if (readPosition === fileText.length) {
                typingProgressBar.classList.remove("active");
                clearInterval(interval);
                return;
            }

            typingCounter.increment(1);
            if (typingCounter.elapsed() > samplingRate) {
                const rate = typingCounter.getRate();
                document.getElementById("typing-rate").innerText =
                    `Typing rate: ${(rate * 1000).toFixed(2)} characters/second`;
                typingCounter.reset();
            }

            // Start inserting text into the string
            sharedString.insertText(fileText.charAt(readPosition++), insertPosition++);
            messageStart[readPosition] = Date.now();
            typingProgressBar.style.width = `${(100 * readPosition / fileText.length).toFixed(2)}%`;
        }, intervalTime);
    });
}

async function create() {
    const id = sharedTextId.value;
    const intervalTime = Number.parseInt(intervalElement.value);
    const extension = api.defaultRegistry.getExtension(SharedString.CollaboritiveStringExtension.Type);
    const sharedString = extension.load(id, api.getDefaultServices(), api.defaultRegistry) as SharedString.SharedString;
    documentLink.href = `/sharedText/${id}`;
    documentLink.innerText = documentLink.href;

    sharedString.on("loadFinshed", (data: api.MergeTreeChunk) => {
        typeFile(sharedString, text, intervalTime).then(
            (totalTime) => {
                document.getElementById("total-time").innerText =
                    `Total time: ${(totalTime / 1000).toFixed(2)} seconds`;
                console.log("Done typing file");
            },
            (error) => {
                console.error(error);
            });
    });
}

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

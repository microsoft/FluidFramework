import * as api from "../../api";
import * as SharedString from "../../merge-tree";
import * as socketStorage from "../../socket-storage";

// Mark socket storage as our default provider
socketStorage.registerAsDefault(document.location.origin);

// Easy access to a couple of page elements
const form = document.getElementById("text-form") as HTMLFormElement;
const inputElement = document.getElementById("file") as HTMLInputElement;
const createButton = document.getElementById("create") as HTMLButtonElement;
const sharedTextId = document.getElementById("shared-text-id") as HTMLInputElement;
const progress = document.getElementById("progress") as HTMLElement;
const intervalElement = document.getElementById("interval") as HTMLInputElement;
const documentLink = document.getElementById("document-link") as HTMLAnchorElement;

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
 * Types the given file into the shared string - starting at the end of the string
 */
function typeFile(sharedString: SharedString.SharedString, fileText: string, intervalTime: number): Promise<number> {
    progress.classList.remove("hidden");
    const progressBar = progress.getElementsByClassName("progress-bar")[0] as HTMLElement;
    progressBar.style.width = "0%";
    progressBar.classList.add("active");
    const startTime = Date.now();

    return new Promise<number>((resolve, reject) => {
        let insertPosition = sharedString.client.getLength();
        let readPosition = 0;

        sharedString.on("op", (message) => {
            progressBar.style.width = `${Math.round(100 * message.clientSequenceNumber / fileText.length)}%`;

            // We need a better way of hearing when our messages have been received and processed.
            // For now I just assume we are the only writer and wait to receive a message with a client
            // sequence number greater than the number of submitted operations.
            if (message.clientSequenceNumber >= fileText.length) {
                progressBar.classList.remove("active");
                const endTime = Date.now();
                resolve(endTime - startTime);
            }
        });

        const interval = setInterval(() => {
            // Stop typing once we reach the end
            if (readPosition === fileText.length) {
                clearInterval(interval);
            }

            // Start inserting text into the string
            sharedString.insertText(fileText.charAt(readPosition++), insertPosition++);
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
        progress.classList.add("hidden");
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

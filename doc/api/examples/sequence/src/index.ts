const prague = window["prague"];
const $ = window["$"];

// For local development
// const routerlicious = "http://localhost:3000";
// const historian = "http://localhost:3001";
const routerlicious = "http://praguekube.westus2.cloudapp.azure.com";
const historian = "http://prague-historian.westus2.cloudapp.azure.com";
const repository = "prague";

// Register endpoint connection
prague.socketStorage.registerAsDefault(routerlicious, historian, repository);

function getLatestVersion(id: string): Promise<any> {
    const versionP = new Promise<any>((resolve, reject) => {
        const versionsP = $.getJSON(`${historian}/repos/${repository}/commits?sha=${encodeURIComponent(id)}&count=1`);
        versionsP
            .done((version) => {
                resolve(version[0]);
            })
            .fail((error) => {
                if (error.status === 400) {
                    resolve(null);
                } else {
                    reject(error.status);
                }
            });
    });

    return versionP;
}

async function run(id: string): Promise<void> {
    // Get the latest version of the document
    const version = await getLatestVersion(id);
    console.log(version);

    // Load in the latest and connect to the document
    const collabDoc = await prague.api.load(id, { blockUpdateMarkers: true }, version);

    const rootView = await collabDoc.getRoot().getView();
    console.log("Keys");
    console.log(rootView.keys());

    // Add in the text string if it doesn't yet exist
    if (!rootView.has("text")) {
        rootView.set("text", collabDoc.createString());
    }

    // Load the text string and listen for updates
    const text = rootView.get("text");

    const textElement = document.getElementById("text");
    textElement.innerText = text.client.getText();

    // Update the text after being loaded as well as when receiving ops
    text.loaded.then(() => {
        textElement.innerText = text.client.getText();
    });
    text.on("op", (msg) => {
        textElement.innerText = text.client.getText();
    });

    const insertElement = document.getElementById("insertForm") as HTMLFormElement;
    insertElement.onsubmit = (event) => {
        const insertText = insertElement.elements["insertText"].value;
        const insertPosition = parseInt(insertElement.elements["insertLocation"].value);

        text.insertText(insertText, insertPosition);

        event.preventDefault();
    };
}

const documentId = "test-document";
run(documentId).catch((error) => {
    console.error(error);
})

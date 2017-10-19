const prague = window["prague"];
const $ = window["$"];

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
}

const documentId = "below-deck-pod";
run(documentId).catch((error) => {
    console.error(error);
})

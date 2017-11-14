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

let nextGraphId = 0;

class GraphProxy {
    id: string;
    
}

function createGraphProxy() {
    
}

async function run(id: string): Promise<void> {
    // Get the latest version of the document
    const version = await getLatestVersion(id);
    console.log(version);

    // Load in the latest and connect to the document
    const collabDoc = await prague.api.load(id, { blockUpdateMarkers: true }, version);

    const rootView = await collabDoc.getRoot().getView();
    if (!rootView.has("graphs")) {
        rootView.set("graphs", collabDoc.createMap());
    }
}

const documentId = "graph1";
run(documentId).catch((error) => {
    console.error(error);
})

import * as $ from "jquery";
import * as api from "../../api";
import * as socketStorage from "../../socket-storage";

async function loadDocument(id: string): Promise<api.Document> {
    console.log("Connecting to storage provider...");
    const provider = new socketStorage.StorageProvider();
    const storage = await provider.connect({ token: "none" });

    console.log("Loading in root document...");
    const document = await api.load(storage, id);

    console.log("Document loaded");
    return document;
}

function displayMap(map: api.IMap) {
    const container = $("<div></div>");

    const keys = map.keys().sort();
    for (const key of keys) {
        container.append($(`<div>${key}: ${map.get(key)}</div>`));
    }

    $("#values").children().remove();
    $("#values").append(container);
}

export function load(id: string) {
    $(document).ready(() => {
        loadDocument(id).then((doc) => {
            // tslint:disable-next-line
            window["doc"] = doc;

            const root = doc.getRoot();

            // Display the initial values and then listen for updates
            displayMap(root);
            root.on("valueChanged", () => {
                displayMap(root);
            });

            // link up the randomize button
            $("#randomize").click(() => {
                const keys = ["foo", "bar", "baz", "binky", "winky", "twinkie"];
                setInterval(() => {
                    const key = keys[Math.floor(Math.random() * keys.length)];
                    root.set(key, Math.floor(Math.random() * 100000).toString());
                }, 1000);
            });
        });
    });
}

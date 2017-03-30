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

$(document).ready(() => {
    loadDocument("test").then((doc) => {
        // tslint:disable-next-line
        window["doc"] = doc;
    });
});

import * as $ from "jquery";
import * as api from "../../api";
import * as socketStorage from "../../socket-storage";

socketStorage.registerAsDefault(document.location.origin);

async function loadDocument(id: string): Promise<api.Document> {
    console.log("Loading in root document...");
    const document = await api.load(id);

    console.log("Document loaded");
    return document;
}

async function updateOrCreateValue(cell: api.ICell, container: JQuery, doc: api.Document) {
    const value = await cell.get();

    let element = container.find(".cell");
    const newElement = element.length === 0;

    if (newElement) {
        console.log("New element");
        element = $(`<div class="cell"></div>`);
        container.append(element);
    }
    element.text(value);

}

/**
 * Displays the actual value and listen for updates.
 */
async function displayCellValue(cell: api.ICell, container: JQuery, doc: api.Document) {

    const value = $("<div></div>");

    // Listen and process updates
    cell.on("valueChanged", async (changedValue) => {
        updateOrCreateValue(cell, value, doc);
    });
    container.append(value);
}

/**
 * Displays the cell
 */
async function displayCell(parentElement: JQuery, cell: api.ICell, doc: api.Document) {
    console.log(cell.id);
    console.log(cell.type);
    const header = $(`<h2>${cell.id}</h2>`);
    parentElement.append(header);

    const randomize = $("<button>Randomize</button>");
    randomize.click((event) => {
        randomizeCell(cell);
    });
    parentElement.append(randomize);
    const container = $(`<div></div>`);
    displayCellValue(cell, container, doc);
    parentElement.append(container);
}

/**
 * Randomly changes the values in the map
 */
function randomizeCell(cell: api.ICell) {
    // link up the randomize button
    const keys = ["foo", "bar", "baz", "binky", "winky", "twinkie"];
    setInterval(() => {
        const key = keys[Math.floor(Math.random() * keys.length)];
        cell.set(key);
    }, 3000);
}

export async function load(id: string) {
    const doc = await loadDocument(id);
    const root = doc.getRoot();

    let cell: api.ICell;
    if (await root.has("cell")) {
        cell = await root.get("cell") as api.ICell;
    } else {
        cell = doc.createCell() as api.ICell;
        root.set("cell", cell);
    }

    $("document").ready(() => {
        // Display the initial value and then listen for updates
        displayCell($("#cellViews"), cell, doc);
    });

}

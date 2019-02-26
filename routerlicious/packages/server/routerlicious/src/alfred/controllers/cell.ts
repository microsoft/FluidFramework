import { ICell } from "@prague/cell";
import * as api from "@prague/client-api";
import { IHost } from "@prague/container-definitions";
import * as resources from "@prague/gitresources";
import { ContanierUrlResolver } from "@prague/routerlicious-host";
import * as socketStorage from "@prague/routerlicious-socket-storage";
import * as $ from "jquery";
import { registerDocumentServices } from "./utils";

async function loadDocument(
    id: string,
    version: resources.ICommit,
    token: string,
    host: IHost,
    client: any,
): Promise<api.Document> {
    console.log("Loading in root document...");

    const tokenService = new socketStorage.TokenService();
    const claims = tokenService.extractClaims(token);

    const document = await api.load(
        id,
        claims.tenantId,
        host,
        { encrypted: false},
        version);

    console.log("Document loaded");
    return document;
}

async function updateOrCreateValue(cell: ICell, container: JQuery, doc: api.Document) {

    // Initially cell is empty.
    const emptyCell = await cell.empty();
    if (emptyCell) {
        return;
    }

    const value = await cell.get();
    let element = container.find(".cell");
    const newElement = element.length === 0;
    const isString = typeof value === "string";

    if (newElement) {
        element = $(`<div class="cell"></div>`);
        container.append(element);
    }

    if (isString) {
        element.text(value);
    } else {
        if (newElement) {
            displayCell(element, value, doc);
        }
    }
}

/**
 * Displays the actual value and listen for updates.
 */
async function displayCellValue(cell: ICell, container: JQuery, doc: api.Document) {

    const value = $("<div></div>");

    // Load initially
    updateOrCreateValue(cell, value, doc);

    // Listen and process updates
    cell.on("valueChanged", async (changedValue) => {
        updateOrCreateValue(cell, value, doc);
    });
    container.append(value);
}

/**
 * Displays the cell
 */
async function displayCell(parentElement: JQuery, cell: ICell, doc: api.Document) {
    const header = $(`<h2>${cell.id}</h2>`);
    parentElement.append(header);

    const setString = $(`<button class="setString">Set String</button>`);
    const addCell = $(`<button class="addCell">Add Cell</button>`);
    parentElement.append(setString, addCell);

    setString.click((event) => {
        randomizeCell(cell, setString, addCell);
    });

    addCell.click((event) => {
        addAnotherCell(parentElement, cell, setString, addCell, doc);
    });

    const container = $(`<div></div>`);
    displayCellValue(cell, container, doc);
    parentElement.append(container);
}

/**
 * Add another cell to the cell.
 */
function addAnotherCell(parent: JQuery, cell: ICell, element1: JQuery, element2: JQuery, doc: api.Document) {
    element1.remove();
    element2.remove();

    const childCell = $(`<div></div>`);
    const newCell = doc.createCell() as ICell;
    parent.append(childCell);
    cell.set(newCell);

    displayCell(childCell, newCell, doc);
}

/**
 * Randomly changes the values in the cell
 */
function randomizeCell(cell: ICell, element1: JQuery, element2: JQuery) {
    element1.remove();
    element2.remove();
    const keys = ["foo", "bar", "baz", "binky", "winky", "twinkie"];
    setInterval(() => {
        // tslint:disable-next-line:insecure-random
        const key = keys[Math.floor(Math.random() * keys.length)];
        cell.set(key);
    }, 3000);
}

export async function load(id: string, version: resources.ICommit, token: string, config: any) {
    registerDocumentServices(config);

    const resolver = new ContanierUrlResolver(null, null);
    const tokenProvider = new socketStorage.TokenProvider(token);
    const doc = await loadDocument(id, version, token, { resolver, tokenProvider }, config.client);
    const root = doc.getRoot();

    let cell: ICell;
    if (await root.has("cell")) {
        cell = await root.get<ICell>("cell");
    } else {
        cell = doc.createCell();
        root.set("cell", cell);
    }

    $("document").ready(() => {
        // Display the initial value and then listen for updates
        displayCell($("#cellViews"), cell, doc);
    });
}

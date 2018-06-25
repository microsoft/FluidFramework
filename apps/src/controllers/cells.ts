import { api } from "@prague/routerlicious";
import * as $ from "jquery";

import prague = api;
import types = prague.types;

async function loadDocument(id: string, token?: string): Promise<prague.api.Document> {
    console.log("Loading in root document...");
    const document = await prague.api.load(id, { encrypted: false, token }).catch((err) => {
        return Promise.reject(err);
    });
    console.log("Document loaded");
    return document;
}

async function updateOrCreateValue(cell: types.ICell, container: JQuery, doc: prague.api.Document) {

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
async function displayCellValue(cell: types.ICell, container: JQuery, doc: prague.api.Document) {

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
async function displayCell(parentElement: JQuery, cell: types.ICell, doc: prague.api.Document) {
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
function addAnotherCell(parent: JQuery, cell: types.ICell, element1: JQuery, element2: JQuery,
                        doc: prague.api.Document) {
    element1.remove();
    element2.remove();

    const childCell = $(`<div></div>`);
    const newCell = doc.createCell() as types.ICell;
    parent.append(childCell);
    cell.set(newCell);

    displayCell(childCell, newCell, doc);
}

function displayUserId(parentElement: JQuery, userId: string) {
    // tslint:disable-next-line
    const idElement = $(`<h4 align="right"><span class="userid">${userId} </span><a href="/logout" class="logout">(Logout)</a></h4>`);
    parentElement.append(idElement);
}

function displayError(parentElement: JQuery, error: string) {
    const idElement = $(`<h2>${error}</h2>`);
    parentElement.append(idElement);
}

/**
 * Randomly changes the values in the cell
 */
function randomizeCell(cell: types.ICell, element1: JQuery, element2: JQuery) {
    element1.remove();
    element2.remove();
    const keys = ["foo", "bar", "baz", "binky", "winky", "twinkie"];
    setInterval(() => {
        const key = keys[Math.floor(Math.random() * keys.length)];
        cell.set(key);
    }, 3000);
}

export async function load(id: string, tenantId: string, endPoints: any, token?: string,
                           workerConfig?: any) {
    prague.socketStorage.registerAsDefault(endPoints.delta, endPoints.storage, tenantId);
    $("document").ready(() => {
        loadDocument(id, token).then(async (doc) => {
            const root = doc.getRoot();

            let cell: types.ICell;
            if (await root.has("cell")) {
                cell = await root.get("cell");
            } else {
                cell = doc.createCell();
                root.set("cell", cell);
            }

            // Display the user id.
            displayUserId($("#cellViews"), doc.getUser().id);
            console.log(doc.getUser().id);

            // Display the initial value and then listen for updates
            displayCell($("#cellViews"), cell, doc);
        }, (err) => {
            displayError($("#cellViews"), err.body);
            console.log(err);
        });
    });
}

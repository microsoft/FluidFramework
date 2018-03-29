import { api } from "@prague/routerlicious";
import * as $ from "jquery";

import prague = api;
// import types = prague.types;
// import Map = api.map;

/*
async function loadDocument(id: string, token?: string): Promise<prague.api.Document> {
    console.log("Loading in root document...");
    const document = await prague.api.load(id, { encrypted: false, token }).catch((err) => {
        return Promise.reject(err);
    });

    console.log("Document loaded");
    return document;
}*/

function displayUserId(parentElement: JQuery, userId: string) {
    // tslint:disable-next-line
    const idElement = $(`<h4 align="right"><span class="userid">${userId} </span><a href="/logout" class="logout">(Logout)</a></h4>`);
    parentElement.append(idElement);
}

/*
function displayError(parentElement: JQuery, error: string) {
    const idElement = $(`<h2>${error}</h2>`);
    parentElement.append(idElement);
}*/

export async function load(id: string, repository: string,  owner: string, endPoints: any, token?: string) {
    prague.socketStorage.registerAsDefault(endPoints.delta, endPoints.storage, owner, repository);
    console.log(id);
    displayUserId($("#tictactoeViews"), "Tanvir Aumi");

    /*
    $(document).ready(() => {
        loadDocument(id, token).then((doc) => {
            // tslint:disable-next-line
            window["doc"] = doc;

            const root = doc.getRoot();

            // Display the user id.
            displayUserId($("#tictactoeViews"), doc.getUser().user.id);
            console.log(doc.getUser());

            // Display the initial values and then listen for updates
            displayMap($("#mapViews"), null, root, null, doc);
        }, (err) => {
            displayError($("#mapViews"), err.body);
            console.log(err);
        });
    });*/
}

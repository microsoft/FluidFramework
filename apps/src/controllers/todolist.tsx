import { api as prague } from "@prague/routerlicious";
import * as jwt from "jsonwebtoken";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { TodoList } from "./components/todolist/todolist";

export interface IMapPair {
    map: prague.types.IMap;
    view: prague.types.IMapView;
}

async function loadDocument(id: string, token?: string): Promise<prague.api.Document> {
    console.log("Loading in root document...");
    const document = await prague.api.load(id, { encrypted: false, token }).catch((err) => {
        return Promise.reject(err);
    });

    console.log("Document loaded");
    return document;
}

function displayError(parentElement: JQuery, error: string) {
    const idElement = $(`<h2>${error}</h2>`);
    parentElement.append(idElement);
}

export async function load(id: string, tenantId: string, endPoints: any, token?: string) {
    $("document").ready(() => {
        // prague.socketStorage.registerAsDefault(endPoints.delta, endPoints.storage, tenantId);
        prague.socketStorage.registerAsDefault(
            "https://alfred.wu2-ppe.prague.office-int.com",
            "https://historian.wu2-ppe.prague.office-int.com",
            "confident-turing");
        const newToken = jwt.sign(
            {
                documentId: id,
                permission: "read:write", // use "read:write" for now
                tenantId: "confident-turing",
                user: {
                    id: "test",
                },
            },
            "24c1ebcf087132e31a7e3c25f56f6626");
        loadDocument(id, newToken).then(async (doc) => {
            prepare(doc).then((mapView) => {
                ReactDOM.render(
                    <TodoList map={mapView.map} view={mapView.view}/>,
                    document.getElementById("todolistViews"),
                );
            }, (error) => {
                displayError($("#todolistViews"), JSON.stringify(error));
                console.log(error);
            });
        }, (err) => {
            displayError($("#todolistViews"), JSON.stringify(err));
            console.log(err);
        });
    });
}

async function prepare(document: prague.api.Document): Promise<IMapPair> {
    return new Promise<IMapPair>((resolve, reject) => {
      if (document.existing) {
        console.log(`Existing document!`);
        const rootMap = document.getRoot();
        // Wait for the root map to show up.
        rootMap.wait("todo").then(() => {
            prepareCore(document).then((mapView) => {
                resolve(mapView);
              }, (error) => {
                reject(error);
              });
        });
      } else {
        prepareCore(document, true).then((mapView) => {
          resolve(mapView);
        }, (error) => {
          reject(error);
        });
      }
    });
}
async function prepareCore(document: prague.api.Document, create?: boolean): Promise<IMapPair> {
    const rootMap = document.getRoot();
    if (create) {
      rootMap.set("todo", document.createMap());
    }
    const map = await rootMap.get("todo") as prague.types.IMap;
    const view = await map.getView();
    return {
        map,
        view,
    };
}

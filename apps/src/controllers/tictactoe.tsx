import { api } from "@prague/routerlicious";

import * as React from "react";
import * as ReactDOM from "react-dom";

import { Game } from "./components/Game";

import prague = api;
import types = prague.types;
import Map = api.map;


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

export async function load(id: string, repository: string,  owner: string, endPoints: any, token?: string) {
    $("document").ready(() => {
        prague.socketStorage.registerAsDefault(endPoints.delta, endPoints.storage, owner, repository);
        console.log(`Document id is: ${id}`);
        let playerId = 1;

        loadDocument(id, token).then(async (doc) => {
            // tslint:disable-next-line
            window["doc"] = doc;

            const rootView = await doc.getRoot().getView();
            let gameView: api.types.IMapView;
            if (rootView.has("game")) {
                playerId = 2;
                const gameMap = rootView.get("game") as types.IMap;
                gameView = await gameMap.getView();
            } else {
                rootView.set("game", doc.createMap());
                const gameMap = rootView.get("game") as types.IMap;
                gameView = await gameMap.getView();
            }

            let canJoin : boolean = true;
            if (gameView.has("counter")) {
                const counter = gameView.get("counter") as api.map.Counter;
                if (counter.value === 2) {
                    canJoin = false;
                } else {
                    counter.increment(1);
                }
            } else {
                const counter = gameView.set<Map.Counter>("counter", undefined, Map.CounterValueType.Name);
                counter.increment(1);
            }

            if (!canJoin) {
                console.log(`${playerId} can't join the game!`);
                displayError($("#tictactoeViews"), "No more players allowed");
            } else {
                console.log(`${playerId} can join the game!`);
                ReactDOM.render(
                    <Game />,
                    document.getElementById("tictactoeViews")
                );
            }
            console.log(doc.getUser());

        }, (err) => {
            displayError($("#tictactoeViews"), JSON.stringify(err));
            console.log(err);
        });
    });
}
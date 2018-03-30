import * as React from "react";
import * as ReactDOM from "react-dom";

import { Game } from "./components/Game";

export async function load(id: string, repository: string,  owner: string, endPoints: any, token?: string) {
    $("document").ready(() => {
        console.log(`Document id: ${id}`);
        ReactDOM.render(
            <Game />,
            document.getElementById("tictactoeViews")
        );
    });
}
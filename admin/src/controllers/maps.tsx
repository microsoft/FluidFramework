import * as React from "react";
import * as ReactDOM from "react-dom";

import { Hello } from "./components/Hello";

export async function load(id: string) {
    $("document").ready(() => {
        console.log(id);
        ReactDOM.render(
            <Hello compiler="Maps" framework="React" />,
            document.getElementById("mapViews")
        );
    });
}

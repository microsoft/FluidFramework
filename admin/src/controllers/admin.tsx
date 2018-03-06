import * as React from "react";
import * as ReactDOM from "react-dom";

import { Hello } from "./components/Hello";

export async function load(user: any) {
    $("document").ready(() => {
        console.log(user.displayName);
        $("#displayname").text(user.displayName);
        ReactDOM.render(
            <Hello compiler="Maps" framework="React" />,
            document.getElementById("adminportal")
        );
    });
}

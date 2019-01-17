import * as ReactDOM from "react-dom";
import * as React from "react";
import { App } from "./app";

export function start() {
    ReactDOM.render(
        <App />,
        document.body
    );
}

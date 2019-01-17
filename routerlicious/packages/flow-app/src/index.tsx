import * as ReactDOM from "react-dom";
import * as React from "react";
import { App } from "./app";

export function start() {
    ReactDOM.render(
        <App alfredUrl="http://localhost:3000" mediaUrl="http://localhost:8080" verdaccioUrl="http://localhost:4873"/>,
        document.body
    );
}

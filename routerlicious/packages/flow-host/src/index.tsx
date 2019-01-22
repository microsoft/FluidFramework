import { App, IAppConfig } from "./app";
import * as React from "react";
import * as ReactDOM from "react-dom";

/** Invoked be either Alfred's '/controllers/view.ts' or 'Flow-App' when using WebPack dev server. */
export function start(config: IAppConfig, root: HTMLElement) {
    ReactDOM.render(<App config={config} />, root);
}

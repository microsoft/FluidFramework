/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import ReactDOM from "react-dom";

import { App } from "./components";

const div = document.getElementById("content") as HTMLDivElement;
ReactDOM.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
    div,
);

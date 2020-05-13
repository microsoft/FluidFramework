/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import ReactDOM from "react-dom";
import { IData, IUser } from "../definitions";
import { Content } from "./components/Content";

export async function load(user: IUser, data: IData) {
    $("document").ready(() => {
        ReactDOM.render(
            <Content data={data} user={user} />,
            document.getElementById("adminportal"));
    });
}

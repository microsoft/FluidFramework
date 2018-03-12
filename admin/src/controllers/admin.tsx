import * as React from "react";
import * as ReactDOM from "react-dom";

import { Content } from "./components/Content";

export async function load(user: any, adminData: any, endpoints: any) {
    $("document").ready(() => {
        ReactDOM.render(
            <Content data={adminData} user={user} endpoints={endpoints} />,
            document.getElementById("adminportal")
        );
    });
}

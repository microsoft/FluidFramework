import * as React from "react";
import * as ReactDOM from "react-dom";

import { Content } from "./components/Content";

export async function load(user: any, adminData: any) {
    $("document").ready(() => {
        console.log(adminData);
        ReactDOM.render(
            <Content data={adminData} user={user} />,
            document.getElementById("adminportal")
        );
    });
}

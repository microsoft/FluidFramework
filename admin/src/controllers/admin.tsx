import * as React from "react";
import * as ReactDOM from "react-dom";
import { ITenant, IUser } from "../definitions";
import { Content } from "./components/Content";

export async function load(user: IUser, adminData: ITenant[]) {
    $("document").ready(() => {
        ReactDOM.render(
            <Content data={adminData} user={user} />,
            document.getElementById("adminportal"));
    });
}

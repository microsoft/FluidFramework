import { api as prague } from "@prague/routerlicious";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { Picker } from "../components/picker";
import { VideoDocument } from "../documents";
import { IUser } from "../github";

const routerlicious = "https://alfred.wu2.prague.office-int.com";
const historian = "https://historian.wu2.prague.office-int.com";
const tenantId = "heuristic-kepler";
const secret = "f9349c025fc7e98d9b8cdec6bbe4320e";
prague.socketStorage.registerAsDefault(routerlicious, historian, tenantId);

async function run(user: IUser): Promise<void> {
    const video = await VideoDocument.load(user.login, tenantId, secret);

    ReactDOM.render(
        <Picker video={video} ></Picker>,
        document.getElementById("example"),
    );
}

export function loadVideo(profile: IUser, playerFn: any) {
    run(profile).catch(
        (error) => {
            console.error(error);
        });
}

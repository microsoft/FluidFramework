import * as collabClient from "../collab/client";
import * as collabDocument from "./document";

let connection = collabClient.connect();

export function connect(id: string) {
    collabDocument.create(document.getElementById("editor"), connection, id);
}

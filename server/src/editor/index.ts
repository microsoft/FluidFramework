import { Promise } from "es6-promise";
import { RichText } from "../canvas/models/richText";
import * as collabClient from "../collab/client";
import { Document } from "./document";

let connection = collabClient.connect();

export function connect(id: string) {
    let richTextP = RichText.GetOrCreate(connection, id);
    richTextP.then((richText) => {
        let doc = new Document(document.getElementById("editor"), richText);
    });
}

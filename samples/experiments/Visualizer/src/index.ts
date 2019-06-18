/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { api as prague} from "@prague/routerlicious";
import * as jwt from "jsonwebtoken";
import * as url from "url";
import { Visualizer } from "./Visualizer";

// For local development
const routerlicious = "http://localhost:3000";
const historian = "http://localhost:3001";
const tenantId = "prague";
const secret = "43cfc3fbf04a97c0921fd23ff10f9e4b";
// const routerlicious = "https://alfred.wu2.prague.office-int.com";
// const historian = "https://historian.wu2.prague.office-int.com";
// const tenantId = "awesome-knuth";
// const secret = "5ad2ccdb911c9c3a5beb34965334edca";

const documentId = "distinct-straw"; // "hack2018_0723_4i.docx";
// const reqUrl = "http://localhost:port/index.html?documentId='hack2018-0723-4i.docx'";

// Register endpoint connection
prague.socketStorage.registerAsDefault(routerlicious, historian, tenantId);
let visualizer: Visualizer;

async function run(id: string): Promise<void> {
    const query = url.parse(window.location.href, true);
    const queryObj = query.query;
    id = queryObj.documentId as string || id;
    const token = jwt.sign(
        {
            documentId: id,
            permission: "read:write", // use "read:write" for now
            tenantId,
            user: {
                id: "jisach",
            },
        },
        secret);

    // Load in the latest and connect to the documenta
    const collabDoc = await prague.api.load(id, { blockUpdateMarkers: true, token });
    const rootMap = collabDoc.getRoot();
    document.getElementById("lblDocumentName").innerHTML = id;
    visualizer = new Visualizer(rootMap);
    visualizer.ExpandMapNode(rootMap, 1, rootMap.id);
}

run(documentId).catch((error) => {
    console.error(error);
});

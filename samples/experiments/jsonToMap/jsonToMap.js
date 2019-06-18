/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const {
    performance
  } = require('perf_hooks');

let api = require('@prague/client-api')
let socketStorage = require('@prague/socket-storage');
let jwt = require('jsonwebtoken');


// For local development
const routerlicious = "http://localhost:3000";
const historian = "http://localhost:3001";
const tenantId = "prague";
const secret = "43cfc3fbf04a97c0921fd23ff10f9e4b";
// const routerlicious = "https://alfred.wu2.prague.office-int.com";
// const historian = "https://historian.wu2.prague.office-int.com";
// const tenantId = "gallant-hugle";
// const secret = "03302d4ebfb6f44b662d00313aff5a46";

const documentId = "jsonToMap"; //+ Math.random().toString(36).substr(2, 4);

// Register endpoint connection
const documentServices = socketStorage.createDocumentService(routerlicious, historian);
api.registerDocumentService(documentServices);

async function getCollabDoc(waitForConnect) {
    const token = jwt.sign({
            documentId,
            permission: "read:write", // use "read:write" for now
            tenantId,
            user: {
                id: "test",
            },
        },
        secret);

    // Load in the latest and connect to the document
    const collabDoc = await api.load(documentId, {
        blockUpdateMarkers: true,
        token
    });

    if (!waitForConnect || collabDoc.isConnected) {
        return collabDoc;
    }
    const startTime = performance.now();
    console.log("*** Waiting to connect " + documentId)
    return await new Promise((resolve, reject) =>
        collabDoc.on("connected", async () => {
            console.log("*** Document connected: " + (performance.now() - startTime) + "ms");
            resolve(collabDoc);
        }));

    return collabDoc;
}

// stats
let mapCounter = 0;
let setCounter = 0;
let totalValueLength = 0;
let maxValueLength = 0;
let maxLengthValue = "";

// jsonToMap
function emitValue(doc, obj) {
    if (typeof obj === "object") {
        let map = doc.createMap();
        mapCounter++;
        for (let i of Object.keys(obj)) {
            setCounter++;
            map.set(i, emitValue(doc, obj[i]));
        }
        return map;
    }
    let len = obj.toString().length;
    maxValueLength = Math.max(maxValueLength, len);
    if (maxValueLength === len) {
        maxLengthValue = obj;
    }
    return obj;
}


async function jsonToMap(doc, rootView, obj) {
    rootView.set("value", emitValue(doc, obj));
    setCounter++;
}


// jsonToFlatMap
async function jsonToFlatMap(doc, rootView, obj) {
    const map = doc.createMap();
    mapCounter++;

    if (mapForceConnect) {
        rootView.set("FORCECONNECT", map);    
    }
    setCounter++;
    for (let i of Object.keys(obj)) {
        let value = JSON.stringify(obj[i]);
        map.set(i, value);
        setCounter++;

        let len = value.length;
        totalValueLength += len;
        maxValueLength = Math.max(maxValueLength, len);
        if (maxValueLength === len) {
            maxLengthValue = value;
        }
    }
    rootView.set("MAP" , map);
}


// Start

if (process.argv.length < 2) {
    console.error("ERROR: Invalid number of arguments");
    return;
}

let flatMap = false;
let verbose = false;
let waitForConnect = true;
let mapForceConnect = true;
let filename;

for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === "-flat") {
        flatMap = true;
        continue;
    }
    if (process.argv[i] === "-verbose") {
        verbose = true;
        continue;
    }
    if (process.argv[i] === "-nowaitconnect") {
        waitForConnect = false;
        continue;
    }
    if (process.argv[i] === "-nomapforceconnect") {
        mapForceConnect = false;
        continue;
    }
    filename = process.argv[i];
}

if (!filename) {
    console.error("ERROR: no file name specified");
}
const fs = require('fs');
const jsonStr = fs.readFileSync(filename, 'utf8');

console.log("*** Writing to document " + documentId);
const func = flatMap ? jsonToFlatMap : jsonToMap;
getCollabDoc(waitForConnect).then((doc) => {
    doc.getRoot().getView().then((rootView) => {  
        let obj = JSON.parse(jsonStr);  
        const startEmitTime = performance.now();    
        func(doc, rootView, obj).then(() => {
            console.log("*** Finish emitted - " + (performance.now() - startEmitTime) + "ms");
            doc.save();
            console.log("*** MapCounter    : " + mapCounter);
            console.log("*** EntryCounter  : " + setCounter);
            console.log("*** TotalValueLen : " + totalValueLength);
            console.log("*** MaxValueLen   : " + maxValueLength);
            if (verbose) {
                console.log("*** MaxLengthValue: " + maxLengthValue);
            }            
            const startWaitTime = performance.now();
            (function waitTillDone() {
                if (doc.hasUnackedOps) {
                    setTimeout(waitTillDone, 1000);
                } else {
                    console.log("**** Finish sending all ops - " + (performance.now() - startWaitTime) + "ms");
                    process.exit(0);
                }
            })();
        })
    })
});


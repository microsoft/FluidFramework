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

async function getCollabDoc() {
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
    return collabDoc;
}

let mapCounter = 0;
let setCounter = 0;
let maxValueLength = 0;
let maxLengthValue = "";
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

let doc;
async function jsonToMap(jsonStr) {
    doc = await getCollabDoc();
    const rootView = await doc.getRoot().getView();
    let obj = JSON.parse(jsonStr);
    rootView.set("value", emitValue(doc, obj));
    setCounter++;
}


if (process.argv.length != 3) {
    console.error("ERROR: Invalid number of arguments");
    return;
}

let fs = require('fs');
let r = fs.readFileSync(process.argv[2], 'utf8');

console.log("Writing to document " + documentId)
jsonToMap(r).then(() => {
    console.log(mapCounter);
    console.log(setCounter);
    console.log(maxValueLength);
    console.log(maxLengthValue);
    waitTillDone();
});


function waitTillDone() {
    console.log("checking");
    if (doc.hasUnackedOps) {
        setTimeout(waitTillDone, 1000);
    } else {
        process.exit(0);
    }
}

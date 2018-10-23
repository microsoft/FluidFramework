import * as pragueApi from "@prague/client-api";
import * as socketStorage from "@prague/socket-storage";
import * as jwt from "jsonwebtoken";

// For local development
const localSettings = {
    historian: "http://localhost:3001",
    routerlicious: "http://localhost:3000",
    secret: "43cfc3fbf04a97c0921fd23ff10f9e4b",
    tenantId: "local",
};
const remoteSettings = {
    historian: "https://historian.eu.prague.office-int.com",
    routerlicious: "https://alfred.eu.prague.office-int.com",
    secret: "04d35da60eed66c9a2272bdf310d076e",
    tenantId: "trusting-tesla",
};

const useLocal = true;

const settings = useLocal ? localSettings : remoteSettings;

const waitForConnect = true;

// Register endpoint connection
const documentServices = socketStorage.createDocumentService(settings.routerlicious, settings.historian);
pragueApi.registerDocumentService(documentServices);

export async function getCollabDoc(documentId: string): Promise<pragueApi.Document> {

    const user = {
        id: "test",
    };
    const token = jwt.sign(
        {
            documentId,
            permission: "read:write", // use "read:write" for now
            tenantId: settings.tenantId,
            user,
        },
        settings.secret);

    // Load in the latest and connect to the document
    const collabDoc = await pragueApi.load(documentId, settings.tenantId, user, token, { blockUpdateMarkers: true });

    if (!waitForConnect || collabDoc.isConnected) {
        return collabDoc;
    }
    const startTime = performance.now();
    console.log("Waiting to connect " + documentId);
    return await new Promise<pragueApi.Document>((resolve, reject) =>
        collabDoc.on("connected", async () => {
            console.log("Document connected: " + (performance.now() - startTime) + "ms");
            resolve(collabDoc);
        }));
}

import * as commander from "commander";
import * as jwt from "jsonwebtoken";
import { PuppetMaster } from "./puppetMaster";

const routerlicious = "https://alfred.wu2-ppe.prague.office-int.com";
const historian = "https://historian.wu2-ppe.prague.office-int.com";
const tenantId = "prague";
const secret = "43cfc3fbf04a97c0921fd23ff10f9e4b";
const packageUrl = "https://pragueauspkn-3873244262.azureedge.net";
const loaderType = "snapshot";

async function launchPuppeteer(documentId: string) {
    const user = {
        id: "test",
        name: "tanvir",
    };
    const token = jwt.sign(
        {
            documentId,
            permission: "read:write", // use "read:write" for now
            tenantId,
            user,
        },
        secret);

    const puppetMaster = new PuppetMaster(
        documentId,
        routerlicious,
        historian,
        tenantId,
        token,
        packageUrl,
        loaderType);

    return puppetMaster.launch();
}

commander
    .version("0.0.1")
    .option(
        "-d, --document [document]",
        "Document to open",
        "test")
    .parse(process.argv);

launchPuppeteer(commander.document).catch(
    (error) => {
        console.error(error);
        process.exit(1);
});

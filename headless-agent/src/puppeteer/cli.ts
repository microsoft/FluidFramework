import * as commander from "commander";
import { launchPuppeteer } from "./launcher";

const routerlicious = "https://alfred.wu2-ppe.prague.office-int.com";
const historian = "https://historian.wu2-ppe.prague.office-int.com";
const tenantId = "prague";
const secret = "43cfc3fbf04a97c0921fd23ff10f9e4b";

commander
    .version("0.0.1")
    .option(
        "-d, --document [document]",
        "Document to open",
        "test")
    .parse(process.argv);

launchPuppeteer(
    commander.document,
    routerlicious,
    historian,
    tenantId,
    secret).catch(
    (error) => {
        console.error(error);
        process.exit(1);
});

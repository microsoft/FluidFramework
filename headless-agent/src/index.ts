// tslint:disable
import * as commander from "commander";
import * as puppeteer from "puppeteer";
import { generateHtml } from "./htmlGenerator";

// https://pragueauspkn-3873244262.azureedge.net
// @chaincode/shared-text-2@0.3.12
// main
// shared-text-2-0
// https://pragueauspkn-3873244262.azureedge.net/@chaincode/shared-text-2@0.3.12/dist/main.bundle.js

async function testPage(documentId: string, page: puppeteer.Page): Promise<void> {
    const testFn = (msg: puppeteer.ConsoleMessage) => {
        const text = msg.text();
        console.log(text);
    };
    page.on("console", testFn);

    /*
    <script src="/loader.js"></script>
    <script src="/dist/main.bundle.js"></script>
    */

    await page.addScriptTag({path: "client/prague-loader.bundle.js"});
    await page.addScriptTag({url: "https://pragueauspkn-3873244262.azureedge.net/@chaincode/shared-text-2@0.3.16/dist/main.bundle.js"});
    const htmlToRender = generateHtml(documentId);
    await page.setContent(htmlToRender);

    await page.evaluate(() => {
        console.log("Trying to run");
        // localStorage.debug = "prague:*"
    });

    // console.log(`Removing listener`);
    // page.removeListener("console", testFn);
}

async function runTest(documentId: string): Promise<void> {
    console.log(`Opening ${documentId} for running tasks`);

    const browser = await puppeteer.launch({headless: false});
    const page = await browser.newPage();

    return testPage(documentId, page);
}

// Process command line input
commander
    .version("0.0.1")
    .option(
        "-d, --document [document]",
        "Document to open",
        "test")
    .parse(process.argv);

runTest(commander.document).then(
    () => {
        //
    },
    (error) => {
        console.error(error);
        process.exit(1);
    });

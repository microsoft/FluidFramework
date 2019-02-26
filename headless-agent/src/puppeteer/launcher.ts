// tslint:disable
import * as puppeteer from "puppeteer";
import { craftHtml } from "./htmlGenerator";

async function launchPage(
    documentId: string,
    routerlicious: string,
    historian: string,
    tenantId: string,
    secret: string,
    page: puppeteer.Page): Promise<void> {
    const consoleFn = (msg: puppeteer.ConsoleMessage) => {
        const text = msg.text();
        console.log(text);
    };
    page.on("console", consoleFn);

    // setimmediate falls back to an implementation based on window.postMessage.
    // All messages through that channel are intercepted by puppeteer launcher.
    // Overriding this to use a setTimeout based version.
    await page.evaluate(() => {
        (window as any).setImmediate = function(callback: any) {
            window.setTimeout(callback, 0);
        }
    });

    await page.addScriptTag({path: "client/prague-loader.bundle.js"});
    await page.addScriptTag({url: "https://pragueauspkn-3873244262.azureedge.net/@chaincode/shared-text-2@0.3.16/dist/main.bundle.js"});
    const htmlToRender = craftHtml(documentId, routerlicious, historian, tenantId, secret);
    await page.setContent(htmlToRender);
}

export async function launchPuppeteer(
    documentId: string,
    routerlicious: string,
    historian: string,
    tenantId: string,
    secret: string): Promise<void> {
    console.log(`Launching browser to load ${documentId}`);

    const browser = await puppeteer.launch({headless: false});
    const page = await browser.newPage();

    return launchPage(documentId, routerlicious, historian, tenantId, secret, page);
}

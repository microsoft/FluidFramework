import * as puppeteer from "puppeteer";
import { craftHtml } from "./htmlGenerator";

export class PuppetMaster {
    private browser: puppeteer.Browser;
    private page: puppeteer.Page;
    constructor(
        private documentId: string,
        private routerlicious: string,
        private historian: string,
        private tenantId: string,
        private token: string,
        private packageUrl: string,
        ) {}
    public async launch() {
        this.browser = await puppeteer.launch({headless: false});
        this.page = await this.browser.newPage();
        return this.launchPage();
    }

    private async launchPage(): Promise<void> {
        const consoleFn = (msg: puppeteer.ConsoleMessage) => {
            const text = msg.text();
            console.log(text);
        };
        this.page.on("console", consoleFn);

        // setimmediate falls back to an implementation based on window.postMessage.
        // All messages through that channel are intercepted by puppeteer launcher.
        // Overriding this to use a setTimeout based version.
        await this.page.evaluate(() => {
            (window as any).setImmediate = (callback: any) => {
                window.setTimeout(callback, 0);
            };
        });

        // todo (mdaumi): Hook up a function here to close the browser and remove console listener.

        await this.page.addScriptTag({path: "client/prague-loader.bundle.js"});
        const htmlToRender = craftHtml(
            this.documentId, this.routerlicious, this.historian, this.tenantId, this.token, this.packageUrl);
        await this.page.setContent(htmlToRender);
    }
}

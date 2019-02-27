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
        // { headless: false, args: ["--start-fullscreen"] }
        this.browser = await puppeteer.launch({ headless: false, args: ["--start-fullscreen"] });
        this.page = await this.browser.newPage();
        await this.page.setViewport({ width: 1920, height: 1080 });
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

        await this.page.exposeFunction("closeContainer", async () => {
            console.log(`Close function invoked! Page and Browser should close now!`);
            this.page.removeAllListeners();
            await this.page.close();
            await this.browser.close();
        });

        await this.page.addScriptTag({path: "client/prague-loader.bundle.js"});
        const htmlToRender = craftHtml(
            this.documentId, this.routerlicious, this.historian, this.tenantId, this.token, this.packageUrl);
        await this.page.setContent(htmlToRender);
    }
}

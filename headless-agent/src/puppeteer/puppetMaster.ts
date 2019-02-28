import * as puppeteer from "puppeteer";
import { ICache } from "../redisCache";
import { craftHtml } from "./htmlGenerator";

export class PuppetMaster {
    private browser: puppeteer.Browser;
    private page: puppeteer.Page;
    private cachingTimer: any;
    constructor(
        private documentId: string,
        private routerlicious: string,
        private historian: string,
        private tenantId: string,
        private token: string,
        private packageUrl: string,
        private cache?: ICache,
        ) {}
    public async launch() {
        // { headless: false, args: ["--start-fullscreen"] }
        this.browser = await puppeteer.launch();
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
            if (this.cachingTimer) {
                clearInterval(this.cachingTimer);
                this.cachingTimer = undefined;
            }
            await this.page.close();
            await this.browser.close();
        });

        await this.page.addScriptTag({path: "client/prague-loader.bundle.js"});
        const htmlToRender = craftHtml(
            this.documentId, this.routerlicious, this.historian, this.tenantId, this.token, this.packageUrl);
        await this.page.setContent(htmlToRender);

        this.cachingTimer = setInterval(() => {
            this.cachePage();
        }, 10000);
    }

    private async cachePage() {
        // const bodyHTML = await this.page.evaluate(() => document.body.innerHTML);
        // const headHTML = await this.page.evaluate(() => document.head.innerHTML);
        // const cleanBodyHTML = bodyHTML.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
        // const cleanHeadHTML = headHTML.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
        // const pageHTML = this.craftPage(cleanHeadHTML, cleanBodyHTML);
        const pageContent = await this.page.content();
        const cleanContent = pageContent.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
        if (this.cache) {
            this.cache.set(`${this.tenantId}-${this.documentId}`, cleanContent).then(() => {
                console.log(`Updated cache`);
            }, (err) => {
                console.log(`Error: ${err}`);
            });
        }
    }

    /*
    private craftPage(headHTML: string, bodyHTML: string) {
        const html = `
        <!DOCTYPE html>
        <html lang="en">
            <head>
                ${headHTML}
            </head>
            <body>
                <div id="content">
                    ${bodyHTML}
                </div>
            </body>
        </html>`;
        return html;
    }*/
}

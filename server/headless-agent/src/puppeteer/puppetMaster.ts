/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import * as puppeteer from "puppeteer";
import * as winston from "winston";
import { ICache } from "../redisCache";
// import { generateLoaderHTML } from "./htmlGenerator";
// tslint:disable-next-line: no-var-keyword prefer-const
var test = false;

export interface ICloseEvent {
    documentId: string;
    task: string;
    tenantId: string;
}

export class PuppetMaster extends EventEmitter {

    public static async launch(
        documentId: string,
        routerlicious: string,
        historian: string,
        tenantId: string,
        token: string,
        key: string,
        packageUrl: string,
        agentType: string,
        cache?: ICache): Promise<PuppetMaster> {

        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        const puppetMaster = new PuppetMaster(documentId,
            routerlicious,
            historian,
            tenantId,
            token,
            key,
            packageUrl,
            agentType,
            browser,
            page,
            cache);
        await puppetMaster.launch();

        return puppetMaster;
    }

    private cachingTimer: any;

    constructor(
        private documentId: string,
        public routerlicious: string,
        public historian: string,
        private tenantId: string,
        public token: string,
        public key: string,
        public packageUrl: string,
        private agentType: string,
        private browser: puppeteer.Browser,
        private page: puppeteer.Page,
        private cache?: ICache,
    ) {
        super();
    }

    public async launch() {
        // Debug parameters if running locally { headless: false, args: ["--start-fullscreen"] }
        await this.page.setViewport({ width: 1920, height: 1080 }); // This was for the quick load demo
        return this.launchPage();
    }

    private async launchPage(): Promise<void> {

        const consoleFn = (msg: puppeteer.ConsoleMessage) => {
            const text = msg.text();
            winston.info(text);
        };

        this.page.on("console", consoleFn);
        this.page.on("load", (e, args) => {
            console.log("Loaded - PuppetMaster");
            this.emit("load", args);
        });

        // setimmediate falls back to an implementation based on window.postMessage.
        // All messages through that channel are intercepted by puppeteer launcher.
        // Overriding this to use a setTimeout based version.
        await this.page.evaluate(() => {
            (window as any).setImmediate = (callback: any) => {
                window.setTimeout(callback, 0);
            };
        });

        await this.attachEndOfLife();

        const gatewayBase = `http://gateway:3000`;
        const gatewayUrl = `${gatewayBase}/loader/fluid/${encodeURIComponent(this.documentId)}`;
        this.page.goto(gatewayUrl);

        // await this.page.addScriptTag({ path: "client/fluid-loader.bundle.js" });
        // const htmlToRender = generateLoaderHTML(
        //     this.documentId,
        //     this.routerlicious,
        //     this.historian,
        //     this.tenantId,
        //     this.token,
        //     this.key,
        //     this.packageUrl,
        //     this.agentType,
        //     "search");
        // await this.page.setContent(htmlToRender);
        // this.page.waitForSelector(".editor")
        //     .then((element) => {
        //         console.log(`
        //         This is big! We got the .editor class.
        //         `);
        //     });
        this.upsertPageCache();
    }

    // Code running inside Browser will invoke closeContainer. In response,
    // Puppeteer will close the tab and browser window.
    private async attachEndOfLife() {
        if (test === true) {
            await this.page.exposeFunction("closeContainer", async () => {
                winston.info(`Closing browser for ${this.tenantId}/${this.documentId}/${this.agentType}`);
                this.page.removeAllListeners();
                if (this.cachingTimer) {
                    clearInterval(this.cachingTimer);
                    this.cachingTimer = undefined;
                }
                // Close the tab and browser.
                await this.page.close();
                await this.browser.close();

                // Emit an event to notify the caller.
                const closeEvent: ICloseEvent = {
                    documentId: this.documentId,
                    task: this.agentType,
                    tenantId: this.tenantId,
                };
                this.emit("close", closeEvent);
            });
        }
    }

    /**
     * Code running inside Browser will invoke cachePage with the generated cached HTML.
     * Puppeteer caches this HTML to redis
     */
    private async upsertPageCache() {
        if (test === true) {
            await this.page.exposeFunction("cachePage", async (pageHTML: string) => {
                winston.info(`Caching page for ${this.tenantId}/${this.documentId}/${this.agentType}`);
                if (this.cache) {
                    this.cache.set(`${this.tenantId}-${this.documentId}`, pageHTML).then(() => {
                        winston.info(`Updated page cache for ${this.tenantId}/${this.documentId}`);
                    }, (err) => {
                        winston.error(err);
                    });
                }
            });
        }
    }
}

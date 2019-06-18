/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import * as puppeteer from "puppeteer";
import * as winston from "winston";
import { ICache } from "../redisCache";
import { generateLoaderHTML } from "./htmlGenerator";

export interface ICloseEvent {
    documentId: string;
    task: string;
    tenantId: string;
}

export class PuppetMaster extends EventEmitter {
    private browser: puppeteer.Browser;
    private page: puppeteer.Page;
    private cachingTimer: any;
    constructor(
        private documentId: string,
        private routerlicious: string,
        private historian: string,
        private tenantId: string,
        private token: string,
        private key: string,
        private packageUrl: string,
        private agentType: string,
        private cache?: ICache,
        ) {
            super();
        }
    public async launch() {
        // Debug parameters if running locally { headless: false, args: ["--start-fullscreen"] }
        this.browser = await puppeteer.launch();
        this.page = await this.browser.newPage();
        await this.page.setViewport({ width: 1920, height: 1080 });
        return this.launchPage();
    }

    private async launchPage(): Promise<void> {
        const consoleFn = (msg: puppeteer.ConsoleMessage) => {
            const text = msg.text();
            winston.info(text);
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

        await this.attachEndOfLife();

        await this.page.addScriptTag({path: "client/prague-loader.bundle.js"});
        const htmlToRender = generateLoaderHTML(
            this.documentId,
            this.routerlicious,
            this.historian,
            this.tenantId,
            this.token,
            this.key,
            this.packageUrl,
            this.agentType);
        await this.page.setContent(htmlToRender);

        this.upsertPageCache();
    }

    // Code running inside Browser will invoke closeContainer. In response,
    // Puppeteer will close the tab and browser window.
    private async attachEndOfLife() {
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

    // Code running inside Browser will invoke cachePage with the generated cached HTML.
    // Puppeteer will cache that in redis.
    private async upsertPageCache() {
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

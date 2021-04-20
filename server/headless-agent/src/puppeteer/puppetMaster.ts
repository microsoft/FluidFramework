/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import * as jwt from "jsonwebtoken";
import * as puppeteer from "puppeteer";
import request from "request";
import * as winston from "winston";
import { ICache } from "../redisCache";

export interface ICloseEvent {
    documentId: string;
    task: string;
    tenantId: string;
}

export class PuppetMaster extends EventEmitter {
    public static async create(
        documentId: string,
        tenantId: string,
        gatewayUrl: string,
        agentType: string,
        jwtKey: string,
        cache?: ICache): Promise<PuppetMaster> {
        const browser = await puppeteer.launch({
            headless: true, // headless: false launches a browser window
        });

        const page = await browser.newPage();
        const token = jwt.sign(
            {
                documentId,
                scopes: ["doc:read", "doc:write", "summary:write"],
                tenantId,
                user: {
                    id: "headless-chrome",
                    name: "Arnold Wesker",
                },
            },
            jwtKey);

        const puppetMaster = new PuppetMaster(documentId,
            tenantId,
            gatewayUrl,
            agentType,
            browser,
            page,
            token,
            cache);
        await puppetMaster.launch();

        return puppetMaster;
    }
    private cachingTimer: any;

    constructor(
        private readonly documentId: string,
        private readonly tenantId: string,
        private readonly gatewayUrl: string,
        private readonly agentType: string,
        private readonly browser: puppeteer.Browser,
        private readonly page: puppeteer.Page,
        private readonly token: string,
        private readonly cache?: ICache,
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

        const resolvedUrl = await this.getResolvedUrl();
        this.page.on("load", (e, args) => {
            this.emit("load", args);
        });

        // setimmediate falls back to an implementation based on window.postMessage.
        // All messages through that channel are intercepted by puppeteer launcher.
        // Overriding this to use a setTimeout based version.
        await this.page.evaluate(() => {
            (window as any).setImmediate = (callback: any) => {
                // eslint-disable-next-line @typescript-eslint/no-implied-eval
                window.setTimeout(callback, 0);
            };
        });
        await this.attachEndOfLife();

        // Joining the gateway hostname to allow for localstorage
        await this.page.goto(`${this.gatewayUrl}/public/images/`);
        await this.page.addScriptTag({ path: "client/fluid-loader.bundle.js" });
        await this.page.evaluate((resolvedUrlString) => {
            const resolvedUrlInternal = JSON.parse(resolvedUrlString) as IResolvedUrl;
            document.body.innerHTML = `
            <div id="content" style="flex: 1 1 auto; position: relative"></div>
            `;

            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return (window as any).loader.startLoading(resolvedUrlInternal);
        }, JSON.stringify(resolvedUrl));

        if (this.agentType === "cache") {
            await this.upsertPageCache();
        }
    }

    // Code running inside Browser will invoke closeContainer. In response,
    // Puppeteer will close the tab and browser window.
    private async attachEndOfLife() {
        await this.page.exposeFunction("closeContainer", async () => {
            winston.info(`Closing browser for ${this.tenantId}/${this.documentId}/${this.agentType}`);
            this.page.removeAllListeners();
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
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

    /**
     * Code running inside Browser will invoke cachePage with the generated cached HTML.
     * Puppeteer caches this HTML to redis
     */
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

    private async getResolvedUrl() {
        const path =
        `${this.gatewayUrl}/loader/${encodeURIComponent(this.tenantId)}/${encodeURIComponent(this.documentId)}`;

        const options = {
            form: {
                url: path,
            },
            headers: {
                "Authorization": `Bearer ${this.token}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            method: "POST",
            url: `${this.gatewayUrl}/api/v1/load`,
        };

        return new Promise<IResolvedUrl>((resolve, reject) => {
            request(options, (err, response, body) => {
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                if (err) {
                    reject(err);
                }
                const resolvedUrl = JSON.parse(body) as IResolvedUrl;
                resolve(resolvedUrl);
            });
        });
    }
}

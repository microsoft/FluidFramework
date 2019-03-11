import * as puppeteer from "puppeteer";
import * as winston from "winston";
import { ICache } from "../redisCache";
import { createCacheHTML } from "./cacheGenerator";
import { generateLoaderHTML } from "./htmlGenerator";

const cachingIntervalMS = 10000;
const cachePiggybackType = "snapshot";

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
        private key: string,
        private packageUrl: string,
        private agentType: string,
        private cache?: ICache,
        ) {}
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
            this.page.removeAllListeners();
            if (this.cachingTimer) {
                clearInterval(this.cachingTimer);
                this.cachingTimer = undefined;
            }
            await this.page.close();
            await this.browser.close();
            winston.info(`Closed browser for ${this.tenantId}/${this.documentId}/${this.agentType}`);
        });
    }

    // todo (mdaumi): Right now we piggyback on a agent to cache the page.
    // May be make this an independent agent?
    private upsertPageCache() {
        if (this.cache && this.agentType === cachePiggybackType) {
            this.cachingTimer = setInterval(async () => {
                this.cache.set(`${this.tenantId}-${this.documentId}`, await createCacheHTML(this.page)).then(() => {
                    winston.info(`Updated page cache for ${this.tenantId}/${this.documentId}`);
                }, (err) => {
                    winston.error(err);
                });
            }, cachingIntervalMS);
        }
    }
}

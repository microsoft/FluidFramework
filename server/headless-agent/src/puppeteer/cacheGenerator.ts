/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Page } from "puppeteer";

// Extract the head and body HTML. Remove any <script> tag. And then wrap inside a basic HTML page.
// todo (mdaumi): Chaincode should specify how to do this. This should be used as a fallback.
export async function createCacheHTML(page: Page): Promise<string> {
    const [bodyHTML, headHTML] = await page.evaluate(() => [document.body.innerHTML, document.head.innerHTML]);
    const cleanBodyHTML = bodyHTML.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
    const cleanHeadHTML = headHTML.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
    const pageHTML = craftCachePage(cleanHeadHTML, cleanBodyHTML);
    return pageHTML;
}

function craftCachePage(headHTML: string, bodyHTML: string) {
    const html = `
    <!DOCTYPE html>
    <html lang="en">
        <head>
            ${headHTML}
        </head>
        <body>
            <div id="content" style="height:100%; width:100%">
                ${bodyHTML}
            </div>
        </body>
    </html>`;
    return html;
}

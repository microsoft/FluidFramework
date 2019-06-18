/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as loader from "@prague/loader";
import { WebLoader, WebPlatformFactory } from "@prague/loader-web";
import * as socketStorage from "@prague/socket-storage";
import * as axios from "axios";
import * as jwt from "jsonwebtoken";
import * as URL from "url-parse";

class PraguePlugin {
    public static create(Reveal: any): PraguePlugin {
        const plugin = new PraguePlugin();

        Reveal.addEventListener(
            "ready",
            () => {
                plugin.load();
            });

        return plugin;
    }

    private documents = new Map<string, loader.Document>();

    private load() {
        if (!document.querySelector("section[data-markdown]:not([data-markdown-parsed])")) {
            const pragueDocs = document.querySelectorAll<HTMLElement>(".prague");
            for (const pragueDoc of pragueDocs) {
                pragueDoc.style.cssText =
                    "margin: 0;position: absolute; left: 50%;transform: translate(-50%,0%);" +
                    pragueDoc.style.cssText;
                const documentId = pragueDoc.getAttribute("data-src");
                const docDiv = document.createElement("div");
                pragueDoc.appendChild(docDiv);

                setTimeout(() => {
                    this.loadDocument(documentId, docDiv);
                }, 200);
            }
        } else {
            // wait for markdown to be loaded and parsed
            setTimeout(
                () => this.load(),
                100);
        }
    }

    private async loadDocument(documentUrl: string, div: HTMLDivElement) {
        // parse ID to get document location
        const url = new URL(documentUrl);
        const splitPath = url.pathname.split("/");

        const tenantDetails = await axios.default.get(`${url.origin}/api/tenants`);
        const routerlicious = url.origin;
        const historian = tenantDetails.data.blobStorageUrl;
        const tenantId = tenantDetails.data.id;
        const secret = tenantDetails.data.key;
        const documentId = splitPath[splitPath.length - 1];
        const user = {
            id: "test",
        };

        const token = jwt.sign(
            {
                documentId,
                permission: "read:write", // use "read:write" for now
                tenantId,
                user,
            },
            secret);

        const documentServices = socketStorage.createDocumentService(routerlicious, historian);

        const webLoader = new WebLoader(tenantDetails.data.npm);
        const webPlatform = new WebPlatformFactory(div);

        const documentP = loader.load(
            documentId,
            tenantId,
            user,
            new socketStorage.TokenProvider(token),
            { blockUpdateMarkers: true },
            webPlatform,
            documentServices,
            webLoader,
            null,
            true);
        const document = await documentP;

        this.documents.set(documentId, document);
    }
}

if (typeof window !== "undefined") {
    const Reveal = window["Reveal"];
    window["PragueEmbed"] = window["PragueEmbed"] || PraguePlugin.create(Reveal);
}

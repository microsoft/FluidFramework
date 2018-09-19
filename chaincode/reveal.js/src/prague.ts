import * as loader from "@prague/loader";
import { WebLoader, WebPlatform } from "@prague/loader-web";
import { IDocumentService, ITokenService } from "@prague/runtime-definitions";
import * as socketStorage from "@prague/socket-storage";
import * as jwt from "jsonwebtoken";

const routerlicious = "https://alfred.wu2-ppe.prague.office-int.com";
const historian = "https://historian.wu2-ppe.prague.office-int.com";
const tenantId = "thirsty-shirley";
const secret = "f793c1603cf75ea41a09804e94f43cd2";

class PraguePlugin {
    static Create(Reveal: any): PraguePlugin {
        const plugin = new PraguePlugin();

        Reveal.addEventListener(
            "ready",
            () => {
                plugin.load();
            });

        return plugin;
    }

    private documentServices: IDocumentService;
    private tokenService: ITokenService;
    private documents = new Map<string, loader.Document>();

    constructor() {
        this.documentServices = socketStorage.createDocumentService(routerlicious, historian);
        this.tokenService = new socketStorage.TokenService();
    }

    private load() {
        if (!document.querySelector("section[data-markdown]:not([data-markdown-parsed])")) {
            const pragueDocs = document.querySelectorAll<HTMLElement>(".prague");
            for (const pragueDoc of pragueDocs) {
                pragueDoc.style.cssText =
                    "margin: 0;position: absolute; left: 50%;transform: translate(-50%,0%);" +
                    pragueDoc.style.cssText;
                const documentId = pragueDoc.getAttribute('data-src');
                const docDiv = document.createElement("div");
                pragueDoc.appendChild(docDiv);

                setTimeout(() => {
                    this.loadDocument(documentId, docDiv);
                }, 200);
            }
        }
        else {
            // wait for markdown to be loaded and parsed
            setTimeout(
                () => this.load(),
                100);
        }
    }

    private async loadDocument(documentId: string, div: HTMLDivElement) {
        const token = jwt.sign(
            {
                documentId,
                permission: "read:write", // use "read:write" for now
                tenantId,
                user: {
                    id: "test",
                },
            },
            secret);

        const webLoader = new WebLoader("https://packages.wu2.prague.office-int.com");
        const webPlatform = new WebPlatform(div);

        const documentP = loader.load(
            token,
            null,
            webPlatform,
            this.documentServices,
            webLoader,
            this.tokenService,
            null,
            true);
        const document = await documentP;

        this.documents.set(documentId, document);
    }
}

if (typeof window !== 'undefined') {
    const Reveal = window["Reveal"];
    window["PragueEmbed"] = window["PragueEmbed"] || PraguePlugin.Create(Reveal);
}

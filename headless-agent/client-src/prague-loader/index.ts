// tslint:disable max-classes-per-file
import { IChaincodeFactory, ICodeLoader } from "@prague/container-definitions";
import { Container, Loader } from "@prague/container-loader";
import { createDocumentService, TokenProvider } from "@prague/routerlicious-socket-storage";
import { IComponentRuntime } from "@prague/runtime-definitions";
import * as jwt from "jsonwebtoken";
import { WebPlatform } from "./webPlatform";

class CodeLoader implements ICodeLoader {
    constructor(private factory: IChaincodeFactory) {
    }

    public async load(source: string): Promise<IChaincodeFactory> {
        return Promise.resolve(this.factory);
    }
}

class LocalPlatform extends WebPlatform {
    constructor(div: HTMLElement) {
        super(div);
    }

    public async detach() {
        return;
    }
}

async function attach(loader: Loader, url: string, platform: LocalPlatform) {
    console.log(url);
    const response = await loader.request({ url });

    if (response.status !== 200) {
        return;
    }
    console.log(response.mimeType);
    console.log(response.status);
    switch (response.mimeType) {
        case "prague/component":
            const component = response.value as IComponentRuntime;
            component.attach(platform);
            console.log(component.id);
            break;
    }
}

export async function registerAttach(loader: Loader, container: Container, uri: string, platform: LocalPlatform) {
    console.log(`Attaching a web platform`);
    attach(loader, uri, platform).catch((err) => {
        console.log(err);
    });
    container.on("contextChanged", (value) => {
        attach(loader, uri, platform);
    });
}

export async function startLoading(
    id: string,
    factory: IChaincodeFactory,
    routerlicious: string,
    historian: string,
    tenantId: string,
    secret: string): Promise<void> {

    console.log(`Doing something with ${id}!`);
    const documentServices = createDocumentService(routerlicious, historian);

    const codeLoader = new CodeLoader(factory);
    // console.log(JSON.stringify(factory));
    // await factory.instantiateRuntime(null);
    const user = {
        id: "test",
        name: "tanvir",
    };

    const token = jwt.sign(
        {
            documentId: id,
            permission: "read:write", // use "read:write" for now
            tenantId,
            user,
        },
        secret);
    const tokenProvider = new TokenProvider(token);
    console.log(token);

    codeLoader.load("").catch((error) => console.error("script load error", error));

    const loader = new Loader(
        { tokenProvider },
        documentServices,
        codeLoader,
        { encrypted: undefined, localMinSeq: 0, client: { type: "snapshot"} });

    const baseUrl =
        `prague://prague.com/` +
        `${encodeURIComponent(tenantId)}/${encodeURIComponent(id)}`;
    const container = await loader.resolve({ url: baseUrl });

    // Wait to be fully connected!
    if (!container.connected) {
        await new Promise<void>((resolve) => container.on("connected", () => resolve()));
    }

    console.log(`${container.id} is fully connected`);

    const platform = new LocalPlatform(document.getElementById("content"));
    registerAttach(loader, container, baseUrl, platform);
}

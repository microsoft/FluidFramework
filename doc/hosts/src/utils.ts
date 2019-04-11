import { IPlatform } from "@prague/container-definitions";
import { Container, Loader } from "@prague/container-loader";
import { parse } from "querystring";

/**
 * The initializeChaincode method takes in a document and a desired NPM package and establishes a code quorum
 * on this package.
 */
export async function initializeChaincode(document: Container, pkg: string): Promise<void> {
    if (!pkg) {
        return;
    }

    const quorum = document.getQuorum();

    // Wait for connection so that proposals can be sent
    if (!document.connected) {
        await new Promise<void>((resolve) => document.on("connected", () => resolve()));
    }

    // And then make the proposal if a code proposal has not yet been made
    if (!quorum.has("code2")) {
        await quorum.propose("code2", pkg);
    }

    console.log(`Code is ${quorum.get("code2")}`);
}

/**
 * attachCore is used to make a request against the loader to load a prague component. And then attaches to it once
 * found.
 */
async function attachCore(loader: Loader, url: string, platform: IPlatform) {
    const response = await loader.request({ url });

    if (response.status !== 200) {
        return;
    }

    switch (response.mimeType) {
        case "prague/component":
            const component = response.value;
            component.attach(platform);
            break;
    }
}

/**
 * attach is used to allow a host to attach to a Prague URL. Given that we may be establishing a new set of code
 * on the document it listens for the "contextChanged" event which fires when a new code value is quorumed on. In this
 * case it simply runs the attach method again.
 */
export async function attach(loader: Loader, container: Container, url: string, platform: IPlatform) {
    attachCore(loader, url, platform);
    container.on("contextChanged", () => {
        attachCore(loader, url, platform);
    });
}

export function parsePackageName(url: Location, defaultPkg: string): string {
    const parsed = parse(url.search.substr(1));
    return parsed.chaincode ? parsed.chaincode as string : defaultPkg;
}

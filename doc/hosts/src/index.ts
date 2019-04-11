import { Loader } from "@prague/container-loader";
import { RouterliciousDocumentServiceFactory } from "@prague/routerlicious-socket-storage";
import { CodeLoader } from "./codeLoader";
import { HostPlatform } from "./hostPlatform";
import { InsecureUrlResolver } from "./urlResolver";
import { initializeChaincode, parsePackageName, registerAttach } from "./utils";

const ordererUrl = "https://alfred.wu2.prague.office-int.com";
const storageUrl = "https://historian.wu2.prague.office-int.com";
const tenantId = "determined-bassi";
const tenantKey = "b5d0ad51e24b0d364503fd48b1f53181";
const userId = "test";
const npm = "https://pragueauspkn-3873244262.azureedge.net";
const defaultPackage = "@chaincode/shared-text@0.3.5692";

export async function start(url: string, code: string): Promise<void> {
    // Generate driver interface
    const documentServicesFactory = new RouterliciousDocumentServiceFactory();
    const insecureResolver = new InsecureUrlResolver(
        ordererUrl,
        storageUrl,
        tenantId,
        tenantKey,
        userId);

    // Create the web loader and prefetch the chaincode we will need
    const codeLoader = new CodeLoader(npm);
    const loader = new Loader(
        { resolver: insecureResolver },
        documentServicesFactory,
        codeLoader,
        { blockUpdateMarkers: true });

    const container = await loader.resolve({ url });

    const platform = new HostPlatform(document.getElementById("content"));
    registerAttach(
        loader,
        container,
        url,
        platform);

    // If this is a new document we will go and instantiate the chaincode. For old documents we assume a legacy
    // package.
    if (!container.existing) {
        await initializeChaincode(container, code)
            .catch((error) => console.error("chaincode error", error));
    }
}

// Load the initial page based on the URL
if (document.location.pathname === "/") {
    window.location.href = `/example?${defaultPackage}`;
} else {
    start(document.location.href, parsePackageName(document.location, defaultPackage));
}

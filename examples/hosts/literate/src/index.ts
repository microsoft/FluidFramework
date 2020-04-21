/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidCodeDetails, IProxyLoaderFactory } from "@microsoft/fluid-container-definitions";
import { Loader } from "@microsoft/fluid-container-loader";
import { IUser } from "@microsoft/fluid-protocol-definitions";
import { RouterliciousDocumentServiceFactory } from "@microsoft/fluid-routerlicious-driver";
import { extractDetails, WebCodeLoader, WhiteList } from "@microsoft/fluid-web-code-loader";
import { InsecureUrlResolver } from "./urlResolver";
import { attach, initializeChaincode, parsePackageName } from "./utils";

// Base service configuration.
const ordererUrl = "http://localhost:3000";
const storageUrl = "http://localhost:3000";
const npm = "https://pragueauspkn-3873244262.azureedge.net";
const defaultPackage = "@chaincode/smde@0.10.13378";

// You'll likely want to create your own tenant at https://admin.wu2.prague.office-int.com and then change the
// tenantId and tenantKey values.
const tenantId = "determined-bassi";
const tenantKey = "b5d0ad51e24b0d364503fd48b1f53181";
// This represents the information for the logged in user. The service never uses it directly but provides it as part
// of the join message. Your app can then use this to understand who created the op. Note that this object is intended
// to be derived from. The API only requires a field named 'id' but you can create your own fields on it as well. For
// example we defined a 'name' field.
const user = {
    id: "test",                     // Required value
    name: "Test User",       // Optional value that we included
} as IUser;

export async function start(url: string, code: string): Promise<void> {
    // Create the InsecureUrlResolve so we can generate access tokens to connect to Fluid documents stored in our
    // tenant. Note that given we are storing the tenant secret in the clear on the client side this is a security
    // hole but it simplifies setting up this example. To make this clear we named it the InsecureUrlResolver. You would
    // not want to use this in a production environment and would want to protect the secret on your server. To give
    // the client access you would then have the client code authenticate via OAuth (or similar) and perform REST
    // calls against your service.
    const insecureResolver = new InsecureUrlResolver(
        ordererUrl,
        storageUrl,
        tenantId,
        tenantKey,
        user);

    // The RouterliciousDocumentServiceFactory creates the driver that allows connections to the Routerlicious service.
    const documentServicesFactory = new RouterliciousDocumentServiceFactory();

    // The code loader provides the ability to load npm packages that have been quorumed on and that represent
    // the code for the document. The base WebCodeLoader supports both code on a CDN as well as those defined
    // within an npm repository. Future work plans to extend this to allow for tarballs, git repos, and files stored
    // directly within the document (or another Fluid document).
    //
    // When in a node environment any npm package will be installed directly. But when int he browser the loader
    // looks at the package's package.json for a special 'fluid' entry which defines the code designed to be run in
    // the browser as well as the name of the entry point module. It then script includes these files on the page and
    // once loaded makes use of the module entry point name to get access to the module.
    const codeLoader = new WebCodeLoader(new WhiteList());

    // Finally with all the above objects created we can fully construct the loader
    const loader = new Loader(
        insecureResolver,
        documentServicesFactory,
        codeLoader,
        { blockUpdateMarkers: true },
        null,
        new Map<string, IProxyLoaderFactory>());

    // We start by resolving the URL to its underlying Fluid document. This gives low-level access which will enable
    // us to quorum on code later or detect when the code quorum has changed. In many cases you may not need this
    // behavior and can instead just directly make requests against the document.
    const fluidDocument = await loader.resolve({ url });

    // The attach helper method performs the actual attachment of the above platform to the component identified
    // by the URL in the browser. Once the attach is complete the component will render to the provided div.
    attach(loader, fluidDocument, url, document.getElementById("content") as HTMLDivElement);

    // This step is used when creating a new document. In the case that your host is only loading existing documents
    // then this is not necessary. But should you wish to create new ones this step goes and proposes the passed in
    // package name on the code quorum. We only perform this check for new documents.
    if (!fluidDocument.existing) {
        const parsedPackage = extractDetails(code);
        const details: IFluidCodeDetails = {
            config: {
                [`@${parsedPackage.scope}:cdn`]: npm,
            },
            package: code,
        };

        await initializeChaincode(fluidDocument, details)
            .catch((error) => console.error("chaincode error", error));
    }
}

// Load the initial page based on the URL. If no document ID is specified default to one named example.
if (document.location.pathname === "/") {
    window.location.href = `/example?${defaultPackage}`;
} else {
    start(document.location.href, parsePackageName(document.location, defaultPackage));
}

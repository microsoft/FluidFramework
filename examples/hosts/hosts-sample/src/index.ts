/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Loader } from "@fluidframework/container-loader";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { IUser } from "@fluidframework/protocol-definitions";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { InsecureUrlResolver } from "@fluidframework/test-runtime-utils";
import {
    extractPackageIdentifierDetails,
    SemVerCdnCodeResolver,
    WebCodeLoader,
    AllowList,
} from "@fluidframework/web-code-loader";
import { getFluidObjectAndRender, parsePackageName } from "./utils";

// Base service configuration. (Tinylicious)
const hostUrl = "http://localhost:3000";
const ordererUrl = "http://localhost:3000";
const storageUrl = "http://localhost:3000";
const npm = "http://localhost:4873";
const defaultPackage = "@fluid-example/smde@0.18.1";

// Tinylicious doesn't care able these values
const tenantId = "unused";
const tenantKey = "unused";
const bearerSecret = "";

// This represents the information for the logged in user. The service never uses it directly but provides it as part
// of the join message. Your app can then use this to understand who created the op. Note that this object is intended
// to be derived from. The API only requires a field named 'id' but you can create your own fields on it as well. For
// example we defined a 'name' field.
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const user = {
    id: "test",                     // Required value
    name: "Test User",       // Optional value that we included
} as IUser;

export async function start(url: string, code: string, createNew: boolean): Promise<void> {
    // Create the InsecureUrlResolve so we can generate access tokens to connect to Fluid documents stored in our
    // tenant. Note that given we are storing the tenant secret in the clear on the client side this is a security
    // hole but it simplifies setting up this example. To make this clear we named it the InsecureUrlResolver. You would
    // not want to use this in a production environment and would want to protect the secret on your server. To give
    // the client access you would then have the client code authenticate via OAuth (or similar) and perform REST
    // calls against your service.
    const urlResolver = new InsecureUrlResolver(
        hostUrl,
        ordererUrl,
        storageUrl,
        tenantId,
        tenantKey,
        user,
        bearerSecret);

    // The RouterliciousDocumentServiceFactory creates the driver that allows connections to the Routerlicious service.
    const documentServiceFactory = new RouterliciousDocumentServiceFactory();

    // The code loader provides the ability to load npm packages that have been quorumed on and that represent
    // the code for the document. The base WebCodeLoader supports both code on a CDN as well as those defined
    // within an npm repository. Future work plans to extend this to allow for tarballs, git repos, and files stored
    // directly within the document (or another Fluid document).
    //
    // When in a node environment any npm package will be installed directly. But when in the browser the loader
    // looks at the package's package.json for a special 'fluid' entry which defines the code designed to be run in
    // the browser as well as the name of the entry point module. It then script includes these files on the page and
    // once loaded makes use of the module entry point name to get access to the module.
    const codeLoader = new WebCodeLoader(new SemVerCdnCodeResolver(), new AllowList());

    // Finally with all the above objects created we can fully construct the loader
    const loader = new Loader({
        urlResolver,
        documentServiceFactory,
        codeLoader,
    });

    let container;
    if (createNew) {
        // This flow is used to create a new container and then attach it to storage.
        const parsedPackage = extractPackageIdentifierDetails(code);
        const details: IFluidCodeDetails = {
            config: {
                [`@${parsedPackage.scope}:cdn`]: npm,
            },
            package: code,
        };
        container = await loader.createDetachedContainer(details);
        await container.attach(urlResolver.createCreateNewRequest("example"));
    } else {
        // This flow is used to get the existing container.
        container = await loader.resolve({ url });
    }

    // The getFluidObjectAndRender helper method performs the rendering of the data store identified
    // by the URL in the browser.
    await getFluidObjectAndRender(loader, container, url, document.getElementById("content") as HTMLDivElement);
}

// Load the initial page based on the URL. If no document ID is specified default to one named example.
if (document.location.pathname === "/") {
    window.location.href = `/example?${defaultPackage}#CreateNew`;
} else {
    let createNew = false;
    if (window.location.hash === "#CreateNew") {
        createNew = true;
        window.location.hash = "";
    }
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    start(document.location.href, parsePackageName(document.location, defaultPackage), createNew);
}

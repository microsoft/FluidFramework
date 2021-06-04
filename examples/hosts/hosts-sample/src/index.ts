/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Container, Loader } from "@fluidframework/container-loader";
import {
    IUser,
} from "@fluidframework/protocol-definitions";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import {
    InsecureTokenProvider,
    InsecureUrlResolver,
} from "@fluidframework/test-runtime-utils";
import {
    extractPackageIdentifierDetails,
    IPackageIdentifierDetails,
    // SemVerCdnCodeResolver,
    // WebCodeLoader,
    // AllowList,
} from "@fluidframework/web-code-loader";
import { bindUI, setupUI } from "./codeDetailsView";
import {
    fauxPackageCodeLoaderForVersion,
    fauxPackageDetailsV1,
} from "./fauxPackage";
import { getFluidObjectAndRender, parsePackageName } from "./utils";

// Tinylicious service endpoints
const hostUrl = "http://localhost:7070";
const ordererUrl = "http://localhost:7070";
const storageUrl = "http://localhost:7070";
// const npm = "http://localhost:4873";

const defaultDocument = "example";
const defaultPackage = "@fluid-example/faux-package@1.0.0";

// Use the application name as a tinylicious tenant ID
const tenantId = "hosts-sample";
// Key is not used by tinylicious
const tenantKey = "unused";
const bearerSecret = "";

// This represents the information for the logged in user. The service never uses it directly but provides it as part
// of the join message. Your app can then use this to understand who created the op. Note that this object is intended
// to be derived from. The API only requires a field named 'id' but you can create your own fields on it as well. For
// example we defined a 'name' field.
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const user = {
    id: "test", // Required value
    name: "Test User", // Optional value that we included
} as IUser;

export async function start(
    url: string,
    packageDetails: IPackageIdentifierDetails,
    shouldCreateNewDocument: boolean,
) {
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
        bearerSecret,
    );

    const tokenProvider = new InsecureTokenProvider(tenantKey, user);

    // The RouterliciousDocumentServiceFactory creates the driver that allows connections to the Routerlicious service.
    const documentServiceFactory = new RouterliciousDocumentServiceFactory(
        tokenProvider,
    );

    // The code loader provides the ability to load npm packages that have been quorumed on and that represent
    // the code for the document. The base WebCodeLoader supports both code on a CDN as well as those defined
    // within an npm repository. Future work plans to extend this to allow for tarballs, git repos, and files stored
    // directly within the document (or another Fluid document).
    //
    // When in a node environment any npm package will be installed directly. But when in the browser the loader
    // looks at the package's package.json for a special 'fluid' entry which defines the code designed to be run in
    // the browser as well as the name of the entry point module. It then script includes these files on the page and
    // once loaded makes use of the module entry point name to get access to the module.
    // const codeLoader = new WebCodeLoader(new SemVerCdnCodeResolver(), new AllowList());

    // Finally with all the above objects created we can fully construct the loader
    const loader = new Loader({
        urlResolver,
        documentServiceFactory,
        codeLoader: fauxPackageCodeLoaderForVersion(packageDetails.version),
    });

    let container: Container | undefined;
    if (shouldCreateNewDocument) {
        // This flow is used to create a new container and then attach it to storage.
        // const details: IFluidCodeDetails = {
        //     config: {
        //         [`@${parsedPackage.scope}:cdn`]: npm,
        //     },
        //     package: code,
        // };
        const details = fauxPackageDetailsV1;
        container = await loader.createDetachedContainer(details);
        try {
            await container.attach(
                urlResolver.createCreateNewRequest(defaultDocument),
            );
        } catch (error) {
            if (error.statusCode === 400) {
                // error occurred during the attempt to create a new document
                // will try to load an existing document with the same url
                container = undefined;
            } else {
                // unexpected error, re-throw
                throw error;
            }
        }
    }

    if (container === undefined) {
        // This flow is used to get the existing container.
        container = await loader.resolve({ url });
    }

    // Wait for connection so that proposals can be sent
    if (!container.connected) {
        console.log("waiting for the container to get connected");
        await new Promise<void>((resolve, reject) => {
            container?.once("connected", () => resolve());
            container?.once("closed", (error) =>
                reject(
                    new Error(
                        `Container closed unexpectedly. ${error?.message}`,
                    ),
                ),
            );
        });
    }

    // The getFluidObjectAndRender helper method performs the rendering of the data store identified
    // by the URL in the browser.
    await getFluidObjectAndRender(
        loader,
        container,
        url,
        document.getElementById("content") as HTMLDivElement,
    );

    return container;
}

// Load the initial page based on the URL. If no document ID is specified default to one named example.
if (document.location.pathname === "/") {
    window.location.href = `/${defaultDocument}?#CreateNew`;
} else {
    let shouldCreateNewDocument = false;
    if (window.location.hash === "#CreateNew") {
        shouldCreateNewDocument = true;
        window.location.hash = "";
    }

    const code = parsePackageName(document.location, defaultPackage);
    const packageDetails = extractPackageIdentifierDetails(code);
    setupUI(packageDetails);

    start(document.location.href, packageDetails, shouldCreateNewDocument)
        .then((container) => bindUI(container, packageDetails))
        .catch((error) => window.alert(`🛑 Failed to open document 🛑\n${error}`));
}

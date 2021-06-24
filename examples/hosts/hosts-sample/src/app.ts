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
} from "@fluidframework/web-code-loader";
import { bindUI, setupUI } from "./codeDetailsView";
import { getCodeLoaderForPackage } from "./codeDetailsLoader";
import { getFluidObjectAndRender, parsePackageName } from "./utils";

// Tinylicious service endpoints
const hostUrl = "http://localhost:7070";
const ordererUrl = "http://localhost:7070";
const storageUrl = "http://localhost:7070";

const defaultDocument = "example";
const createNewHash = "#CreateNew";
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

    // The code loader provides the ability to load code packages that have been quorumed on and that represent
    // the code for the document.
    const codeLoader = getCodeLoaderForPackage(packageDetails);

    // Finally with all the above objects created we can fully construct the loader
    const loader = new Loader({
        urlResolver,
        documentServiceFactory,
        codeLoader,
    });

    let container: Container | undefined;
    if (shouldCreateNewDocument) {
        // This flow is used to create a new container and then attach it to storage.
        container = await loader.createDetachedContainer({
            package: packageDetails.fullId,
        });
        try {
            await container.attach(
                urlResolver.createCreateNewRequest(defaultDocument),
            );
        } catch (error) {
            if (error.statusCode === 400) {
                // error occurred during the attempt to create a new document
                // we'll try to load an existing document with the same url below
                container = undefined;
            } else {
                // unexpected error, bail out
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
            container?.once("closed", (error) => {
                if (error?.message === "ExistingContextDoesNotSatisfyIncomingProposal") {
                    reject(
                        new Error(
                            `Loaded code is not compatible with the document schema.`,
                        ),
                    );
                } else {
                    reject(
                        new Error(
                            `Container closed unexpectedly. ${error?.message}`,
                        ),
                    );
                }
            });
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

// Parse the browser URL and load the app page.
// The URL format:
// ```
// http://localhost:8080/[document-id][#CreateNew][?chaincode=package-id]
// ```
// , where
// `document-id` - is a alphanumerical string representing the Fluid document ID.
// `package-id` - is a Fluid code package name and version in the following format `@scope/package-name@semver`.
// `#CreateNew` - a hashtag indicating the app should create a new document with the specified document ID.
if (document.location.pathname === "/") {
    // Use a default document ID when not specified by the user
    window.location.href = `/${defaultDocument}?${createNewHash}`;
} else {
    let shouldCreateNewDocument = false;
    if (window.location.hash === createNewHash) {
        shouldCreateNewDocument = true;
        window.location.hash = "";
    }

    const code = parsePackageName(document.location, defaultPackage);
    const packageDetails = extractPackageIdentifierDetails(code);
    setupUI(packageDetails);

    start(document.location.href, packageDetails, shouldCreateNewDocument)
        .then((container) => bindUI(container, packageDetails))
        .catch((error) => window.alert(`🛑 Failed to open document\n\n${error}`));
}

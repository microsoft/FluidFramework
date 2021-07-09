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
import { setupUI } from "./codeDetailsView";
import { getCodeLoaderForPackage } from "./codeDetailsLoader";
import { getFluidObjectAndRender, parsePackageName } from "./utils";

// Tinylicious service endpoints
const hostUrl = "http://localhost:7070";
const ordererUrl = "http://localhost:7070";
const storageUrl = "http://localhost:7070";

// Default app URL params
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

// Parse the browser URL and load the app home page.
// The URL format:
// ```
// http://localhost:8080/[document-id][?code=package-id][#CreateNew]
// ```
// , where
// `document-id` - is an alphanumerical string representing the unique Fluid document ID.
// `package-id` - is a Fluid code package name and version in the following format `@<scope>/<package-name>@<semver>`.
// `#CreateNew` - a hashtag indicating the app should create a new document with the specified document ID.
function parseAppUrl() {
    // Create a new container with the specified ID when the hash param is provided
    const isNew = window.location.hash === createNewHash;
    window.location.hash = "";
    const documentId = window.location.pathname.split("/")[1];
    const packageName = parsePackageName(document.location, defaultPackage);
    return { packageName, documentId, isNew };
}

// Create or load the Fluid container using specified document and package info and render the root component.
async function start(
    url: string,
    containerId: string,
    packageId: IPackageIdentifierDetails,
    shouldCreateNew: boolean,
) {
    // Create the InsecureUrlResolver so we can generate access tokens to connect to Fluid documents stored in our
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

    // The RouterliciousDocumentServiceFactory creates the driver that allows connections to the Tinylicious service.
    const documentServiceFactory = new RouterliciousDocumentServiceFactory(
        tokenProvider,
    );

    // The code loader provides the ability to load code packages that have been quorumed on and that represent
    // the code for the document.
    const codeLoader = getCodeLoaderForPackage(packageId);

    // Finally with all the above objects created we can construct the loader
    const loader = new Loader({
        urlResolver,
        documentServiceFactory,
        codeLoader,
    });

    let container: Container;
    if (shouldCreateNew) {
        // This flow is used to create a new container and then attach it to the storage.
        container = await loader.createDetachedContainer({
            package: packageId.fullId,
        });
        await container.attach(urlResolver.createCreateNewRequest(containerId));
    } else {
        // This flow is used to get the existing container.
        container = await loader.resolve({ url });
    }

    // Wait for connection so that proposals can be sent
    if (container !== undefined && !container.connected) {
        console.log("waiting for the container to get connected");
        await new Promise<void>((resolve, reject) => {
            // the promise resolves when the connected event fires.
            container.once("connected", () => resolve());
            // the promise rejects when the container is forcefully closed due to an error.
            container.once("closed", (error) => {
                if (error?.message === "ExistingContextDoesNotSatisfyIncomingProposal") {
                    reject(
                        new Error(
                            `The document requires a newer package version to open.`,
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

    // Retrieve the root Fluid object and render it in the browser.
    await getFluidObjectAndRender(
        loader,
        container,
        url,
        document.getElementById("content") as HTMLDivElement,
    );

    return container;
}

if (document.location.pathname === "/") {
    // Redirect to create a new document with an auto-generated container ID
    // when URL parameters were not specified by the user
    const newContainerId = Date.now().toString();
    window.location.href = `/${newContainerId}?code=${defaultPackage}#CreateNew`;
} else {
    // Parse application URL parameters and determine which package version to load.
    const appParams = parseAppUrl();
    // Utilize a Fluid utility function to extract the package name and version.
    const packageId = extractPackageIdentifierDetails(appParams.packageName);

    // Load container and start collaboration session using specified parameters.
    start(
        document.location.href,
        appParams.documentId,
        packageId,
        appParams.isNew,
    )
        // Configure application UI in case of successful load.
        .then(setupUI)
        // Something went wrong. Display the error message and quit.
        .catch((error) =>
            window.alert(`🛑 Failed to open document\n\n${error}`),
        );
}

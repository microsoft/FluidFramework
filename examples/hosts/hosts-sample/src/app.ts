/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IContainer } from "@fluidframework/container-definitions";
import { ConnectionState, Loader } from "@fluidframework/container-loader";
import {
    IUser,
} from "@fluidframework/protocol-definitions";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils";
import { InsecureUrlResolver, ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import { extractPackageIdentifierDetails } from "@fluidframework/web-code-loader";
import { setupUI } from "./codeDetailsView";
import { InMemoryCodeDetailsLoader } from "./codeDetailsLoader";
import { getFluidObjectAndRender } from "./utils";

// Tinylicious service endpoints
const hostUrl = "http://localhost:7070";
const ordererUrl = "http://localhost:7070";
const storageUrl = "http://localhost:7070";

// Default app URL params
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

// Create or load the Fluid container using specified document info and render the root component.
// The method parses the browser URL and retrieves the container ID.
// The URL format: `http://localhost:8080/[#container-id]`,
//   where `container-id` is an optional alphanumerical string representing the unique ID of existing Fluid document.
async function start() {
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

    // The token provider is used by the runtime to generate access tokens on-demand.
    // We use a test provider that generates a JWT token by signing it using the provided hard-coded key.
    const tokenProvider = new InsecureTokenProvider(tenantKey, user);

    // The RouterliciousDocumentServiceFactory creates the driver that allows connections to the Tinylicious service.
    const documentServiceFactory = new RouterliciousDocumentServiceFactory(
        tokenProvider,
    );

    // The code loader provides the ability to load code packages that have been quorumed on and that represent
    // the code for the document.
    const codeLoader = InMemoryCodeDetailsLoader;

    // Finally with all the above objects created we can construct the loader.
    const loader = new Loader({
        urlResolver,
        documentServiceFactory,
        codeLoader,
    });

    // Request URL associated with the document.
    let url: string;
    let container: IContainer;

    // when the document ID is not provided, create a new one.
    const shouldCreateNew = location.hash.length === 0;
    if (shouldCreateNew) {
        // Utilize a Fluid utility function to extract the default package name and version.
        const packageId = extractPackageIdentifierDetails(defaultPackage);
        // This flow is used to create a new container and then attach it to the storage.
        container = await loader.createDetachedContainer({
            package: packageId.fullId,
        });
        await container.attach(urlResolver.createCreateNewRequest());
        // after the container is attached to the storage, we need to retrieve the actual URL
        // associated with the container.
        const resolved = container.resolvedUrl;
        ensureFluidResolvedUrl(resolved);
        const containerId = resolved.id;
        location.hash = containerId;
        url = `${location.origin}/${containerId}`;
    } else {
        // This flow is used to get the existing container.
        // Parse application URL parameters and determine which Fluid document to load.
        const containerId = location.hash.substring(1);
        url = `${location.origin}/${containerId}`;
        container = await loader.resolve({ url });
    }

    // Wait for connection so that proposals can be sent.
    if (container !== undefined && container.connectionState !== ConnectionState.Connected) {
        await new Promise<void>((resolve, reject) => {
            // the promise resolves when the connected event fires.
            container.once("connected", () => resolve());
            // the promise rejects when the container is forcefully closed due to an error.
            container.once("closed", (error) =>
                reject(
                    new Error(
                        `Container is closed unexpectedly. ${error?.message}`,
                    ),
                ),
            );
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

// App main method to load the home page.
(function() {
    // Load container and start collaboration session using provided app parameters.
    start()
        // Initialize the application UI in case of successful load.
        .then(setupUI)
        // Something went wrong. Display the error message and quit.
        .catch((error) =>
            window.alert(`🛑 Failed to open the document\n\n${error}`),
        );
})();

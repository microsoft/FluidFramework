/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { IContainer } from "@fluidframework/container-definitions";
import { getCodeDetailsFromQuorum, parsePackageDetails } from "./utils";

/**
 * Initialize code details view elements residing at the code upgrade panel.
 *
 * @param container - Loaded Fluid container
 */
export const setupUI = (container: IContainer) => {
    // Observe container events to detect when it gets forcefully closed.
    container.once("closed", (error) => {
        if (
            // pre-0.58 error message: ExistingContextDoesNotSatisfyIncomingProposal
            error?.message === "Existing context does not satisfy incoming proposal"
        ) {
            const reload = window.confirm(
                `🛑 Container is closed\n\nThe document requires a newer code version to continue.\nPress OK to reload.`,
            );
            if (reload) {
                // Reload the application page using the upgraded package version.
                window.location.reload();
            }
        } else {
            window.alert(`🛑 Container is closed\n\n${error}`);
        }
    });

    // A helper method to extract package info and display it in the info text box.
    const refreshLoadedCodeInfo = (code: IFluidCodeDetails | undefined) => {
        const loadedPackageInput = document.getElementById(
            "container-package",
        ) as HTMLInputElement;
        if (!code) {
            loadedPackageInput.innerText = "Package not found";
        } else {
            const packageId =
                typeof code.package === "string"
                    ? code.package
                    : `${code.package.name}@${code.package.version}`;
            loadedPackageInput.value = packageId;
        }
    };

    // Retrieve current code details loaded with the container.
    refreshLoadedCodeInfo(getCodeDetailsFromQuorum(container));

    // Subscribe to events triggered when new code details proposal is received.
    container.on("codeDetailsProposed", refreshLoadedCodeInfo); // refresh the UI

    // The upgrade button submits a code proposal by incrementing major code version of the code
    // loaded with the container.
    const upgradeBtn = document.getElementById(
        "upgrade-btn",
    ) as HTMLButtonElement;
    upgradeBtn.onclick = async () => {
        // Extract currently loaded code details from the container.
        const codeDetails = getCodeDetailsFromQuorum(container);
        const { name } = parsePackageDetails(codeDetails.package);
        // Prepare a code upgrade proposal using the current package name and the latest major version.
        const details: IFluidCodeDetails = {
            package: {
                name,
                version: "2.0.0",
                fluid: { browser: {} },
            },
            config: {},
        };
        // Submit a code proposal to the container
        container.proposeCodeDetails(details)
            .catch((error) => {
                window.alert(`🛑 Failed to upgrade container code\n\n${error}`);
            });
    };
};

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as semver from "semver";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { Container } from "@fluidframework/container-loader";
import { getCodeDetailsFromQuorum, parsePackageDetails } from "./utils";

/**
 * Configure code details view elements residing at the code upgrade panel.
 *
 * @param container - Loaded Fluid container
 */
export const setupUI = (container: Container) => {
    // Retrieve and cache the current code details from the container.
    let codeDetails = getCodeDetailsFromQuorum(container);

    // Observe container events to detect when it gets forcefully closed.
    container.once("closed", (error) => {
        if (
            error?.message === "ExistingContextDoesNotSatisfyIncomingProposal"
        ) {
            const reload = window.confirm(
                `🛑 Container is closed\n\nThe document requires a newer code version to continue.\nPress OK to reload.`,
            );
            if (reload && container.codeDetails) {
                // Reload the application page using the upgraded package version.
                const { name, version } = parsePackageDetails(container.codeDetails.package);
                window.location.href = `${document.location.pathname}?code=${name}@${
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    semver.inc(version!, "major")
                }`;
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
    refreshLoadedCodeInfo(codeDetails);

    // Subscribe to events triggered when new code details proposal is received.
    container.on("codeDetailsProposed", refreshLoadedCodeInfo); // refresh the UI
    container.on("codeDetailsProposed", (cd) => codeDetails = cd); // update the cached quorum value

    // The upgrade button submits a code proposal by incrementing major code version of the code
    // loaded with the container.
    const upgradeBtn = document.getElementById(
        "upgrade-btn",
    ) as HTMLButtonElement;
    upgradeBtn.onclick = async () => {
        // Extract currently loaded code details from the container.
        const { name, version } = parsePackageDetails(codeDetails.package);
        // Prepare a code upgrade proposal using the current package name and the incremented major version.
        const details: IFluidCodeDetails = {
            package: {
                name,
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                version: semver.inc(version!, "major"),
                fluid: { browser: {} },
            },
            config: {},
        };
        try {
            // Submit a code proposal to the container
            await container.proposeCodeDetails(details);
        } catch (error) {
            window.alert(`🛑 Failed to upgrade container code\n\n${error}`);
        }
    };
};

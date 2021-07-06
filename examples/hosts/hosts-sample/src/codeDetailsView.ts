/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as semver from "semver";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { IPackageIdentifierDetails } from "@fluidframework/web-code-loader";
import { Container } from "@fluidframework/container-loader";

/**
 * Initial configuration for controls in the code details panel.
 *
 * @param packageDetails - Fluid package name and version
 */
export const setupUI = (packageDetails: IPackageIdentifierDetails) => {
    const proposedVersion = document.getElementById(
        "proposed-version",
    ) as HTMLInputElement;
    proposedVersion.value = packageDetails.version ?? "1.0.0";

    const incrementMinorBtn = document.getElementById(
        "increment-minor-btn",
    ) as HTMLButtonElement;
    incrementMinorBtn.onclick = () => {
        const packageVersion = incrementMinorBtn.previousElementSibling as HTMLInputElement;
        const version = semver.parse(packageVersion.value);
        if (version) {
            packageVersion.value = version.inc("minor").raw;
        }
    };

    const incrementMajorBtn = document.getElementById(
        "increment-major-btn",
    ) as HTMLButtonElement;
    incrementMajorBtn.onclick = () => {
        const packageVersion = incrementMinorBtn.previousElementSibling as HTMLInputElement;
        const version = semver.parse(packageVersion.value);
        if (version) {
            packageVersion.value = version.inc("major").raw;
        }
    };

    const loadBtn = document.getElementById("reload-btn") as HTMLButtonElement;
    loadBtn.onclick = () => {
        window.location.href = `${document.location.pathname}?code=@${
            packageDetails.scope
        }/${packageDetails.name}@${proposedVersion.value ?? "1.0.0"}`;
    };
};

/**
 * Configure code details view controls powering the code upgrade functionality.
 *
 * @param container - Loaded Fluid container
 * @param packageDetails - Current code package details
 */
export const bindUI = (
    container: Container,
    packageDetails: IPackageIdentifierDetails,
) => {
    // Observe container events to detect when it gets forcefully closed.
    container.once("closed", (error) => {
        if (
            error?.message === "ExistingContextDoesNotSatisfyIncomingProposal"
        ) {
            window.alert(
                `🛑 Container is closed\n\nCurrent code is not compatible with the upgrade proposal.`,
            );
        } else {
            window.alert(`🛑 Container is closed\n\n${error}`);
        }
    });

    const upgradeBtn = document.getElementById(
        "upgrade-btn",
    ) as HTMLButtonElement;
    upgradeBtn.onclick = async () => {
        const proposedVersion = document.getElementById(
            "proposed-version",
        ) as HTMLInputElement;
        const details: IFluidCodeDetails = {
            package: {
                name: `@${packageDetails.scope}/${packageDetails.name}`,
                version: proposedVersion.value ?? "1.0.0",
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

    const refreshLoadedCodeInfo = (code: IFluidCodeDetails | undefined) => {
        const packageName = document.getElementById(
            "container-package",
        ) as HTMLInputElement;
        if (!code) {
            packageName.innerText = "Package not found";
        } else {
            const packageId =
                typeof code.package === "string"
                    ? code.package
                    : `${code.package.name}@${code.package.version}`;
            packageName.value = packageId;
        }
    };

    // Retrieve current code details loaded in the container.
    refreshLoadedCodeInfo(container.codeDetails);

    // Subscribe to events triggered when new code details proposal is received.
    container.on("codeDetailsProposed", refreshLoadedCodeInfo);
};

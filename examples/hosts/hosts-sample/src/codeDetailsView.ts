/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as semver from "semver";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { IPackageIdentifierDetails } from "@fluidframework/web-code-loader";
import { Container } from "@fluidframework/container-loader";

export const setupUI = (packageDetails: IPackageIdentifierDetails) => {
    const proposedVersion = document.getElementById(
        "proposed-version",
    ) as HTMLInputElement;
    proposedVersion.value = packageDetails.version ?? "1.0.0";

    const incrementBtn = document.getElementById(
        "increment-btn",
    ) as HTMLButtonElement;
    incrementBtn.onclick = () => {
        const packageVersion = incrementBtn.previousElementSibling as HTMLInputElement;
        const version = semver.parse(packageVersion.value);
        if (version) {
            packageVersion.value = version.inc("major").raw;
        }
    };

    const loadBtn = document.getElementById("reload-btn") as HTMLButtonElement;
    loadBtn.onclick = () => {
        window.location.href = `${document.location.pathname}?chaincode=@${
            packageDetails.scope
        }/${packageDetails.name}@${proposedVersion.value ?? "1.0.0"}`;
    };
};

export const bindUI = (
    container: Container,
    packageDetails: IPackageIdentifierDetails,
) => {
    container.once("closed", (error) => {
        if (
            error?.message === "ExistingContextDoesNotSatisfyIncomingProposal"
        ) {
            window.alert(
                `🛑 Container is closed\n\nCurrent code is not compatible with the incoming proposal.`,
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

    refreshLoadedCodeInfo(container.codeDetails);
    container.on("codeDetailsProposed", refreshLoadedCodeInfo);
};

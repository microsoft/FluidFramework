/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import {
    IFluidCodeDetails,
    IProxyLoaderFactory,
} from "@microsoft/fluid-container-definitions";
import { Container, Loader } from "@microsoft/fluid-container-loader";
import { IFluidResolvedUrl, IResolvedUrl } from "@microsoft/fluid-driver-definitions";
import { IResolvedPackage, WebCodeLoader } from "@microsoft/fluid-web-code-loader";
import { IBaseHostConfig } from "./hostConfig";

async function getComponentAndRender(loader: Loader, url: string, div: HTMLDivElement) {
    const response = await loader.request({ url });

    if (response.status !== 200 ||
        !(
            response.mimeType === "fluid/component" ||
            response.mimeType === "prague/component"
        )) {
        return;
    }

    // Check if the component is viewable
    const component = response.value as IComponent;
    const viewable = component.IComponentHTMLVisual;

    if (viewable) {
        const renderable =
            viewable.addView ? viewable.addView() : viewable;

        renderable.render(div, { display: "block" });
        return;
    }
}

const currentCodeProposalKey = "code";
export async function initializeContainerCode(
    container: Container,
    pkgForCodeProposal: IFluidCodeDetails): Promise<void> {

    const quorum = container.getQuorum();

    // nothing to do if the proposal exists
    if (quorum.has(currentCodeProposalKey)) {
        return;
    }

    // start a promise waiting for context changed, which will happen once we get a code proposal
    const contextChangedP = new Promise<void>((resolve) => container.once("contextChanged", () => resolve()));

    // short circuit if we know the container wasn't existing
    // this is the most common case
    if (!container.existing) {
        await Promise.all([
            quorum.propose(currentCodeProposalKey, pkgForCodeProposal),
            contextChangedP,
        ]);
        return;
    }

    // wait for a code proposal to show up
    const proposalFoundP = new Promise<boolean>((resolve) => {
        // wait for quorum and resolve promise if code shows up:
        // it helps with faster rendering if we have no snapshot,
        // but it also allows Fluid Debugger to work with no snapshots
        const approveProposal = (_seqNumber, key: string) => {
            if (key === currentCodeProposalKey) {
                quorum.removeListener("approveProposal", approveProposal);
                resolve(true);
            }
        };
        quorum.on("approveProposal", approveProposal);
    });

    // wait for us to connect or a proposal to show up
    let proposalFound =
        await Promise.race([
            proposalFoundP,
            new Promise<boolean>((resolve) => {
                if (!container.connected) {
                    container.once("connected", () => resolve(false));
                } else {
                    resolve(false);
                }
            }),
        ]);

    let codeProposalP: Promise<void> | undefined;
    const proposeCodeIfOldestClient = (resolve: (value: boolean) => void) => {
        // make sure we haven't already kicked off a code proposal
        if (codeProposalP === undefined) {
            // get this clients seq
            const thisClientSeq = container.clientId !== undefined ?
                quorum.getMember(container.clientId)?.sequenceNumber : undefined;

            if (thisClientSeq) {
                // see if this client has the lowest seq
                const clientWithLowerSeqExists =
                    Array.from(quorum.getMembers().values())
                        .some((c) => thisClientSeq > c.sequenceNumber, thisClientSeq);

                // if this client is the oldest client, it should propose
                if (!clientWithLowerSeqExists && codeProposalP === undefined) {
                    codeProposalP = quorum.propose(currentCodeProposalKey, pkgForCodeProposal);
                    codeProposalP.then(
                        () => resolve(true),
                        () => {
                            codeProposalP = undefined;
                            resolve(false);
                        });
                    return;
                }
            }
        }
        resolve(false);
    };

    // we are connected and there still isn't a proposal
    // we'll wait for one to show up, and will create one
    // if we are the oldest client
    proposalFound = await new Promise<boolean>((resolve) => proposeCodeIfOldestClient(resolve));
    while (!proposalFound) {
        // wait for the proposal, and everytime the quorum changes check if we are now the oldest client
        proposalFound = await Promise.race([
            proposalFoundP,
            new Promise<boolean>((resolve) => container.once("addMember", () => proposeCodeIfOldestClient(resolve))),
            new Promise<boolean>((resolve) => container.once("removeMember", () => proposeCodeIfOldestClient(resolve))),
        ]);
    }

    // finally wait for the context to change
    await contextChangedP;
}

/**
 * Create a loader and return it.
 * @param hostConfig - Config specifying the resolver/factory to be used.
 * @param resolved - A resolved url from a url resolver.
 * @param pkg - A resolved package with cdn links.
 * @param scriptIds - The script tags the chaincode are attached to the view with.
 */
async function createWebLoader(
    hostConfig: IBaseHostConfig,
    resolved: IResolvedUrl,
    pkg: IResolvedPackage | undefined,
    scriptIds: string[],
): Promise<Loader> {

    // Create the web loader and prefetch the chaincode we will need
    const codeLoader = new WebCodeLoader(hostConfig.whiteList);
    if (pkg) {
        if (pkg.pkg) { // This is an IFluidPackage
            await codeLoader.seed({
                package: pkg.pkg,
                config: pkg.details.config,
                scriptIds,
            });
            if (pkg.details.package === pkg.pkg.name) {
                pkg.details.package = `${pkg.pkg.name}@${pkg.pkg.version}`;
            }
        }

        // The load takes in an IFluidCodeDetails
        codeLoader.load(pkg.details).catch((error) => console.error("script load error", error));
    }

    const config = hostConfig.config ? hostConfig.config : {};

    // We need to extend options, otherwise we nest properties, like client, too deeply
    //
    config.blockUpdateMarkers = true;
    config.tokens = (resolved as IFluidResolvedUrl).tokens;

    const scope = hostConfig.scope ? hostConfig.scope : {};
    const proxyLoaderFactories = hostConfig.proxyLoaderFactories ?
        hostConfig.proxyLoaderFactories : new Map<string, IProxyLoaderFactory>();

    return new Loader(
        hostConfig.urlResolver,
        hostConfig.documentServiceFactory,
        codeLoader,
        config,
        scope,
        proxyLoaderFactories);
}

export class BaseHost {
    /**
     * Function to load the container from the given url and initialize the chaincode.
     * @param hostConfig - Config specifying the resolver/factory and other loader settings to be used.
     * @param url - Url of the Fluid component to be loaded.
     * @param resolved - A resolved url from a url resolver.
     * @param pkg - A resolved package with cdn links.
     * @param scriptIds - The script tags the chaincode are attached to the view with.
     * @param div - The div to load the component into.
     */
    public static async start(
        hostConfig: IBaseHostConfig,
        url: string,
        resolved: IResolvedUrl,
        pkg: IResolvedPackage | undefined,
        scriptIds: string[],
        div: HTMLDivElement,
    ): Promise<Container> {
        const baseHost = new BaseHost(hostConfig, resolved, pkg, scriptIds);
        return baseHost.loadAndRender(url, div, pkg ? pkg.details : undefined);
    }

    private readonly loaderP: Promise<Loader>;
    public constructor(
        hostConfig: IBaseHostConfig,
        resolved: IResolvedUrl,
        seedPackage: IResolvedPackage | undefined,
        scriptIds: string[],
    ) {

        this.loaderP = createWebLoader(
            hostConfig,
            resolved,
            seedPackage,
            scriptIds,
        );
    }

    public async getLoader() {
        return this.loaderP;
    }

    public async loadAndRender(url: string, div: HTMLDivElement, pkg?: IFluidCodeDetails) {
        const loader = await this.getLoader();
        const container = await loader.resolve({ url });

        container.on("contextChanged", (value) => {
            getComponentAndRender(loader, url, div).catch(() => { });
        });
        await getComponentAndRender(loader, url, div);

        // If this is a new document we will go and instantiate the chaincode. For old documents we assume a legacy
        // package.
        if (pkg) {
            await initializeContainerCode(container, pkg)
                .catch((error) => console.error("code proposal error", error));
        }

        return container;
    }
}

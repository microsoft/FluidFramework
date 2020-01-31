/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    TestDeltaConnectionServer,
    TestDocumentServiceFactory,
    TestResolver,
} from "@microsoft/fluid-local-test-server";
import { IUser } from "@microsoft/fluid-protocol-definitions";
import { getRandomName } from "@microsoft/fluid-server-services-client";
import * as jwt from "jsonwebtoken";
// eslint-disable-next-line import/no-internal-modules
import * as uuid from "uuid/v4";
import {
    IProxyLoaderFactory,
    ICodeLoader,
    IProvideRuntimeFactory,
    IFluidModule,
} from "@microsoft/fluid-container-definitions";
import {  Loader } from "@microsoft/fluid-container-loader";
import { IProvideComponentFactory } from "@microsoft/fluid-runtime-definitions";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";

export interface IDevServerUser extends IUser {
    name: string;
}

const getUser = (): IDevServerUser => ({
    id: uuid(),
    name: getRandomName(),
});


export async function start(
    entryPoint: Partial<IProvideRuntimeFactory & IProvideComponentFactory & IFluidModule>,
    div: HTMLDivElement,
): Promise<void> {

    const documentId = uuid();

    const urlResolver = new TestResolver(documentId);

    const deltaConn = TestDeltaConnectionServer.create();
    const documentServiceFactory = new TestDocumentServiceFactory(deltaConn);
    const factory: Partial<IProvideRuntimeFactory & IProvideComponentFactory> =
        entryPoint.fluidExport ? entryPoint.fluidExport : entryPoint;

    const runtimeFactory: IProvideRuntimeFactory =
        factory.IRuntimeFactory ?
            factory.IRuntimeFactory :
            new SimpleModuleInstantiationFactory("default", [["default", Promise.resolve(factory.IComponentFactory)]]);

    const codeLoader: ICodeLoader = {
        load: async  <T>() => ({fluidExport: runtimeFactory} as unknown as T) ,
    };

    const loader =  new Loader(
        urlResolver,
        documentServiceFactory,
        codeLoader,
        {},
        {},
        new Map<string, IProxyLoaderFactory>());

    const container = await loader.resolve({ url: documentId });

    const quorum = container.getQuorum();
    await quorum.propose("code", {});

    await new Promise((resolve) => container.once("contextChanged", () => resolve()));

    const response = await container.request({ url:"" });

    if (response.status !== 200 ||
        !(
            response.mimeType === "fluid/component" ||
            response.mimeType === "prague/component"
        )) {
        div.innerText = "Component not found";
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

export function getUserToken(bearerSecret: string) {
    const user = getUser();

    return jwt.sign({ user }, bearerSecret);
}

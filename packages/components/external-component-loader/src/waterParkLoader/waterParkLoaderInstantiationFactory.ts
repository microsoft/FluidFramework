/*!
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT License.
*/

import { PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import {  IComponentContext, IComponentFactory } from "@microsoft/fluid-runtime-definitions";
import { UrlRegistry } from "../urlRegistry";
import { ExternalComponentLoader } from "./externalComponentLoader";

export class WaterParkLoaderInstantiationFactory implements IComponentFactory {
    public get IComponentFactory(){ return this; }

    public instantiateComponent(context: IComponentContext){

        const factory = new PrimedComponentFactory(
            ExternalComponentLoader,
            [],
            [["url", Promise.resolve(new UrlRegistry())]],
        );

        return factory.instantiateComponent(context);
    }

    private static readonly factory = new WaterParkLoaderInstantiationFactory();
    public static readonly getFactory = () => WaterParkLoaderInstantiationFactory.factory;
}


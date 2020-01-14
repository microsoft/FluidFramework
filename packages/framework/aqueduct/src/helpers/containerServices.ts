import { IComponent, IComponentRouter } from "@microsoft/fluid-component-core-interfaces";
import { IHostRuntime } from "@microsoft/fluid-runtime-definitions";

// TODO: should this just be "s"? 
export const serviceRoutePathRoot = "_services";

export interface IContainerService {
    id: string,
    getComponent(runtime: IHostRuntime): IComponent & IComponentRouter,
}

/**
 * Container Services are used 
 */
export class ContainerService implements IContainerService {
    private component: IComponent & IComponentRouter | undefined;
    
    public get id() {
        return this.serviceId;
    }

    public getComponent(runtime: IHostRuntime) {
        if (!this.component){
            this.component = this.createComponent(runtime);
        }

        return this.component;
    }

    public constructor(
        private serviceId: string,
        private createComponent: (runtime: IHostRuntime) => IComponent & IComponentRouter) {
    }
}

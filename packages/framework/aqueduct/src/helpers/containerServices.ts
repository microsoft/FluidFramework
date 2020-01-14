import { IComponent, IComponentRouter } from "@microsoft/fluid-component-core-interfaces";
import { IHostRuntime } from "@microsoft/fluid-runtime-definitions";

// TODO: should this just be "s"? 
export const serviceRoutePathRoot = "_services";

export interface IContainerService {
    id: string,
    getComponent(runtime: IHostRuntime): IComponent & IComponentRouter,
}

/**
 * A container service that uses a single component for a given container instance.
 */
export class SingletonContainerService implements IContainerService {
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

/**
 * A container service that creates a new component every time `getComponent` is called.
 */
export class InstanceContainerService implements IContainerService {
    public get id() {
        return this.serviceId;
    }

    public getComponent(runtime: IHostRuntime) {
        return this.createComponent(runtime);
    }

    public constructor(
        private serviceId: string,
        private createComponent: (runtime: IHostRuntime) => IComponent & IComponentRouter) {
    }
}


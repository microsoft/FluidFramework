import { ISharedComponentProps, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { IComponent, IComponentLoadable } from "@microsoft/fluid-component-core-interfaces";
import { IComponentContext } from "@microsoft/fluid-runtime-definitions";

import {
    ClickerWithInitialValue,
    IClickerInitialState,
} from "./clickerWithInitialValue";

export class ClickerWithInitialValueFactory extends PrimedComponentFactory {
    // Override the createComponent method to allow an initial value
    public async createComponent(
        context: IComponentContext,
        initialState?: IClickerInitialState,
    ): Promise<IComponent & IComponentLoadable> {
        const ctorFn = (props: ISharedComponentProps) => {
            return new ClickerWithInitialValue(props, initialState);
        };
        return this.createComponentWithConstructorFn(context, ctorFn);
    }
}

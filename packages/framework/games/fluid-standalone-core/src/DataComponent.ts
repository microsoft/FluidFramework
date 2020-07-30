import { PrimedComponent, PrimedComponentFactory } from '@fluidframework/aqueduct';
import { IComponentRuntime } from '@fluidframework/component-runtime-definitions';
import { ISharedDirectory } from '@fluidframework/map';
import { IComponentContext } from '@fluidframework/runtime-definitions';
import { ConsensusRegisterCollection } from '@fluidframework/register-collection';

export interface ComponentData {
  runtime: IComponentRuntime;
  context: IComponentContext;
  root: ISharedDirectory;
}

export class DataComponent extends PrimedComponent {
  public getComponentData = async (): Promise<ComponentData> => {
    const componentData: ComponentData = {
      runtime: this.runtime,
      context: this.context,
      root: this.root,
    };

    return componentData;
  };
}

export const DataComponentInstantiationFactory = new PrimedComponentFactory(DataComponent.name, DataComponent, [ConsensusRegisterCollection.getFactory()], {});

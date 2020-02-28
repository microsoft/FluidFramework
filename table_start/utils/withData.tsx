import {
  PrimedComponent,
  PrimedComponentFactory
} from "@microsoft/fluid-aqueduct";
import { IComponentHTMLVisual } from "@microsoft/fluid-component-core-interfaces";
import * as React from "react";
import * as ReactDOM from "react-dom";

export const withData = (
  Component: React.ComponentType,
  stateProps: any,
  Context: React.Context<any>
) => {
  class PrimedReactComponent extends PrimedComponent
    implements IComponentHTMLVisual {
    public get IComponentHTMLVisual() {
      return this;
    }

    protected async componentInitializingFirstTime() {
      for (const key of Object.keys(stateProps)) {
        this.root.set(key, stateProps[key]);
      }
    }

    public render(div: HTMLElement) {
      const rerender = () => {
        let contextProps = {};
        for (const key of Object.keys(stateProps)) {
          const setKey = "set" + key.charAt(0).toUpperCase() + key.slice(1);
          contextProps[key] = this.root.get(key);
          contextProps[setKey] = value => this.root.set(key, value);
        }
        ReactDOM.render(
          <Context.Provider value={contextProps}>
            <Component />
          </Context.Provider>,
          div
        );
      };

      rerender();
      this.root.on("valueChanged", () => {
        rerender();
      });
    }
  }

  return new PrimedComponentFactory(PrimedReactComponent, []);
};

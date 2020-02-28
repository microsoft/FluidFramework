import * as React from "react";
import * as ReactDOM from "react-dom";
import {
  PrimedComponent,
  PrimedComponentFactory
} from "@microsoft/fluid-aqueduct";
import { IComponentHTMLVisual } from "@microsoft/fluid-component-core-interfaces";
import { App } from "./App";
import { PrimedContext } from "./provider";

class PrimedReactComponent extends PrimedComponent
  implements IComponentHTMLVisual {
  public get IComponentHTMLVisual() {
    return this;
  }

  protected async componentInitializingFirstTime() {
    this.root.set("diceValue", 1);
    this.root.set("clicked", 0);
  }

  public render(div: HTMLElement) {
    const actions = {
      rollDice: this.rollDice
    };

    const rerender = () => {
      const selectors = {
        diceValue: this.diceValue(),
        clicked: this.clicked()
      };
      ReactDOM.render(
        <PrimedContext.Provider value={{ selectors, actions }}>
          <App />
        </PrimedContext.Provider>,
        div
      );
    };

    rerender();
    this.root.on("valueChanged", () => {
      rerender();
    });
  }

  private diceValue = () => {
    return this.root.get("diceValue");
  };
  private clicked = () => {
    return this.root.get("clicked");
  };

  private rollDice = value => {
    if (value >= 1 && value <= 6) {
      this.root.set("diceValue", value);
      this.root.set("clicked", this.root.get("clicked") + 1);
    }
  };
}

export const fluidExport = new PrimedComponentFactory(PrimedReactComponent, []);

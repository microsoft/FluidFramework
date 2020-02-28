import {
  PrimedComponent,
  PrimedComponentFactory
} from "@microsoft/fluid-aqueduct";
import { IComponentHTMLVisual } from "@microsoft/fluid-component-core-interfaces";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { Dice } from "./Dice";

/**
 * Dice roller example using view interfaces and stock component classes.
 */
export class Fabricthing extends PrimedComponent
  implements IComponentHTMLVisual {
  public get IComponentHTMLVisual() {
    return this;
  }

  /**
   * ComponentInitializingFirstTime is called only once, it is executed only by the first client to open the
   * component and all work will resolve before the view is presented to any user.
   *
   * This method is used to perform component setup, which can include setting an initial schema or initial values.
   */
  protected async componentInitializingFirstTime() {
    this.root.set("diceValue", 1);
  }

  /**
   * Render the dice.
   */
  public render(div: HTMLElement) {
    const rerender = () => {
      ReactDOM.render(
        <Dice
          diceValue={this.root.get<number>("diceValue")}
          rollDice={this.rollDice}
        />,
        div
      );
    };

    rerender();
    this.root.on("valueChanged", () => {
      rerender();
    });
  }

  private rollDice = () => {
    // tslint:disable-next-line:insecure-random - We don't need secure random numbers for this application.
    const rollValue = Math.floor(Math.random() * 6) + 1;
    this.root.set("diceValue", rollValue);
  };
}

/**
 * The PrimedComponentFactory declares the component and defines any additional distributed data structures.
 * To add a SharedSequence, SharedMap, or any other structure, put it in the array below.
 */
export const fluidExport = new PrimedComponentFactory(Fabricthing, []);

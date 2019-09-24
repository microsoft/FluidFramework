/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ClickerName } from "@fluid-example/clicker";
import { PrimedComponent } from "@microsoft/fluid-aqueduct";
import { EmbeddedReactComponentFactory, IComponentReactViewable } from "@microsoft/fluid-aqueduct-react";
import { ISharedCell, SharedCell } from "@microsoft/fluid-cell";
import { IComponentHandle, IComponentHTMLVisual } from "@microsoft/fluid-component-core-interfaces";
import { SharedString } from "@microsoft/fluid-sequence";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { TextBoxName } from "../TextBox";
import { TextListName } from "../TextList";
import { TodoItemSupportedComponents } from "./supportedComponent";
import { TodoItemView } from "./TodoItemView";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../../package.json");
export const TodoItemName = `${pkg.name as string}-item`;

/**
 * Todo Item is a singular todo entry consisting of:
 * - Checkbox
 * - Collaborative string
 * - Embedded component
 * - Link to open component in separate tab
 * - Button to remove entry
 */
export class TodoItem extends PrimedComponent
  implements
    IComponentHTMLVisual,
    IComponentReactViewable {

  // tslint:disable:prefer-readonly
  public text: SharedString;
  public innerIdCell: ISharedCell;
  // tslint:enable:prefer-readonly

  public get IComponentHTMLVisual() { return this; }
  public get IComponentReactViewable() { return this; }

  /**
   * Do creation work
   */
  protected async componentInitializingFirstTime(props?: any) {
    let newItemText = "New Item";

    // if the creating component passed props with a startingText value then set it.
    if (props && props.startingText) {
      newItemText = props.startingText;
    }

    const text = SharedString.create(this.runtime);
    text.insertText(0, newItemText);
    // create a cell that will be use for the text entry
    this.root.set("text", text.handle);

    // track the state of the checkbox
    this.root.set("checked", false);

    // Each Todo Item has one inner component that it can have. This value is originally empty since we let the
    // user choose the component they want to embed. We store it in a cell for easier event handling.
    const innerIdCell = SharedCell.create(this.runtime);
    innerIdCell.set("");
    this.root.set("innerId", innerIdCell.handle);
  }

  protected async componentHasInitialized() {
    const text = this.root.get<IComponentHandle>("text").get<SharedString>();
    const innerIdCell = this.root.get<IComponentHandle>("innerId").get<ISharedCell>();

    this.setCheckedState = this.setCheckedState.bind(this);

    [
      this.text,
      this.innerIdCell,
    ] = await Promise.all([
      text,
      innerIdCell,
    ]);
  }

  // start IComponentHTMLVisual

  public render(div: HTMLElement) {
    // tslint:disable-next-line:no-console
    console.log("TodoItem render()");
    ReactDOM.render(
        this.createJSXElement(),
        div,
    );
  }

  // end IComponentHTMLVisual

  // start IComponentReactViewable

  /**
   * If our caller supports React they can query against the IComponentReactViewable
   * Since this returns a JSX.Element it allows for an easier model.
   */
  public createJSXElement(): JSX.Element {
      const factory = new EmbeddedReactComponentFactory(this.getComponent.bind(this));
      return (
        <TodoItemView
          todoItemModel={this}
          createComponentView={(id) => factory.create(id)}
        />
      );
  }

  public setCheckedState(newState: boolean): void {
    this.root.set("checked", newState);
  }

  // end IComponentReactViewable

  public getCheckedState(): boolean {
    return this.root.get("checked");
  }

  /**
   * The Todo Item can embed multiple types of components. This is where these components are defined.
   * @param type - component to be created
   * @param props - props to be passed into component creation
   */
  public async createInnerComponent(type: TodoItemSupportedComponents, props?: any): Promise<void> {
    const id = `item${Date.now().toString()}`;

    switch (type) {
      case "todo":
          await this.createAndAttachComponent(id, TodoItemName, props);
          break;
      case "clicker":
          await this.createAndAttachComponent(id, ClickerName, props);
          break;
      case "textBox":
          await this.createAndAttachComponent(id, TextBoxName, props);
          break;
      case "textList":
          await this.createAndAttachComponent(id, TextListName, props);
          break;
      default:
    }

    // Update the inner component id
    this.innerIdCell.set(id);
  }
}

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ClickerName } from "@chaincode/clicker";

import {
  PrimedComponent,
} from "@prague/aqueduct";
import {
  EmbeddedReactComponentFactory,
  IComponentReactViewable,
} from "@prague/aqueduct-react";
import {
  ISharedCell,
  SharedCell,
} from "@prague/cell";
import {
  IComponentHTMLVisual,
} from "@prague/component-core-interfaces";
import {
  IComponentForge,
} from "@prague/framework-definitions";
import {
  Counter,
  CounterValueType,
} from "@prague/map";
import {
  SharedString,
} from "@prague/sequence";

import * as React from "react";
import * as ReactDOM from "react-dom";

import { TodoItemSupportedComponents } from "./supportedComponent";
import { TodoItemView } from "./TodoItemView";

import { TextBoxName } from "../TextBox";

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
    IComponentReactViewable,
    IComponentForge {

  public get IComponentHTMLVisual() { return this; }
  public get IComponentReactViewable() { return this; }
  public get IComponentHTMLRender() { return this; }

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
    this.root.set("text", text);

    // create a counter that will be used for the checkbox
    // we use a counter so if both users press the button at the same time it will result
    // in the button being the same value.
    this.root.set("checked", 0, CounterValueType.Name);

    // Each Todo Item has one inner component that it can have. This value is originally empty since we let the
    // user choose the component they want to embed. We store it in a cell for easier event handling.
    const innerIdCell = SharedCell.create(this.runtime);
    innerIdCell.set("");
    this.root.set("innerId", innerIdCell);
  }

  // start IComponentHTMLVisual

  public render(div: HTMLElement) {
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
      const text = this.root.get<SharedString>("text");
      const checkedCounter = this.root.get<Counter>("checked");
      const factory = new EmbeddedReactComponentFactory(this.getComponent.bind(this));

      const innerIdCell = this.root.get<ISharedCell>("innerId");
      return (
        <TodoItemView
          sharedString={text}
          id={this.url}
          innerIdCell={innerIdCell}
          checkedCounter={checkedCounter}
          getComponentView={(id) => factory.create(id)}
          createComponent={this.createComponent.bind(this)}/>
      );
  }

  // end IComponentReactViewable

  /**
   * The Todo Item can embed multiple types of components. This is where these components are defined.
   * @param type - component to be created
   * @param props - props to be passed into component creation
   */
  private async createComponent(type: TodoItemSupportedComponents, props?: any): Promise<void> {
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
      default:
    }

    // Update the inner component id
    const innerIdCell = this.root.get<ISharedCell>("innerId");
    innerIdCell.set(id);
  }
}

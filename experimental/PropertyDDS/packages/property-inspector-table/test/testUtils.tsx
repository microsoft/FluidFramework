/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseProxifiedProperty, PropertyProxy } from "@fluid-experimental/property-proxy";
import { mount, MountRendererProps } from "enzyme";
import * as React from "react";
import { act } from "react-dom/test-utils";
import { EditableValueCell } from "../src/EditableValueCell";
import { HashCalculator } from "../src/HashCalculator";
import { InspectorTable } from "../src/InspectorTable";
import {
  IColumns, IInspectorRow, IInspectorSearchMatch, IInspectorSearchMatchMap, IInspectorTableProps,
} from "../src/InspectorTableTypes";
import { ModalManager } from "../src/ModalManager";
import { ModalRoot } from "../src/ModalRoot";
import {
  handlePropertyDataCreation,
  handlePropertyDataCreationOptionGeneration,
} from "../src/PropertyDataCreationHandlers";
import { search } from "../src/utils";
import { MockWorkspace, populateWorkspace } from "./common";

export async function getAllMatchesFromRows(searchExpression: string,
   rows: IInspectorRow[], dataGetter, columns: IColumns[], props, toTableRowOptions):
    Promise<{ matches: IInspectorSearchMatch[]; matchesMap: IInspectorSearchMatchMap; childToParentMap: {}; }> {
  return new Promise((resolve) => {
    let state;

    const callback = (matches: IInspectorSearchMatch[], matchesMap, searchDone, childToParentMap) => {
      if (searchDone) {
        resolve({ matches, matchesMap, childToParentMap });
        return;
      }
      state = search(searchExpression, rows, dataGetter, columns!, callback, props, toTableRowOptions, state).state;
    };

    state = search(searchExpression, rows, dataGetter, columns!, callback, props, toTableRowOptions, state).state;
  });
}

/**
 * This function is used to find a particular row from the react wrapper using either the name of the row or by
 * a property id. Both the parameters are optional, however, if a `name` is given, it will return the row with a similar
 * name, and not check for `propertyId`.
 *
 * @param wrapper     A react wrapper in which the row needs to be searched.
 * @param name        Name of the row which is to be found. Encoded within `rowData.name`.
 * @param propertyId  An id by which the property is identified. The id is encoded into the `rowKey`.
 */
export const findTableRow = (wrapper, name = "", propertyId = "") => {
  const tableRows = wrapper.find("TableRow");
  return tableRows.filterWhere((row) => {
    const rowKey = row.props().rowKey.split("/");
    if (name && row.props().rowData.name === name.toString()) {
      return true;
    } else if (propertyId && rowKey.length >= 2 &&
      rowKey[rowKey.length - 2] === getHash(`/${ propertyId}`) &&
      rowKey[rowKey.length - 1] === "Add") {
      return true;
    }
  });
};

/**
 * This function is used to simulate a click to expand a row in the inspector table.
 *
 * @param wrapper     A react wrapper in which the row needs to be searched
 * @param name        Name of the row which is to be found. Encoded within rowData.name
 */
export const expandRow = (wrapper, name) => {
  const row = findTableRow(wrapper, name);
  const expandIcon = row.find("ExpandIcon");
  if (expandIcon.length > 0) {
    expandIcon.simulate("click");
  }
};

export const findRowMenuButton = (wrapper, name) => {
  const row = findTableRow(wrapper, name);
  const label = row.find("NameCell").childAt(0);
  return label.find("ItemMenu");
};

export const mountInspectorTable = (
  rootProxy: BaseProxifiedProperty | undefined,
  inProps: Partial<IInspectorTableProps> = {},
  options: MountRendererProps = {},
  needModalManager = false,
) => {
  const props = { dataCreationHandler: handlePropertyDataCreation,
    dataCreationOptionGenerationHandler: handlePropertyDataCreationOptionGeneration, ...inProps };

  const table = (
    <InspectorTable
      width={800}
      height={600}
      data={rootProxy}
      columns={["name", "value"]}
      expandColumnKey={"name"}
      {...props}
    />
  );

  if (!needModalManager) {
    return mount(
      table,
      options);
  } else {
    return mount(
      <ModalManager>
        <ModalRoot />
        {table}
      </ModalManager>,
      options);
  }
};

export const findAndClick = (wrapper, propertyId = "") => {
  const row = propertyId ? findTableRow(wrapper, "", propertyId) : wrapper;
  const addNewProp = row.find("NewDataRow");
  if (addNewProp.length > 0) {
    addNewProp.simulate("click");
  }
};

export const addProperty = (wrapper, primitiveValue, contextValue, name?) => {
  const dataForm = wrapper.find("NewDataForm");
  if (name) {
    const input = dataForm.findWhere(
      (node) => node.props().placeholder && node.props().placeholder.startsWith("Name of the")).find("input");
    input.simulate("change", { target: { value: name } });
  }
  const decoratedSelect = dataForm.find("DecoratedSelect");
  const propertySelection = decoratedSelect.filterWhere((node) => node.props().id === "propertyTypeSelector");
  const contextSelection = decoratedSelect.filterWhere((node) => node.props().id === "contextSelector");
  const allOptions = propertySelection.props().options.reduce((acc, val) => acc.concat(val.options), []);

  const newPropertyOption = allOptions.find((primitiveProperty) => primitiveProperty.label === primitiveValue);
  const newContextOption = contextSelection.props().options.filter(
    (context) => context.value === contextValue)[0];
  act(() => propertySelection.props().onChange(newPropertyOption));
  act(() => contextSelection.props().onChange(newContextOption));
  // Calls creation
  const createButton = dataForm.find("button").find({ id: "createDataButton" });
  createButton.simulate("click");
};

export const deleteProperty = (wrapper, menuButtonWrapper, isReference = false) => {
  // click context menu button
  menuButtonWrapper.find("button").simulate("click");
  const position = isReference ? 2 : 1;
  menuButtonWrapper.find(".MuiPaper-root").find(".MuiButtonBase-root").at(position).simulate("click");

  // click delete button
  wrapper.find(".MuiButton-label").at(1).simulate("click");
};

export const typeNewName = (wrapper, name) => {
  const dataForm = wrapper.find("NewDataForm");
  const input = dataForm.findWhere(
    (node) => node.props().placeholder && node.props().placeholder.startsWith("Name of the")).find("input");
  input.simulate("change", { target: { value: name } });
};
export const initializeWorkspace = async (populate = true) => {
  const workspace = new MockWorkspace();
  if (populate) {
    await populateWorkspace(workspace);
  }
  const rootProxy = PropertyProxy.proxify(workspace.getRoot());
  return { workspace, rootProxy };
};
export const findEditableCell = (wrapper, typeList: string[], name = "") => {
  let editCell = wrapper.find(EditableValueCell);
  editCell = (name || typeof name !== "string")
    ? editCell.filterWhere((n) => n.props().rowData.name === name.toString()) : editCell;

  return typeList.reduce((itemWrapper, search) => {
    return itemWrapper.find(search);
  }, editCell);
};
export const updateEditableValueCellValue = (wrapper, value, name = "") => {
  const input = findEditableCell(wrapper, ["ForwardRef(InputBase)", "input"], name);
  input.instance().value = value;
  input.find("input").simulate("blur", { currentTarget: { value } });
};
export const updateEditableValueCellSelectValue = (wrapper, value, name = "") => {
  const item = findEditableCell(wrapper, ["ForwardRef(Select)"], name);
  item.props().onChange({ target: { value } });
};
export const toggleEditableValueCellBoolSwitch = (wrapper, checked, name = "") => {
  const item = findEditableCell(wrapper, ["ForwardRef(Switch)"], name);
  item.props().onChange({ target: { checked } });
};
export const changeValue = (value, rootProxy) => {
  const wrapper = mountInspectorTable(rootProxy);
  updateEditableValueCellValue(wrapper, value);
};
export const changeBoolValue = (value, rootProxy, collectionKey = "") => {
  const wrapper = mountInspectorTable(rootProxy);
  toggleEditableValueCellBoolSwitch(wrapper, value, collectionKey);
};

export const generateRandomValidNumber = (typeid) => {
  const randomFloat = +(Math.random() * 100).toFixed(2);
  return typeid.startsWith("Float") ? randomFloat : Math.round(randomFloat);
};

export const findRow = (id: string, innerRows: IInspectorRow[]) => {
  return innerRows.find((val) => (val.name === id))!;
};

/**
 * This function is used to select a given option from the dropdown selector in the inspector table property creation.
 * It triggers a state change, updates the wrapper and returns the context selector to check if it is correctly updated.
 *
 * @param wrapper        React Wrapper containing the inspector table.
 * @param selectorId     Id of the dropdown selector to find and update.
 * @param optionLabel    Label of the option to select.
 * @return               Returns the updated wrapper containing context selector.
 */
const updateDropdown = (wrapper, selectorId, optionLabel) => {
  const decoratedSelect = wrapper.find("NewDataForm").find("DecoratedSelect");
  const selector = decoratedSelect.filterWhere((node) => node.props().id === selectorId);
  let allOptions = selector.props().options;
  if (selectorId === "propertyTypeSelector") {
    allOptions = selector.props().options.reduce((acc, val) => acc.concat(val.options), []);
  }
  const newOption = allOptions.find((option) => option.label === optionLabel);
  act(() => {
    selector.props().onChange(newOption);
  });
  wrapper.update();

  return wrapper
    .find("NewDataForm")
    .find("DecoratedSelect")
    .filterWhere((node) => node.props().id === "contextSelector");
};

/**
 * This function is used to test the dynamic updates of the dropdown options in the inspector table property creation.
 * @param wrapper     React Wrapper containing the inspector table.
 * @return {boolean}  Returns true if all check pass, false otherwise.
 */
export const testDynamicDropdown = (wrapper) => {
  /* Step 1, property type is selected as `NodeProperty`. This will result in only 3 context options in dropdown */
  let contextSelector = updateDropdown(wrapper, "propertyTypeSelector", "NodeProperty");
  if (contextSelector.props().options.length !== 3) { // only 3 context options for NodeProperty
    return false;
  }

  /* Step 2, property type is selected as `NamedNodeProperty`. This will result in 4 context options in dropdown */
  contextSelector = updateDropdown(wrapper, "propertyTypeSelector", "NamedNodeProperty");
  if (contextSelector.props().options.length !== 4) { // 4 context options for NamedNodeProperty, incl. Set
    return false;
  }

  /* Step 3, Now we select `Set` as  the context. This is possible as selected property is `NamedNodeProperty` */
  updateDropdown(wrapper, "contextSelector", "Set");

  /* Step 4, Update proprety to `NodeProperty`, and check if context has been unset. It should no longer be `set` */
  contextSelector = updateDropdown(wrapper, "propertyTypeSelector", "NodeProperty");
  if (contextSelector.props().value === "set") { // unset context on change of property type
    return false;
  }

  /* If all checks pass, return true */
  return true;
};

export const getHash = (id) => {
  const hash = new HashCalculator();
  hash.pushString(id);
  return hash.getHash();
};

export const getExpandedMap = (expanded) => {
  return expanded.reduce((map, id) => {
    map[getHash(id)] = true;
    return map;
  }, {});
};

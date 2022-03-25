/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { PropertyProxy } from "@fluid-experimental/property-proxy";
import { PropertyFactory } from "@fluid-experimental/property-properties";
import { TypeIdHelper } from "@fluid-experimental/property-changeset";
import { InputValidator } from "./InputValidator";
import { IDataCreationOptions, IInspectorRow } from "./InspectorTableTypes";

const EXCLUDE_PROPS = ["BaseProperty", "Enum", "ContainerProperty"];

export const fetchRegisteredTemplates = () => {
  const toTemplateList = (x: string) => ({ value: x, label: x });
  // extract primitive templates
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const localTemplates = PropertyFactory._localPrimitivePropertiesAndTemplates.getItems();
  const primitiveLocalTemplates: string[] = [];
  const customLocalTemplates: string[] = [];
  Object.keys(localTemplates).forEach((item) => {
    if (!TypeIdHelper.isTemplateTypeid(item) && EXCLUDE_PROPS.indexOf(item) === -1) {
      primitiveLocalTemplates.push(item);
    } else if (TypeIdHelper.isTemplateTypeid(item)) {
      customLocalTemplates.push(item);
    }
  });
  const templates = [
    ["Primitives", primitiveLocalTemplates.map(toTemplateList)],
    ["Custom", customLocalTemplates.map(toTemplateList)],
  ];
  return templates;
};

export const handlePropertyDataCreationOptionGeneration =
  (rowData: IInspectorRow, nameOnly: boolean): IDataCreationOptions => {
    if (nameOnly) {
      return { name: "property" };
    }
    const templates = fetchRegisteredTemplates();
    return { name: "property", options: templates };
  };

/**
 * A callback function that is called on data creation. If not specified,
 * data creation will be disabled.
 * @param name Will be the name of the new property .
 * @param typeid The type unique identifier, indicating which type the created property shall be.
 * @param context Will be the type of collection of values that the property contains.
 *                Possible values are "single", "array", "map" and "set".
 * @param parent The property parent of the new property to create. It can be of type Array, Map, Set.
 *               If it not any of those types (TODO: What happens then?).
 */
const createProperty = (name: string, typeid: string, context: string, parent: any) => {
  if (!(["set", "array"].includes(parent.getProperty().getContext()))) {
    InputValidator.validateNotEmpty(name);
  }

  const newProp = PropertyFactory.create(typeid, context);

  if (Array.isArray(parent)) {
    parent.push(newProp);
  } else if (parent instanceof Map) {
    if (parent.has(name)) {
      throw new Error(`Key already exists in the map: ${ name }`);
    } else {
      parent.set(name, newProp);
    }
  } else if (parent instanceof Set) {
    parent.add(newProp);
  } else {
    if (parent.getProperty().has(name)) {
      throw new Error(`Key already exists in this property: ${ name }`);
    } else {
      parent[name] = newProp;
    }
  }

  return parent.getProperty().getRoot().getWorkspace().commit();
};

export const handlePropertyDataCreation = (
  rowData: IInspectorRow, name: string, typeid: string, context: string) => {
  return createProperty(name, typeid, context, PropertyProxy.proxify(rowData.parent!));
};

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerProperty, PropertyFactory } from "@fluid-experimental/property-properties";
import Button from "@material-ui/core/Button";
import InputAdornment from "@material-ui/core/InputAdornment";
import { makeStyles } from "@material-ui/core/styles";
import TextField from "@material-ui/core/TextField";
import classNames from "classnames";
import React, { useEffect, useState } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import {
  backGroundGrayColor,
  borderGrayColor,
  colorWhite,
  iconMarginRight,
  unit,
} from "./constants";
import {
  DecoratedSelect,
  DecoratedSelectGroupedOptionsType,
  DecoratedSelectOptionsType,
  DecoratedSelectValueType,
  IDecoratedSelectOptionType,
} from "./DecoratedSelect";
import { ErrorPopup } from "./ErrorPopup";
import { ErrorTooltip } from "./ErrorTooltip";
import { IInspectorRow } from "./InspectorTableTypes";
import {
  SvgIcon,
} from "./SVGIcon";
import { TypeIcon } from "./TypeIcon";

const useStyles = makeStyles({
  borderRadiusCommon: {
    borderRadius: "5px",
  },
  button: {
    alignItems: "center",
    minWidth: "0px",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  buttonContainer: {
    alignItems: "center",
    display: "flex",
    justifyContent: "flex-start",
    marginBottom: "5px",
    marginLeft: `${iconMarginRight}${unit}`,
  },
  cancelButton: {
    marginLeft: "auto",
  },
  container: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    justifyContent: "space-between",
    minWidth: 0,
  },
  createButton: {
    "margin-left": "12px",
  },
  decoratedSelects: {
    marginBottom: "5px",
  },
  errorIndicatorIcon: {
    height: 24,
    width: 24,
  },
  inputAdornment: {
    marginLeft: -14,
    paddingLeft: "0px",
  },
  inputBox: {
    background: colorWhite,
    width: "100%",
  },
  inputText: {
    fontSize: ".9rem",
    marginLeft: -10,
    marginTop: 2,
    paddingBottom: 6,
    paddingRight: 24,
    paddingTop: 8,
  },
  inputTextWrapper: {
    height: "30px !important",
    marginBottom: "8px",
    marginLeft: "2px",
  },
  menuIndicatorIcon: {
    height: "16px",
    marginRight: "8px",
    width: "16px",
  },
  selectDropdown: {
    marginBottom: "5px",
  },
  selectDropdownElevated: {
    background: backGroundGrayColor,
    border: `1px solid ${ borderGrayColor }`,
    padding: "5px",
    position: "fixed",
    zIndex: 1,
  },
}, { name: "NewDataForm" });

export interface INewDataFormProps {
  /**
   * Callback that is executed on cancel.
   */
  onCancelCreate;
  /**
   * Callback that is executed on create.
   */
  onDataCreate: (name: string, typeid: string, context: string) => void;
  /**
   * The available options.
   */
  options: any;
  /**
   * Data Inspector row data for current row
   */
  rowData: IInspectorRow;
}

/**
 * Appends the corresponding svg icons to the options for react-select
 */
type INewDataFormOptions = Pick<IDecoratedSelectOptionType, "label" | "value">;
const addCorrespondingSvgIcon = (propOptions: INewDataFormOptions[]): DecoratedSelectOptionsType => {
  return propOptions.map((item) => ({
    ...item,
    icon: <TypeIcon typeId={item.label} />,
  }));
};

const contextOptions: DecoratedSelectOptionsType = [
  { value: "single", label: "Single Property", icon: <TypeIcon typeId={"Single"} /> },
  { value: "array", label: "Array", icon: <TypeIcon typeId={"Array"} /> },
  { value: "map", label: "Map", icon: <TypeIcon typeId={"Map"} /> },
];

const notNamedCollections = ["set", "array"];

const setContext: IDecoratedSelectOptionType = { value: "set", label: "Set", icon: <TypeIcon typeId={"Set"} /> };

export const NewDataForm: React.FunctionComponent<INewDataFormProps> = (props) => {
  const { options, onDataCreate, onCancelCreate, rowData } = props;
  const classes = useStyles();
  const [inputName, setInputName] = useState("");
  const [isCreating, setCreating] = useState(false);
  const [isNamedProp, setIsNamedProp] = useState(false);

  const siblingIds = rowData.parent ? (rowData.parent as ContainerProperty).getIds() : [];

  // Reshape the 'options' array which into an object suitable for consumption by react-select.
  // Also into each option add an SVG icon corresponding to its label.
  const typeOptions: DecoratedSelectGroupedOptionsType =
    options.map((group) => ({ label: group[0], options: addCorrespondingSvgIcon(group[1]) }));

  let listOfContextOptions: DecoratedSelectOptionsType = contextOptions;
  let defaultTypeOption: IDecoratedSelectOptionType;
  const defaultContainerOption: IDecoratedSelectOptionType = listOfContextOptions[0];

  const excludeUninheritedTemplates = () => {
    typeOptions.forEach((subType) => {
      const subTypeOptions: IDecoratedSelectOptionType[] = [];
      subType.options.forEach((typ) => {
        const parentTypes = PropertyFactory.getAllParentsForTemplate(typ.value);
        if (typ.value === rowData.parent!.getTypeid() || parentTypes.includes(rowData.parent!.getTypeid())) {
          subTypeOptions.push(typ);
        }
      });
      subType.options = subTypeOptions;
    });
  };

  const filterTypeOptions = (parentTypeid: string) => {
    const allOptions = typeOptions.reduce<IDecoratedSelectOptionType[]>((acc, val) => acc.concat(val.options), []);
    const parentTypeidOption = allOptions.find((typ) => typ.value === parentTypeid);
    return parentTypeidOption !== undefined ? parentTypeidOption : allOptions[0];
  };

  // Choose default value depending on the context
  // For "single" context  or when parent is undefined we choose the first option from the "options" property
  // For sets, maps and arrays we need to extract the typeid of parent collection and set contextOptions only to single
  if (!rowData.parent || rowData.parent!.getContext() === "single") {
    defaultTypeOption = typeOptions[0].options[0];
  } else {
    excludeUninheritedTemplates();
    defaultTypeOption = filterTypeOptions(rowData.parent!.getTypeid());
    listOfContextOptions = contextOptions.filter((cOption) => cOption.value === "single");
  }

  const [selectedTypeOption, setSelectedOption] =
    useState<IDecoratedSelectOptionType>(defaultTypeOption);
  const [selectedContainerOption, setSelectedContainerOption] =
    useState<IDecoratedSelectOptionType>(defaultContainerOption);

  useEffect(() => {
    const parentTypeId = selectedTypeOption.value;
    const parentTypes = PropertyFactory.getAllParentsForTemplate(parentTypeId);
    // sets can be created only for properties inheriting from NamedProperty
    if (rowData.parent!.getContext() === "single" &&
      (selectedTypeOption.value === "NamedProperty" || parentTypes.includes("NamedProperty"))) {
      setIsNamedProp(true);
    } else {
      setIsNamedProp(false);
      if (selectedContainerOption.value === "set") {
        setSelectedContainerOption(defaultContainerOption);
      }
    }
  }, [selectedTypeOption]);

  const handleInputChange = (event) => {
    setInputName(event.target.value);
  };

  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      handleCreateData();
    }
  };

  const handleCreateData = () => {
    setCreating(true);
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    ErrorPopup(onDataCreate.bind(null, inputName, selectedTypeOption.value, selectedContainerOption.value));
  };

  const cancelBtn = (
    <Button
      color="primary"
      variant="outlined"
      className={classNames(classes.button, classes.cancelButton)}
      onClick={onCancelCreate}
    >
      Cancel
    </Button>
  );

  const isSiblingFound = siblingIds.includes(inputName);
  const createBtn = (
    <Button
      id="createDataButton"
      variant="contained"
      color="primary"
      style={{ minWidth: "0px" }}
      className={classNames(classes.button, classes.createButton)}
      disabled={isSiblingFound || (!notNamedCollections.includes(rowData.parent!.getContext()) && !inputName.trim())}
      onClick={handleCreateData}
    >
      {isCreating ? "Creating" : "Create"}
    </Button>
  );
  const buttons = (<div className={classNames(classes.buttonContainer)}>{cancelBtn}{createBtn}</div>);

  const decoratedSelects = (
    <div className={classes.decoratedSelects}>
      <DecoratedSelect
        id="propertyTypeSelector"
        defaultValue={defaultTypeOption}
        value={selectedTypeOption}
        options={typeOptions}
        onChange={(val) => {
          setSelectedOption(val as IDecoratedSelectOptionType);
        }}
      />
      <DecoratedSelect
        id="contextSelector"
        options={isNamedProp ? listOfContextOptions.concat(setContext) : listOfContextOptions}
        defaultValue={defaultContainerOption}
        value={selectedContainerOption}
        onChange={(val: DecoratedSelectValueType) => {
          setSelectedContainerOption(val as IDecoratedSelectOptionType);
        }}
        isSearchable={false}
      />
    </div>
  );

  const nameInput = (height: number, width: number) => {
    if (rowData.parent && notNamedCollections.includes(rowData.parent!.getContext())) {
      return (<div />);
    }
    const selectedTypeOrCollectionLabel = selectedContainerOption.value === "single"
      ? selectedTypeOption.label
      : selectedContainerOption.label;

    const startAndEndAdornment = {
      endAdornment: (
        isSiblingFound ?
          (
            <ErrorTooltip
              title="A property with this name already exists"
              placement="top"
            >
              <InputAdornment
                position="end"
                classes={{ positionStart: classes.inputAdornment }}
              >
                <div>
                  <SvgIcon svgId={"error-24"} className={classes.errorIndicatorIcon} />
                </div>
              </InputAdornment>
            </ErrorTooltip>
          ) : undefined
      ),
      startAdornment: (
        <InputAdornment
          position="start"
          classes={{ positionStart: classes.inputAdornment }}
        >
          <div style={{ opacity: 0.5 }}>
            <TypeIcon typeId={selectedTypeOrCollectionLabel} />
          </div>
        </InputAdornment>
      ),
    };
    return (
      <div
        style={{ height: height - 15, width: width - 19 }}
        className={classes.inputTextWrapper}
      >
        <TextField
          fullWidth={true}
          error={isSiblingFound}
          variant="outlined"
          autoFocus={true}
          className={classes.inputBox}
          placeholder={`Name of the ${ selectedTypeOrCollectionLabel }`}
          value={inputName}
          inputProps={{ className: classes.inputText }}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          InputProps={startAndEndAdornment}
        />
      </div>
    );
  };

  return (
    <AutoSizer defaultHeight={200} defaultWidth={200}>
      {({ width, height }) => (
        <div
          style={{ width: width - 15 }}
          className={classNames(classes.container, classes.selectDropdownElevated, classes.borderRadiusCommon)}
        >
          {nameInput(height, width)}
          {decoratedSelects}
          {buttons}
        </div>
      )}
    </AutoSizer>
  );
};

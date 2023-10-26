/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { makeStyles } from "@material-ui/core/styles";
import classNames from "classnames";
import React, { useState } from "react";
import Select, {
	DropdownIndicatorProps,
	StylesConfig,
	GroupBase,
	Options as OptionsType,
	OptionProps,
	SingleValue as ValueType,
	SingleValueProps,
	Props as SelectProps,
	components,
} from "react-select";
import { SvgIcon } from "./SVGIcon";
import {
	backGroundDarkGrayColor,
	backGroundGrayColor,
	backGroundLightBlueColor,
	borderBlueColor,
	colorWhite,
	textDarkColor,
	transparentShadowColor,
} from "./constants";

const { Option, SingleValue } = components;

const useStyles = makeStyles(
	{
		customOptionLabel: {
			marginTop: "4px",
		},
		dropdown: {
			borderRadius: "4px",
			marginBottom: "5px",
		},
		dropdownClosed: {
			border: `2px solid ${backGroundGrayColor}`,
		},
		dropdownOpen: {
			border: `2px solid ${borderBlueColor}`,
		},
		menuIndicatorIcon: {
			height: "16px",
			marginRight: "8px",
			width: "16px",
		},
	},
	{ name: "DecoratedSelect" },
);

// Style api of react-select library
const reactSelectStyles: StylesConfig<IDecoratedSelectOptionType, false> = {
	container: (provided) => ({
		...provided,
		backgroundColor: "transparent",
	}),
	control: (base) => ({
		...base,
		backgroundColor: `${backGroundDarkGrayColor} !important`,
		border: "none !important",
		boxShadow: `1px 1px 10px 1px ${transparentShadowColor} !important`,
	}),
	indicatorSeparator: (provided, state) => ({
		...provided,
		display: "none",
	}),
	indicatorsContainer: (provided) => ({
		...provided,
		background: backGroundDarkGrayColor,
		borderRadius: "5px",
	}),
	menu: (base) => ({
		...base,
		marginBottom: "0px",
		marginTop: "5px",
	}),
	option: (provided, state) => ({
		...provided,
		color: textDarkColor,
		display: "flex",
		fontSize: ".9rem",
		fontWeight: "bold",
		...(state.isFocused ? { backgroundColor: backGroundLightBlueColor } : {}),
		...(!state.isFocused ? { backgroundColor: colorWhite } : {}),
	}),
	singleValue: (base) => ({
		...base,
		alignItems: "center",
		color: `${textDarkColor} !important`,
		display: "flex",
		fontSize: ".9rem",
		fontWeight: "bold",
		marginLeft: "-5px",
		marginRight: "15px",
		position: "relative",
	}),
	valueContainer: (base) => ({
		...base,
		color: "inherit",
		height: "30px",
		paddingLeft: "4px",
		width: "100%",
	}),
};

export interface IDecoratedSelectOptionType {
	/**
	 * The corresponding icon for the option
	 */
	icon: React.ReactNode;
	/**
	 * Label for selected option
	 */
	label: string;
	/**
	 * The value of the selected option
	 */
	value: string;
}

// Those two types are only exported so users can type their options arrays:
export type DecoratedSelectGroupedOptionsType<
	Group extends GroupBase<IDecoratedSelectOptionType> = GroupBase<IDecoratedSelectOptionType>,
> = readonly Group[];
export type DecoratedSelectOptionsType = OptionsType<IDecoratedSelectOptionType>;
export type DecoratedSelectValueType = ValueType<IDecoratedSelectOptionType>;

// This interfaces are also exported for convenience only:
export type DecoratedSelectProps = SelectProps<IDecoratedSelectOptionType, false>;
export type DecoratedOptionProps = OptionProps<IDecoratedSelectOptionType, false>;
export type DecoratedSingleValueProps = SingleValueProps<IDecoratedSelectOptionType, false>;
export type DecoratedDropdownProps = DropdownIndicatorProps<IDecoratedSelectOptionType, false>;

const CustomOption: React.FunctionComponent<DecoratedOptionProps> = (props) => {
	const classes = useStyles();
	return (
		<Option {...props}>
			{props.data.icon}
			<div className={classes.customOptionLabel}>{props.data.label}</div>
		</Option>
	);
};

const CustomSingleValue: React.FunctionComponent<DecoratedSingleValueProps> = ({
	children,
	...props
}) => {
	return (
		<SingleValue {...props}>
			{props.data.icon}
			{children}
		</SingleValue>
	);
};

const CustomDropdownIndicator: React.FunctionComponent<DecoratedDropdownProps> = (props) => {
	const classes = useStyles();
	return (
		<SvgIcon
			svgId={props.selectProps.menuIsOpen ? "clear-24" : "down"}
			className={classes.menuIndicatorIcon}
			hoverable
		/>
	);
};

export const DecoratedSelect: React.FunctionComponent<DecoratedSelectProps> = (props) => {
	const classes = useStyles();
	const { components, ...restProps } = props;
	const [renderBorder, setRenderBorder] = useState(false);
	return (
		<div
			className={classNames(
				classes.dropdown,
				renderBorder ? classes.dropdownOpen : classes.dropdownClosed,
			)}
		>
			<Select<IDecoratedSelectOptionType>
				{...restProps}
				onMenuOpen={() => setRenderBorder(true)}
				onMenuClose={() => setRenderBorder(false)}
				isSearchable={renderBorder}
				value={renderBorder ? { icon: "", label: "", value: "" } : props.value}
				components={{
					...components,
					DropdownIndicator: CustomDropdownIndicator,
					Option: CustomOption,
					SingleValue: CustomSingleValue,
				}}
				styles={reactSelectStyles}
			/>
		</div>
	);
};

DecoratedSelect.defaultProps = {
	maxMenuHeight: 180,
	menuPlacement: "bottom",
	pageSize: 5,
	isSearchable: true,
};

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

type Omit<T, K> = Pick<T, Exclude<keyof T, K>>;
export { Omit };

// TODO change this to a relative units and go back to @hig/icon or similar.
// Using these broke the vertical centering.
export const iconHeight = "24";
export const iconWidth = "24";
export const iconMarginRight = 13;
export const unit = "px";
export const minRows: number = 10;
export const rowWidthInterval: number = 0.25;
export const minRowWidth: number = 0.125;

/**
 * An object containing data messages with related errors.
 */
export const InspectorMessages: { [key: string]: string; } = {
  CONSTANT_PROPERTY: "This property is a constant. It and its children can't be modified.",
  EMPTY_WORKSPACE: "To get started, add some data to this document.",
  NO_DATA: "To get started, create a new document or connect to an existing one.",
  NO_WORKSPACE: "To get started, insert this property into a valid document.",
};

export const icon24 = "24px";

export const colorWhite = "#FFFFFF";
export const colorBlack = "#000000";

export const backGroundLightColor = "#EEEEEE";
export const backGroundDarkColor = "#DCDCDC";
export const backGroundGrayColor = "#F5F5F5";
export const backGroundDarkGrayColor = "#E7E7E7";
export const backGroundLightBlueColor = "#E6F4FB";

export const iconBaseColor = "#808080";
export const iconHoverColor = "#3c3c3c";
export const iconSelectColor = "#088BD1";

export const borderLightBlueColor = "#088BD1";
export const borderBlueColor = "#0696D7";
export const borderGrayColor = "#ECEEF0";

export const textDarkColor = "#3C3C3C";

export const transparentShadowColor = "rgba(0,0,0,0)";

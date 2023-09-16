import { IIconProps, IStackTokens, createTheme } from "@fluentui/react";

export const addIcon: IIconProps = { iconName: "Add" };
export const buildIcon: IIconProps = { iconName: "Build" };
export const clearIcon: IIconProps = { iconName: "PageRemove" };
export const marginTop10 = { marginTop: 10 };
export const marginTop1010 = { marginTop: 10, paddingLeft: 10 };
export const sendIcon: IIconProps = { iconName: "Send" };
export const stackTokens: IStackTokens = { childrenGap: 10 };
export const standardLength = {
	width: 220,
	paddingLeft: 10,
};
export const standardPaddingStyle: React.CSSProperties = {
	marginTop: 10,
	paddingLeft: 20,
	paddingRight: 20,
};
export const standardSidePadding = {
	paddingLeft: 20,
	paddingRight: 20,
};

export const rootStyle: React.CSSProperties = {
	padding: 50,
};

export const darkTheme = createTheme({
	palette: {
		themePrimary: "#0078d4",
		themeLighterAlt: "#eff6fc",
		themeLighter: "#deecf9",
		themeLight: "#c7e0f4",
		themeTertiary: "#71afe5",
		themeSecondary: "#2b88d8",
		themeDarkAlt: "#106ebe",
		themeDark: "#005a9e",
		themeDarker: "#004578",
		neutralLighterAlt: "#323130",
		neutralLighter: "#31302f",
		neutralLight: "#2f2e2d",
		neutralQuaternaryAlt: "#2c2b2a",
		neutralQuaternary: "#2a2928",
		neutralTertiaryAlt: "#282726",
		neutralTertiary: "#c8c8c8",
		neutralSecondary: "#d0d0d0",
		neutralSecondaryAlt: "#d0d0d0",
		neutralPrimaryAlt: "#dadada",
		neutralPrimary: "#ffffff",
		neutralDark: "#f4f4f4",
		black: "#f8f8f8",
		white: "#323130",
	},
});

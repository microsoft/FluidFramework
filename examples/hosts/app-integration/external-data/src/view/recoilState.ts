import { atom } from "recoil";

export const localUnsavedChangesState = atom({
	key: "localUnsavedChanges",
	default: 0,
});

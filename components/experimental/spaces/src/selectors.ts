import {
    ISpacesDataProps,
    ISpacesSelector,
} from "./interfaces";

export const SpacesSelector: ISpacesSelector = {
    areTemplatesAvailable: {
        function: (
            state,
            dataProps: ISpacesDataProps,
        ) => dataProps.componentRegistry?.IComponentRegistryTemplates !== undefined,
    },
};

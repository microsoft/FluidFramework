import { IComponentRuntime } from "@fluidframework/component-runtime-definitions";

export async function waitForAttach(componentRuntime: IComponentRuntime): Promise<void> {
    if (!componentRuntime.isAttached) {
        return;
    }

    return new Promise((resolve) =>{
        componentRuntime.on(
            "collaborating",
            () => {
                Promise.resolve().then(()=>resolve()).catch(()=>{});
            });
    });
}

export function onAttach(componentRuntime: IComponentRuntime, callback: () => void) {
    waitForAttach(componentRuntime)
        .then(()=>callback())
        .catch((error) => {});
}

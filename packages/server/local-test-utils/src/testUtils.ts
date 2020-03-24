import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { TestHost } from ".";

// Keeping getComponent in testUtils even though it has been deprecated from sharedComponent
// This is to allow us to fetch the _scheduler which is set at initializing
export async function getComponent<T extends IComponent>(
    host: TestHost,
    id: string,
    wait: boolean = true
): Promise<T> {
    const root = await host.root;
    const request = {
        headers: [[wait]],
        url: `/${id}`,
    };

    return root.asComponent<T>(root.context.hostRuntime.request(request));
}

import { IContainer } from "../../loader";

export async function test(container: IContainer) {
	// Not deprecated
	await container.request({ url: "/" });
	// Deprecated
	await container.request({ url: "/", headers: { shouldBeDeprecated: true }});
	// Deprecated
	await container.request({ url: "/should/be/deprecated" });
}

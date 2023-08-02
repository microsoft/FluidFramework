import { IDataStore } from "../../dataStoreContext";

export async function test(dataStore: IDataStore) {
	// Not deprecated
	await dataStore.request({ url: "/" });
	// Deprecated
	await dataStore.request({ url: "/", headers: { expectDeprecated: true }});
	// Deprecated
	await dataStore.request({ url: "/should/be/deprecated" });
}

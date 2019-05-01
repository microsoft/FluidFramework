import * as request from "request-promise-native";
import { IPackage } from "../../definitions";

export async function addPackage(url: string, packageToAdd: IPackage): Promise<IPackage> {
    const newPackage = await request.post(
        `${url}/api/packages`,
        {
            body: packageToAdd,
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            json: true,
        });
    return newPackage;
}

export async function deletePackage(url: string, name: string): Promise<string> {
    await request.delete(
        `${url}/api/packages/${name}`,
        {
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            json: true,
        },
    );
    return name;
}

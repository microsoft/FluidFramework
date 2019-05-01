import { IPackage } from "./definitions";

export class PackageManager {

    private packages: IPackage[];
    constructor() {
        this.packages = [
            {
                name: "@chaincode/shared-text",
                version: "0.0.1",
            },
            {
                name: "@chaincode/monaco",
                version: "0.0.5",
            },
            {
                name: "@chaincode/pinpoint-editor",
                version: "0.0.10",
            },
            {
                name: "@chaincode/charts",
                version: "0.0.1",
            },
        ];
    }
    public getPackages(): IPackage[] {
        return this.packages;
    }

    public addPackage(packageToAdd: IPackage): IPackage {
        this.packages.push(packageToAdd);
        return packageToAdd;
    }

    public removePackage(name: string): string {
        const index = this.packages.findIndex((value) => name === value.name);
        if (index !== -1) {
            this.packages.splice(index, 1);
            return name;
        }
    }
}

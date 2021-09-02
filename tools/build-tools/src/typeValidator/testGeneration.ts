/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import { PackageDetails } from "./packageJson";
import { generateTypeDataForProject } from "./typeData";

export function generateTests(packageDetails: PackageDetails, packageDir: string) {

    const currentTypeData = generateTypeDataForProject(packageDir, undefined);

    for(const oldVersion of packageDetails.oldVersions){
            const testString: string[]=[
`/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as old from "${oldVersion}";
import * as current from "../index";
`
            ];
        const oldDetails = generateTypeDataForProject(packageDir, oldVersion);
        const oldTypes = oldDetails.typeData;
        for(const type of currentTypeData.typeData){
            const typeString = type.name.replace(".","");
            // no need to test new types
            if(!type.internal && oldTypes.some((t)=>t.name.replace(".","") == typeString)){
                const oldType = `old.${type.name}`
                const currentType = `current.${type.name}`


                const getOldSig =`get_old_${typeString}`;
                const setOldSig =`set_old_${typeString}`;
                testString.push(`declare function ${getOldSig}(): ${oldType};`);
                const testGet = [`const current${typeString}: ${currentType} =`,`${getOldSig}();`];
                testString.push(`${testGet[0]}${ testGet[0].length + testGet[1].length > 125 ?"\n    " : " "}${testGet[1]}`)
                testString.push()
                testString.push(`declare function ${setOldSig}(oldVal: ${oldType});`);
                testString.push(`${setOldSig}(current${typeString});`)
                testString.push("");
            }
        }
        fs.writeFileSync(`${packageDir}/src/test/validate${oldDetails.packageDetails.version}.ts`, testString.join("\n"));
    }
}

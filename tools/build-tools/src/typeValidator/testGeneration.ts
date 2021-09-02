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
            if(oldTypes.some((t)=>t.name.replace(".","") == typeString)){
                const oldType = `old.${type.name}`
                const currentType = `current.${type.name}`

                if(currentTypeData.packageDetails.broken[type.name]?.forwardCompat !== false){
                    testString.push(`// validate forward compat by using old type in place of current type`);
                    testString.push(`// disable in package.json under typeValidation.broken:`);
                    testString.push(`// "${type.name}": {"forwardCompat": false}`);
                    testString.push(... buildTestCase(oldType, currentType))
                }

                if(currentTypeData.packageDetails.broken[type.name]?.backCompat !== false){
                    testString.push(`// validate back compat by using current type in place of old type`);
                    testString.push(`// disable in package.json under typeValidation.broken:`);
                    testString.push(`// "${type.name}": {"backCompat": false}`);
                    testString.push(... buildTestCase(currentType, oldType))
                }

            }
        }
        fs.writeFileSync(`${packageDir}/src/test/validate${oldDetails.packageDetails.version}.ts`, testString.join("\n"));
    }
}


function buildTestCase(getAsType:string, useType:string){
    const getSig =`get_${getAsType.replace(".","_")}`;
    const useSig =`use_${useType.replace(".","_")}`;
    const testString: string[] =[];
    testString.push(`declare function ${getSig}(): ${getAsType};`);
    testString.push(`declare function ${useSig}(use: ${useType});`);
    testString.push(`${useSig}(${getSig}());`)
    testString.push("");
    return testString
}

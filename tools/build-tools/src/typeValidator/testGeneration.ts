/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { VersionedTypeData } from "./typeData";
import * as fs from "fs";

export function generateTests(versionedData: VersionedTypeData, packageDir: string) {
    const allTypeData = versionedData.typeData;
    const currentVersion = versionedData.pkg.noPatchString;
    const currentTypeData = versionedData.typeData[currentVersion];
    for(const oldVersion of Object.keys(allTypeData)){
        if(oldVersion !== versionedData.pkg.noPatchString){
            const testString: string[]=[
`/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as old from "${versionedData.pkg.name.substr((versionedData.pkg.name.indexOf("/") ?? -1)+1)}-${oldVersion}";
import * as current from "../index";
`
                    ]
            const oldTypes = allTypeData[oldVersion];
            for(const type of currentTypeData){
                const typeString = type.name.replace(".","");
                // no need to test new types
                if(!type.isPrivate && oldTypes.some((t)=>t.name.replace(".","") == typeString)){
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
            fs.writeFileSync(`${packageDir}/src/test/validate${oldVersion}.ts`, testString.join("\n"));
        }
    }
}

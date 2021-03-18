/**
 * This util function
 * computes the delta changes
 * between given markdown files 
 * and returns a JSON response 
 * summarising the changes
 */

export interface IDelta {
    lineNumber: number,
    startPosition: number,
    endPosition?: number,
    updatedValue: string
}

export const calculateDeltaBetweenMarkdown = async (markdownNew: string, markdownOld: string) => {
    /**
     * Both the markdowns would be a 2D array of string,
     */

    let markdownNewStr = markdownNew.split('\n');
    let markdownOldStr = markdownOld.split('\n');

    for(let i=0;i<markdownNewStr.length;i++){
        if(markdownNewStr[i] === ''){
            markdownNewStr.splice(i,1)
        }
    }

    for(let i=0;i<markdownOldStr.length;i++){
        if(markdownOldStr[i] === ''){
            markdownOldStr.splice(i,1)
        }
    }

    let alldiffPromise = [];
    let lineNumber = 0;

    let i = 0

    for(;i<markdownNewStr.length && i<markdownOldStr.length;i++){
        if(markdownNewStr[i] !== markdownOldStr[i]){
            alldiffPromise.push(calculateDeltaBetweenStrings(markdownNewStr[i],markdownOldStr[i],lineNumber+1));
        }
        lineNumber = lineNumber+1;
    }

    for(;i<markdownNewStr.length;i++){
        alldiffPromise.push(calculateDeltaBetweenStrings(markdownNewStr[i],'',lineNumber+1));
        lineNumber = lineNumber+1;
    }

    // collate all the Promise of changes and return it
    return Promise.all(alldiffPromise);

}

const calculateDeltaBetweenStrings = async(strNew: string, strOld: string, lineNumber: number): Promise<IDelta> => {
    let diff: IDelta = {
        startPosition: 0,
        endPosition: -1,
        lineNumber: lineNumber,
        updatedValue: strNew
    };


    for(let i=0;i<strNew.length && i<strOld.length;i++){
        if(strNew[i] === strOld[i]){
            continue;
        }else{
            diff.startPosition = i;
            diff.endPosition = -1;
            diff.updatedValue = strNew.substring(i);
            break;
        }
    }

    return diff;

}


# Word Nuget Package Creation
.nuspec file is the config file to pack a nuget package. Include the files/folders to be added to the nuget package to the <files> tag in the .nuspec file

## Prerequisities
Install Nuget:
[Nuget](https://nuget.org/downloads/)

## Commands to build nuget package locally
To build a nuget package for the word module , run the following commands:
* Change the path for the working directory to ~Prague\word\packages\word
* nuget pack -NoDefaultExclude -OutputDirectory "<Destination file path>"
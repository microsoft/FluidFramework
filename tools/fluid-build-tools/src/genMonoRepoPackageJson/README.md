# Generate MonoRepo package.json and package-lock.json for Component Governance scan

Component Governance is an internal tool run on the CI that gathers information about our
open source dependencies.  The scanning tool use package.json and package-lock.json.

In our repo, we have a lerna-package-lock.json for our lerna projects. This tool solves
two problems:

- Generate the corresponding package.json for the lerna project by gathering all the
dependencies from all the packages, and output it to repo-package.json
- Because lerna doesn't distingish between dependencies vs devDependencies, this tool
will use the lerna-package-lock.json and patch up the "dev" field in the dependencies and
output it to repo-package-lock.json

Currently, the tool implicit understand our repo structure and process the client and server
 lerna projects.  The tool will need to be updated if that changes.

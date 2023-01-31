# @fluidframework/test-tools

Tools to help with testing

## AssignTestPorts.ts

Used to assign unique ports to jest/puppeteer tests so that they do not need to be hardcoded into config files, and so writers of new tests do not need to manually find the next available port. This is an issue because all jest tests are run concurrently for performance, so ports may not be re-used.

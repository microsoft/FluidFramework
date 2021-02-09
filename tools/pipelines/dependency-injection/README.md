# Pipeline Dependency Injection

This directory contains a minimal package.json file with dependencies on various packages we'd like to inject into
our test code during a pipeline run. The file is called _package.json to avoid being installed with the rest of the
repo, but only when being used explicitly in a pipeline (at which point it's renamed to remove the underscore)

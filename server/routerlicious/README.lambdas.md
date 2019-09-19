# Writing a Microservice/Lambda (2019)

In order to get a new lambda up and running on routerlicious, you'll need to write hooks in a few different places. (In each case, you will also see the same hooks for the other microservices - as of September 2019, the "deli" service is the easiest to use as a template for your own work.)

#### In `<root>/server/` :
* Add your service to the local [docker-compose.yml](./docker-compose.yml) file. If you will require extra functionality (e.g. debugging, logging, etc.), then make sure to also add hooks in the corresponding supplemental `docker-compose.{debug,logs,etc.}.yml` files.

#### In `<root>/packages/server/lambdas` :
The meat of your code will live in the [src/](../../packages/server/lambdas/src/) folder.
* Write your main lambda file (which must implement `IPartitionLambda`) and a corresponding lambdaFactory (which must implement `IPartitionLambdaFactory`), and make sure to export these via a simple `index.ts` (and document your code with a README, too!).
* In the top-level [lambdas/src/index.ts](../../packages/server/lambdas/src/index.ts), export your lambda's members again.

#### In `<root>/packages/server/routerlicious/` :
* In [src/](../../packages/server/routerlicious/src), make an `index.ts` file that exports a `create` function that returns your lambda factory method.
* Add hooks for Node to run your index file in [src/package.json](../../packages/server/routerlicious/src/package.json). Use the other services as a template - in particular you'll need to provide a debug-flagged version of the npm script as well.

#### Misc.
* Finally, meta-information can be kept anywhere but the trend is for anything related to config or setup for your lambda in particular to be kept in 
[<root>/packages/server/routerlicious/config/config.json](../../packages/server/routerlicious/config/config.json)

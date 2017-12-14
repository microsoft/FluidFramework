## Module agent

This is an example of a basic typescript module that routerlicious understands. We are encapsulating the resume classifier as a module here. The module exports a factory capable of creating a classifier and running it. Eventually this will transform into an API abstraction layer capable of running any augmentation loop workflow defined by office team.

### Instrcution

#### Build
```bash
$ cd resume-analytics
$ npm run build
```

#### Pack
```bash
$ npm pack
```
This will create, in the same directory, a tarball named after the name of the project + the version specified in the package.json.

This is exactly what is published to npmjs.org! You can now see what’s inside, run

```bash
$ tar -tf packagename-version.tgz
```

For now we only support zip file named same as the module-name. So unzip the tarball and rename the <package> folder to <module-name>. Zip it and upload to our portal.
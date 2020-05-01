var express = require('express');
var fs = require('fs');
var router = express.Router();

let pkgMain = "dist/main.bundle.js";
const localhostURL = "http://localhost:8080/";

async function getPackage() {
    const executedDir = process.cwd();
    const pkgString = await fs.readFileSync(`${executedDir}/package.json`);
    return JSON.parse(pkgString);
}

async function getFilePath() {
  const pkg = await getPackage();
  return pkg.fluid.browser.umd.files[0];
}

async function createManifest() {
  const pkg = await getPackage();

  const manifest = {
      id: pkg.name,
      experimentalData: {
          fluid: true
      },
      loaderConfig: {
          entryModuleId: "main",
          internalModuleBaseUrls: [
              localhostURL
          ],
          scriptResources: {
              "fluid.main": {
                  path: await getFilePath()
              }
          }
      },
      preconfiguredEntries: [
          {
              title: {
                  default: pkg.name
              },
              description: {
                  default: pkg.description
              }
          }
      ]
  }
  return {
      Manifest: JSON.stringify(manifest)
  }
}

async function getPackageContents() {
  const fileContent = await fs.readFileSync(localhostUrl + pkgMain);
  return fileContent;
}

/* GET home page. */
router.get('/getclientsidewebparts', async function(req, res, next) {
  var response = {d: {GetClientSideWebParts: { results: [(await createManifest())]}}};
  res.send(response);
});

router.get('/dist/main.bundle.js', async function(req, res, next) {
  res.send(await getPackageContents());
});

module.exports = router;

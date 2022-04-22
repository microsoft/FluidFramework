// eslint-disable-next-line unicorn/import-style
import * as path from 'path';
import * as process from 'process';
import mrm from 'mrm-core';
import { globby, globbyStream } from 'globby';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const { json, lines, packageJson } = mrm;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FLUID_ROOT = process.env._FLUID_ROOT_ ? process.env._FLUID_ROOT_ : 'C:\\code\\FluidFramework';
const STARTING_PATH = process.cwd();

(async () => {
    let all_scripts = new Set();

    for await (const p of globbyStream('**/package.json', { gitignore: true })) {
        const absPath = path.dirname(path.resolve(STARTING_PATH, p));
        process.chdir(absPath);
        // console.log(absPath);

        const relPath = path.relative(FLUID_ROOT, absPath).split(path.sep).join(path.posix.sep);
        // console.log(relPath);

        const pkgJson = json(path.join(absPath, 'package.json'));

        const pkgName = pkgJson.get('name');
        const isPrivate = pkgJson.get('private');

        let tags = [];
        let projectType;
        if (absPath.includes('common')) {
            tags = ['scope:common'];
            projectType = 'library';
        } else if (absPath.includes('examples')) {
            tags = ['scope:examples'];
            projectType = 'app';
        } else if (absPath.includes('server')) {
            tags = ['scope:server'];
            projectType = 'library';
        } else {
            tags = ['scope:client'];
            projectType = 'library';
        }

        const scripts = pkgJson.get('scripts');
        if (scripts && !tags.includes('scope:server')) {
            for (const script of Object.keys(scripts)) {
                all_scripts.add(script);
            }
        }
    }
    console.log(JSON.stringify([...all_scripts]));
})();

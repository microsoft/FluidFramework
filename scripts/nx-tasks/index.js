// eslint-disable-next-line unicorn/import-style
import * as path from 'path';
import * as process from 'process';
import mrm from 'mrm-core';
import { globby, globbyStream } from 'globby';

const { json, lines, packageJson } = mrm;

const FLUID_ROOT = process.env._FLUID_ROOT_ ? process.env._FLUID_ROOT_ : 'C:\\code\\FluidFramework';
const STARTING_PATH = process.cwd();

(async () => {
    for await (const p of globbyStream('**/package.json', { gitignore: true })) {
        const absPath = path.dirname(path.resolve(STARTING_PATH, p));
        process.chdir(absPath);

        console.log(process.cwd());
        console.log(absPath);
        const relPath = path.relative(FLUID_ROOT, absPath).split(path.sep).join(path.posix.sep);
        console.log(relPath);

        const pkgJson = json(path.join(absPath, 'package.json'));

        const pkgName = pkgJson.get('name');
        const isPrivate = pkgJson.get('private');

        if (!isPrivate) {
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

            pkgJson
                .set('nx.tags', tags)
                .set('nx.targets', {
                    'build:esnext': {
                        executor: '@nrwl/workspace:run-script',
                        outputPath: ['libs'],
                        options: {
                            script: 'build:esnext',
                        },
                    }
                })
                .set('nx.projectType', projectType)
                .save();

            // json(path.join(absPath, 'package.json'))
            //   .set('scripts.build', `nx build:compile ${pkgName} && nx lint ${pkgName} && nx build:docs ${pkgName}`)
            //   .set('scripts.build:commonjs', `nx tsc ${pkgName} && nx build:test ${pkgName}`)
            //   .set('scripts.build:compile', `nx build:commonjs ${pkgName} && nx build:esnext ${pkgName}`)
            //   .set('scripts.build:full', `nx build ${pkgName}`)
            //   .set('scripts.build:full:compile', `nx build:compile ${pkgName}`)
            //   .set('scripts.lint', `nx eslint ${pkgName}`)
            //   .set('scripts.lint:fix', `nx eslint:fix ${pkgName}`)
            //   .save();

            // json(path.join(absPath, 'project.json'))
            //     .set({
            //         name: pkgName,
            //         root: relPath,
            //         sourceRoot: path.posix.join(relPath, 'src'),
            //         projectType: 'library',
            //         generators: {},
            //         targets: {
            // build: {
            //   executor: '@nrwl/workspace:run-commands',
            //   options: {
            //     outputPath: 'dist/',
            //     commands: [
            //       `nx build:compile ${pkgName}`,
            //       `nx lint ${pkgName}`,
            //     ],
            //     parallel: true,
            //     dependsOn: [
            //       {
            //         target: 'build:compile',
            //         projects: 'dependencies',
            //       },
            //     ],
            //   },
            // },
            // 'build:compile': {
            //   executor: '@nrwl/workspace:run-commands',
            //   options: {
            //     outputPath: ['dist'],
            //     commands: [
            //       `nx build:commonjs ${pkgName}`,
            //       `nx build:esnext ${pkgName}`,
            //     ],
            //     parallel: true,
            //     dependsOn: [
            //       {
            //         target: 'tsc',
            //         projects: 'dependencies',
            //       },
            //       {
            //         target: 'build:test',
            //         projects: 'dependencies',
            //       },
            //       {
            //         target: 'build:esnext',
            //         projects: 'dependencies',
            //       },
            //     ],
            //   },
            // },
            // 'build:commonjs': {
            //   executor: '@nrwl/workspace:run-commands',
            //   options: {
            //     outputPath: ['dist'],
            //     commands: [
            //       `nx tsc ${pkgName}`,
            //       `nx build:test ${pkgName}`,
            //     ],
            //     parallel: false,
            //     dependsOn: [
            //       {
            //         target: 'tsc',
            //         projects: 'dependencies',
            //       },
            //       {
            //         target: 'build:test',
            //         projects: 'dependencies',
            //       },
            //     ],
            //   },
            // },
            // 'build:esnext': {
            //     executor: '@nrwl/workspace:run-script',
            //         outputPath: ['libs'],
            //             options: {
            //         script: 'build:esnext',
            //                 },
            // },
            // lint: {
            //   executor: '@nrwl/workspace:run-commands',
            //   options: {
            //     outputPath: ['dist'],
            //     commands: [
            //       `nx eslint ${pkgName}`,
            //     ],
            //     parallel: true,
            //     dependsOn: [],
            //   },
            // },
            //         },
            //     })
            //                 .save();
        }
    }
    //   .removeScript('build')
    //   .removeScript('build:commonjs')
    //   .removeScript('build:compile')
    //   .removeScript('build:full')
    //   .removeScript('build:full:compile')
    //   .removeScript('lint')
    //   .removeScript('lint:fix')
    //   .save();

    // process.chdir(STARTING_PATH);
    // }

    console.log('Done');
})();

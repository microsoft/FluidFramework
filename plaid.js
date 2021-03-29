const esb = require('esbuild');
const fs = require("fs-extra");
const globby = require('globby');
const { program } = require('commander');

program
    .option('-d, --debug', 'output extra debugging')
    .option('-s, --small', 'small pizza size')
    .option('-p, --pizza-type <type>', 'flavour of pizza');

const build = async (mode, globs) => {
    if (mode === "commonjs") {
        esb.build({
            entryPoints: await globby(globs),
            tsconfig: 'tsconfig.json',
            target: ["es2017"],
            // bundle: true,
            outbase: 'src',
            outdir: 'dist',
            format: 'cjs',
            sourcemap: true,
            logLevel: 'info',
            logLimit: 50,
            metafile: true,
        }).catch(() => process.exit(1));
    } else if (mode === "test") {
        esb.build({
            entryPoints: await globby(globs),
            tsconfig: 'src/test/tsconfig.json',
            target: ["es2017"],
            // bundle: true,
            outbase: 'src',
            outdir: 'dist',
            format: 'cjs',
            sourcemap: true,
            logLevel: 'info',
            logLimit: 50,
            metafile: true,
        }).catch(() => process.exit(1));
    }
}

(async () => {
    const src = ['src/**/*.ts', 'src/**/*.tsx', '!src/test/**'];
    const test = ['src/test/**'];

    // console.log(paths);

    await build("commonjs", src);
    await build("test", test)
})();

/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import Benchmark = require('benchmark');
import { Jsonable } from '@microsoft/fluid-runtime-definitions';
const process = require('process');
const { fork } = require('child_process');

export function getTestArgs() {
  const [, , cmdArgs] = process.argv;
  return JSON.parse(cmdArgs);
}

export function benchmark(name: string, fn: () => void) {
  new Benchmark(name, fn)
    .on('complete', (event: any) => {
      process.send!(event);
    })
    .on('error', (event: any) => {
      process.send!(event);
    })
    .run();
}

export function run(modules: { path: string; args: Jsonable }[]) {
  return new Promise(accept => {
    const results: any[] = [];

    function pretty(num) {
      const [whole, fractional] = `${num}`.split('.');
      return `${whole.replace(/(?=(?:\d{3})+$)(?!\b)/g, ',')}${fractional !== undefined ? '.' + fractional : ''}`;
    }

    const msgHandler = ({ type, target }) => {
      switch (type) {
        case 'complete':
          results.push(target);
          const { hz, name, stats } = target;
          console.log(
            `${name} x ${pretty(hz.toFixed(target.hz < 100 ? 2 : 0))} ops/sec \xb1${stats.rme.toFixed(2)}% (${
              stats.sample.length
            } run${stats.sample.length == 1 ? '' : 's'} sampled)`
          );
          startNext();
          break;
        default:
          console.error(target);
          process.exit(1);
          break;
      }
    };

    function startNext() {
      const nextModule = modules.shift();
      if (nextModule !== undefined) {
        fork(nextModule.path, [JSON.stringify(nextModule.args)]).once('message', msgHandler);
      } else {
        console.log();
        console.table(
          results
            .sort((left, right) => right.hz - left.hz)
            .map(({ hz, name, stats }) => ({
              name,
              'ops/sec': pretty(hz.toFixed(2)),
              rme: `\xb1${pretty(stats.rme.toFixed(2))}%`,
              samples: stats.sample.length
            }))
        );
        console.log();
        accept();
      }
    }

    startNext();
  });
}

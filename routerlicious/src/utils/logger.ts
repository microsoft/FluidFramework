import * as debug from "debug";
import * as winston from "winston";

export interface IWinstonConfig {
    colorize: boolean;
    json: boolean;
    label: string;
    level: string;
    timestamp: boolean;
}

/**
 * Configures the default behavior of the Winston logger based on the provided config
 */
export function configureLogging(config: IWinstonConfig) {
    // Configure default winston logger
    winston.configure({
        transports: [
            new winston.transports.Console({
                colorize: config.colorize,
                handleExceptions: true,
                json: config.json,
                label: config.label,
                level: config.level,
                stringify: (obj) => JSON.stringify(obj),
                timestamp: config.timestamp,
            }),
        ],
    });

    // Forward all debug library logs through winston
    (<any> debug).log = (msg, ...args) => winston.info(msg, ...args);
    // override the default log format to not include the timestamp since winston will do this for us
    // tslint:disable-next-line:only-arrow-functions
    (<any> debug).formatArgs = function(args) {
        const name = this.namespace;
        args[0] = name + " " + args[0];
    };
}

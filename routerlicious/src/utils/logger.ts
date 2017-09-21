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
export function configureWinston(config: IWinstonConfig) {
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
}

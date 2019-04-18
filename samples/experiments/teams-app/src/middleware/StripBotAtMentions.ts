import * as builder from "botbuilder";

// Strip bot mentions from the message text
export class StripBotAtMentions implements builder.IMiddlewareMap {

    public readonly botbuilder = (session: builder.Session, next: Function): void => {
        let message = session.message;
        if (message) {
            let botMri = message.address.bot.id.toLowerCase();
            let botAtMentions = message.entities && message.entities.filter(
                (entity) => (entity.type === "mention") && (entity.mentioned.id.toLowerCase() === botMri));
            if (botAtMentions && botAtMentions.length) {
                // Save original text as property of the message
                (message as any).textWithBotMentions = message.text;
                // Remove the text corresponding to each mention
                message.text = botAtMentions.reduce(
                    (previousText, entity) => {
                        return previousText.replace(entity.text, "").trim();
                    },
                    message.text,
                );
            }
        }
        next();
    }
}

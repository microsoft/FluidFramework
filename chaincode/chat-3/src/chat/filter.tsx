// TODO: Consider hashing this list and matching it to hashed messages so that clients don't have the list.
const profaneWords = ["belichick", "boston", "brady", "bruins", "celtics", "new england", "red sox", "patriots"];

const profanExp = new RegExp(profaneWords.join("|"), "gi");
const cheating = false;

export function filter(input: string): string {
  if (!cheating) {
    return input.replace(profanExp, (match: string, matchStart: number, matchedPhrase: string) => {
      let cleaned = match.slice(0, 1);
      cleaned += "*".repeat(match.length - 2);
      cleaned += match.slice(match.length - 1, match.length);
      return cleaned;
    });
  }
  return input;
}

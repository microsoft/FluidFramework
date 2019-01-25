// TODO: Consider hashing this list and matching it to hashed messages so that clients don't have the list.
const profane_words = ["belichick", "boston", "brady", "bruins", "celtics", "new england", "red sox", "patriots"];

const profanExp = new RegExp(profane_words.join("|"), "gi");
let cheating = false;

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

/**
 * If you cheat, active client can publish profane language, but others will scrub it.
 */
function cheat() {
  cheating = !cheating;
  if (cheating) {
    console.log("You cheater");
  } else {
    console.log("Thanks!");
  }
}

(window as any).cheat = cheat;

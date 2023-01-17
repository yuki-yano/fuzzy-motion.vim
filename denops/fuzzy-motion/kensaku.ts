import type { Denops } from "./mod.ts";
import { assertString, Buffer } from "./mod.ts";
import type { Result, Word } from "./types.ts";

const KENSAKU_SCORE = 1;

export const getKensakuResults = async ({
  denops,
  input,
  words,
}: {
  denops: Denops;
  input: string;
  words: ReadonlyArray<Word>;
}): Promise<Array<Result>> => {
  if (input.length < 2) {
    return [];
  }

  const kensakuQuery = await denops.dispatch("kensaku", "query", input);
  assertString(kensakuQuery);
  const kensakuPattern = new RegExp(kensakuQuery);

  let kensakuResults: Array<Result> = [];
  for (const word of words) {
    const match = kensakuPattern.exec(word.text);
    if (match != null) {
      const matchIndex = Buffer.byteLength(word.text.slice(0, match.index));
      const end =
        matchIndex +
        Buffer.byteLength(
          word.text.slice(match.index, match.index + match[0].length)
        );
      kensakuResults = [
        ...kensakuResults,
        {
          item: word,
          start: matchIndex,
          end,
          score: KENSAKU_SCORE,
        },
      ];
    }
  }

  return kensakuResults;
};

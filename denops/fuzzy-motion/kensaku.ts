import type { Denops } from "./mod.ts";
import { assert, is } from "./mod.ts";
import type { Result, Word } from "./types.ts";
import { Buffer } from "node:buffer";

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
  assert(kensakuQuery, is.String);
  const kensakuPattern = new RegExp(kensakuQuery, "g");
  const search = (word: Word) => kensakuPattern.exec(word.text);

  let kensakuResults: Array<Result> = [];
  for (const word of words) {
    let match = search(word);
    while (match) {
      const matchIndex = Buffer.byteLength(word.text.slice(0, match.index));
      const end = matchIndex +
        Buffer.byteLength(
          word.text.slice(match.index, match.index + match[0].length),
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
      match = search(word);
    }
  }

  return kensakuResults;
};

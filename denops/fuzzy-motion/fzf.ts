import { extendedMatch, Fzf } from "./mod.ts";
import { Result, Word } from "./types.ts";

export const getFzfResults = ({
  input,
  words,
}: {
  input: string;
  words: ReadonlyArray<Word>;
}): Array<Result> => {
  const fzf = new Fzf(words, {
    selector: (word) => word.text,
    match: extendedMatch,
  });

  return [...fzf.find(input)];
};

import { FzfResultItem } from "./mod.ts";

type WordPos = {
  line: number;
  col: number;
};

export type Word = {
  text: string;
  pos: WordPos;
};

export type Target = Word & {
  char: string;
  start: number;
  end: number;
  score: number;
};

export type Result = Omit<FzfResultItem<Word>, "positions">;

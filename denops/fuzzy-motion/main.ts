import type { Denops } from "https://deno.land/x/denops_std@v2.2.0/mod.ts";
import { globals } from "https://deno.land/x/denops_std@v2.2.0/variable/mod.ts";
import { execute } from "https://deno.land/x/denops_std@v2.2.0/helper/mod.ts";
import * as helper from "https://deno.land/x/denops_std@v2.2.0/helper/mod.ts";
import { Fzf, FzfResultItem } from "https://esm.sh/fzf@0.4.1";
import {
  ensureNumber,
  isNumber,
} from "https://deno.land/x/unknownutil@v1.1.4/mod.ts";

type WordPos = {
  line: number;
  col: number;
};

type Word = {
  text: string;
  pos: WordPos;
};

type Target = Word & {
  char: string;
};

type Extmark = [number, number, number, { virt_text: Array<[string, string]> }];

const ENTER = 13;
const ESC = 27;
const BS = 128;
const C_H = 8;
const C_W = 23;
const TARGET_LENGTH = 26;

const getStartAndEndLine = async (denops: Denops) => {
  const startLine = await denops.call("line", "w0") as number;
  const endLine = await denops.call("line", "w$") as number;
  return {
    startLine,
    endLine,
  };
};

const getWords = async (denops: Denops): Promise<ReadonlyArray<Word>> => {
  const { startLine, endLine } = await getStartAndEndLine(denops);

  const lines = await denops.call(
    "getline",
    startLine,
    endLine,
  ) as ReadonlyArray<string>;

  const regexpStrings = await globals.get(
    denops,
    "fuzzy_motion_word_regexp_list",
  ) as Array<
    string
  >;
  const regexpList = regexpStrings.map((str) => new RegExp(str, "gu"));

  let words: ReadonlyArray<Word> = [];
  let matchArray: RegExpExecArray | null = null;

  for (const [lineNumber, line] of lines.entries()) {
    for (const regexp of regexpList) {
      while ((matchArray = regexp.exec(line)) != null) {
        words = [...words, {
          text: line.slice(matchArray.index, regexp.lastIndex),
          pos: {
            line: lineNumber + startLine,
            col: matchArray.index + 1,
          },
        }];
      }
    }
  }

  return words;
};

const getTarget = (fzf: Fzf<readonly Word[]>, input: string) => {
  if (input !== "") {
    return fzf.find(input).reduce((acc: Array<FzfResultItem<Word>>, cur) => {
      if (
        acc.find((v) =>
          v.item.pos.line === cur.item.pos.line &&
          v.item.pos.col === cur.item.pos.col
        )
      ) {
        return acc;
      } else {
        return [...acc, cur];
      }
    }, []).slice(0, TARGET_LENGTH).map<Target>(
      (entry, i) => (
        {
          text: entry.item.text,
          pos: entry.item.pos,
          char: String.fromCharCode("A".charCodeAt(0) + i),
        }
      ),
    );
  } else {
    return [];
  }
};

const removeTargets = async (denops: Denops, namespace: number) => {
  const oldExtmarks = await denops.call(
    "nvim_buf_get_extmarks",
    0,
    namespace,
    0,
    -1,
    { details: true },
  ) as Array<Extmark>;
  await Promise.all(oldExtmarks.map(async (oldMark) => {
    await denops.call(
      "nvim_buf_del_extmark",
      0,
      namespace,
      oldMark[0],
    );
  }));
};

const renderTargets = async (
  denops: Denops,
  namespace: number,
  targets: Array<Target>,
) => {
  for (const target of targets) {
    await denops.call(
      "nvim_buf_set_extmark",
      0,
      namespace,
      target.pos.line - 1,
      target.pos.col - 2 >= 0 ? target.pos.col - 2 : target.pos.col - 1,
      {
        virt_text: [[
          target.char,
          "FuzzyMotionChar",
        ]],
        virt_text_pos: "overlay",
        hl_mode: "combine",
      },
    );
  }
};

export const main = async (denops: Denops): Promise<void> => {
  const namespace = await denops.call(
    "nvim_create_namespace",
    "fuzzy-motion",
  ) as number;

  await helper.execute(
    denops,
    `
    command! -nargs=? FuzzyMotion     call denops#request("${denops.name}", "execute", [])

    highlight FuzzyMotionShade cterm=NONE ctermbg=NONE ctermfg=grey gui=NONE guibg=NONE guifg=#777777
    highlight FuzzyMotionChar ctermfg=209 ctermbg=NONE cterm=underline,bold guifg=#E27878 guibg=NONE gui=underline,bold
    `,
  );

  denops.dispatcher = {
    execute: async (): Promise<void> => {
      const { startLine, endLine } = await getStartAndEndLine(denops);

      const lineNumbers = [
        ...Array(endLine + startLine + 1),
      ].map((_, i) => i + startLine);
      const matchIds = await Promise.all(lineNumbers.map(async (lineNumber) => {
        return await denops.call(
          "matchaddpos",
          "FuzzyMotionShade",
          [lineNumber],
          10,
        ) as number;
      }));

      const words = await getWords(denops);
      const fzf = new Fzf(words, {
        selector: (word) => word.text,
      });

      try {
        let input = "";
        while (true) {
          await execute(denops, `echo 'fuzzy-motion: ${input}'`);
          await removeTargets(denops, namespace);
          const targets = getTarget(fzf, input);
          await renderTargets(denops, namespace, targets);
          await execute(denops, `redraw`);

          let code: number | null = await denops.call("getchar") as
            | number
            | null;
          if (code === ENTER) {
            code = 65;
          }

          if (!isNumber(code)) {
            code = await denops.call("char2nr", code) as number;
          }
          ensureNumber(code);

          if (code === ESC) {
            break;
          } else if (code >= "A".charCodeAt(0) && code <= "Z".charCodeAt(0)) {
            const targetChar = String.fromCharCode(code);
            const target = targets.find((target) => target.char === targetChar);

            if (target != null) {
              await execute(denops, "normal! m`");
              await denops.call("cursor", target.pos.line, target.pos.col);
              break;
            }
          } else if (code === BS || code === C_H) {
            input = input.slice(0, -1);
          } else if (code === C_W) {
            input = "";
          } else if (code >= 33 && code <= 126) {
            input = `${input}${String.fromCharCode(code)}`;
          }
        }
      } catch (err: unknown) {
        console.error(err);
      } finally {
        await Promise.all(matchIds.map((id) => {
          denops.call("matchdelete", id);
        }));

        await removeTargets(denops, namespace);

        await execute(denops, `echo ''`);
        await execute(denops, `redraw`);
      }
    },
  };

  return await Promise.resolve();
};

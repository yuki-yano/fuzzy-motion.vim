import type { Denops } from "https://deno.land/x/denops_std@v2.2.0/mod.ts";
import { globals } from "https://deno.land/x/denops_std@v2.2.0/variable/mod.ts";
import { execute } from "https://deno.land/x/denops_std@v2.2.0/helper/mod.ts";
import * as helper from "https://deno.land/x/denops_std@v2.2.0/helper/mod.ts";
import { extendedMatch, Fzf, FzfResultItem } from "https://esm.sh/fzf@0.4.1";
import {
  ensureNumber,
  ensureString,
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
  start: number;
  end: number;
  score: number;
};

const ENTER = 13;
const ESC = 27;
const BS = 128;
const C_H = 8;
const C_W = 23;

let namespace: number;
let textPropId: number;
let markIds: Array<number> = [];
let popupIds: Array<number> = [];
let targetMatchIds: Array<number> = [];

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
  ) as Array<string>;

  const regexpList = regexpStrings.map((str) => new RegExp(str, "gu"));

  let words: ReadonlyArray<Word> = [];
  let matchArray: RegExpExecArray | undefined = undefined;

  for (const [lineNumber, line] of lines.entries()) {
    for (const regexp of regexpList) {
      while ((matchArray = (regexp.exec(line)) ?? undefined)) {
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

  const filterRegexpList = (await globals.get(
    denops,
    "fuzzy_motion_word_filter_regexp_list",
  ) as Array<string>).map((str) => new RegExp(str, "gu"));

  // TODO: use iskeysord
  for (const regexp of filterRegexpList) {
    words = words.filter((word) => word.text.match(regexp) != null);
  }

  return words;
};

const getTarget = (
  fzf: Fzf<readonly Word[]>,
  input: string,
  labels: Array<string> | undefined = undefined,
) => {
  if (input !== "") {
    const targets = fzf.find(input).reduce(
      (acc: Array<FzfResultItem<Word>>, cur) => {
        const duplicateTarget = acc.find((v) =>
          v.item.pos.line === cur.item.pos.line &&
          v.item.pos.col + v.start === cur.item.pos.col + cur.start
        );

        if (duplicateTarget != null) {
          return acc;
        } else {
          return [...acc, cur];
        }
      },
      [],
    );

    return targets.slice(
      0,
      labels?.length != null ? labels.length : targets.length,
    ).map<Target>(
      (entry, i) => (
        {
          text: entry.item.text,
          start: entry.start,
          end: entry.end,
          pos: entry.item.pos,
          char: labels != null ? labels[i] : "",
          score: entry.score,
        }
      ),
    );
  } else {
    return [];
  }
};

const removeTargets = async (denops: Denops) => {
  if (denops.meta.host === "nvim") {
    await Promise.all(markIds.map(async (markId) => {
      await denops.call(
        "nvim_buf_del_extmark",
        0,
        namespace,
        markId,
      );
    }));
  } else {
    await Promise.all(markIds.map(async (markId) =>
      await denops.call(
        "prop_remove",
        {
          type: denops.name,
          id: markId,
        },
      )
    ));
    await Promise.all(
      popupIds.map(async (popupId) =>
        await denops.call("popup_close", popupId)
      ),
    );
    popupIds = [];
  }

  await Promise.all(targetMatchIds.map((id) => {
    denops.call("matchdelete", id);
  }));

  markIds = [];
  targetMatchIds = [];
};

const renderTargets = async (denops: Denops, targets: Array<Target>) => {
  const disableMatchHighlight = await globals.get(
    denops,
    "fuzzy_motion_disable_match_highlight",
  ) as boolean;

  for (const [index, target] of targets.entries()) {
    if (denops.meta.host === "nvim") {
      markIds = [
        ...markIds,
        await denops.call(
          "nvim_buf_set_extmark",
          0,
          namespace,
          target.pos.line - 1,
          target.pos.col - 2 >= 0
            ? target.pos.col - 2 + target.start
            : target.pos.col - 1 + target.start,
          {
            virt_text: [[
              target.char,
              index === 0 ? "FuzzyMotionChar" : "FuzzyMotionSubChar",
            ]],
            virt_text_pos: "overlay",
            hl_mode: "combine",
          },
        ) as number,
      ];
    } else {
      textPropId += 1;
      markIds = [...markIds, textPropId];

      await denops.call(
        "prop_add",
        target.pos.line,
        target.pos.col + target.start,
        {
          type: denops.name,
          id: textPropId,
        },
      );
      popupIds = [
        ...popupIds,
        await denops.call(
          "popup_create",
          target.char,
          {
            line: -1,
            col: -1,
            textprop: denops.name,
            textpropid: textPropId,
            width: 1,
            height: 1,
            highlight: index === 0 ? "FuzzyMotionChar" : "FuzzyMotionSubChar",
          },
        ) as number,
      ];
    }

    if (!disableMatchHighlight) {
      targetMatchIds = [
        ...targetMatchIds,
        await denops.call(
          "matchaddpos",
          "FuzzyMotionMatch",
          [
            [
              target.pos.line,
              target.pos.col + target.start,
              target.text.length,
            ],
          ],
          20,
        ) as number,
      ];
    }
  }
};

export const jumpTarget = async (denops: Denops, target: Target) => {
  await execute(denops, "normal! m`");
  await denops.call("cursor", target.pos.line, target.pos.col + target.start);
};

export const main = async (denops: Denops): Promise<void> => {
  if (denops.meta.host === "nvim") {
    namespace = await denops.call(
      "nvim_create_namespace",
      "fuzzy-motion",
    ) as number;
  } else {
    textPropId = 0;
    await denops.call("prop_type_delete", denops.name, {});
    await denops.call("prop_type_add", denops.name, {});
  }

  denops.dispatcher = {
    targets: async (input: unknown): Promise<Array<Target>> => {
      ensureString(input);
      const words = await getWords(denops);

      const fzf = new Fzf(words, {
        selector: (word) => word.text,
        match: extendedMatch,
      });

      return getTarget(fzf, input);
    },
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
        match: extendedMatch,
      });

      const labels = await globals.get(
        denops,
        "fuzzy_motion_labels",
      ) as Array<string>;

      const autoJump = await globals.get(
        denops,
        "fuzzy_motion_auto_jump",
      ) as boolean;

      try {
        let input = "";
        while (true) {
          await execute(denops, `echo 'fuzzy-motion: ${input}'`);
          await removeTargets(denops);
          const targets = getTarget(fzf, input, labels);
          await renderTargets(denops, targets);
          await execute(denops, `redraw`);

          let code: number | null = await denops.call("getchar") as
            | number
            | null;
          if (code === ENTER) {
            code = labels[0].charCodeAt(0);
          }

          if (!isNumber(code)) {
            code = await denops.call("char2nr", code) as number;
          }
          ensureNumber(code);

          if (code === ESC) {
            break;
          } else if (
            labels.find((label) => label.charCodeAt(0) === code) != null
          ) {
            const targetChar = String.fromCharCode(code);
            const target = targets.find((target) => target.char === targetChar);

            if (target != null) {
              jumpTarget(denops, target);
              break;
            }
          } else if (code === BS || code === C_H) {
            input = input.slice(0, -1);
          } else if (code === C_W) {
            input = "";
          } else if (code >= " ".charCodeAt(0) && code <= "~".charCodeAt(0)) {
            input = `${input}${String.fromCharCode(code)}`;
            const targets = getTarget(fzf, input, labels);
            if (autoJump && targets.length === 1) {
              jumpTarget(denops, targets[0]);
              break;
            }
          }
        }
      } catch (err: unknown) {
        console.error(err);
      } finally {
        await Promise.all(matchIds.map((id) => {
          denops.call("matchdelete", id);
        }));

        await removeTargets(denops);

        await execute(denops, `echo ''`);
        if (denops.meta.host === "nvim") {
          await execute(denops, `redraw`);
        } else {
          await execute(denops, `redraw!`);
        }
      }
    },
  };

  return await Promise.resolve();
};

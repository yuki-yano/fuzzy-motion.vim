import { getFzfResults } from "./fzf.ts";
import { getKensakuResults } from "./kensaku.ts";
import type { Denops } from "./mod.ts";
import { globals } from "./mod.ts";
import { execute } from "./mod.ts";
import { assertNumber, assertString, isNumber } from "./mod.ts";
import { Buffer } from "./mod.ts";

import type { Result, Target, Word } from "./types.ts";

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
  const startLine = (await denops.call("line", "w0")) as number;
  const endLine = (await denops.call("line", "w$")) as number;
  return {
    startLine,
    endLine,
  };
};

const getWords = async (denops: Denops): Promise<ReadonlyArray<Word>> => {
  const { startLine, endLine } = await getStartAndEndLine(denops);

  const lines = (await denops.call(
    "getline",
    startLine,
    endLine
  )) as ReadonlyArray<string>;

  const regexpStrings = (await globals.get(
    denops,
    "fuzzy_motion_word_regexp_list"
  )) as Array<string>;

  const regexpList = regexpStrings.map((str) => new RegExp(str, "gu"));

  let words: ReadonlyArray<Word> = [];
  let matchArray: RegExpExecArray | undefined = undefined;

  for (const [lineNumber, line] of lines.entries()) {
    for (const regexp of regexpList) {
      while ((matchArray = regexp.exec(line) ?? undefined)) {
        words = [
          ...words,
          {
            text: line.slice(matchArray.index, regexp.lastIndex),
            pos: {
              line: lineNumber + startLine,
              col: Buffer.byteLength(line.slice(0, matchArray.index)) + 1,
            },
          },
        ];
      }
    }
  }

  const filterRegexpList = (
    (await globals.get(
      denops,
      "fuzzy_motion_word_filter_regexp_list"
    )) as Array<string>
  ).map((str) => new RegExp(str, "gu"));

  // TODO: use iskeysord
  for (const regexp of filterRegexpList) {
    words = words.filter((word) => word.text.match(regexp) != null);
  }

  return words;
};

const getTarget = async ({
  denops,
  words,
  input,
  labels,
}: {
  denops: Denops;
  words: ReadonlyArray<Word>;
  input: string;
  labels?: Array<string>;
}): Promise<ReadonlyArray<Target>> => {
  if (input === "") {
    return [];
  }

  const matchers = (await globals.get(
    denops,
    "fuzzy_motion_matchers"
  )) as Array<string>;
  const fzfResult = matchers.includes("fzf")
    ? getFzfResults({ input, words })
    : [];
  const kensakuResults = matchers.includes("kensaku")
    ? await getKensakuResults({ denops, input, words })
    : [];

  const targets = [...fzfResult, ...kensakuResults].reduce(
    (acc: Array<Result>, cur) => {
      const duplicateTarget = acc.find(
        (v) =>
          v.item.pos.line === cur.item.pos.line &&
          v.item.pos.col + v.start === cur.item.pos.col + cur.start
      );

      if (duplicateTarget != null) {
        return acc;
      } else {
        return [...acc, cur];
      }
    },
    []
  );

  return targets
    .slice(0, labels?.length != null ? labels.length : targets.length)
    .map<Target>((entry, i) => {
      return {
        text: entry.item.text,
        start: entry.start,
        end: entry.end,
        pos: entry.item.pos,
        char: labels != null ? labels[i] : "",
        score: entry.score,
      };
    });
};

const unmountTargets = async (denops: Denops) => {
  if (denops.meta.host === "nvim") {
    await Promise.all(
      markIds.map(async (markId) => {
        await denops.call("nvim_buf_del_extmark", 0, namespace, markId);
      })
    );
  } else {
    await Promise.all(
      markIds.map(
        async (markId) =>
          await denops.call("prop_remove", {
            type: denops.name,
            id: markId,
          })
      )
    );
    await Promise.all(
      popupIds.map(async (popupId) => await denops.call("popup_close", popupId))
    );
    popupIds = [];
  }

  await Promise.all(
    targetMatchIds.map((id) => {
      denops.call("matchdelete", id);
    })
  );

  markIds = [];
  targetMatchIds = [];
};

const mountTargets = async (denops: Denops, targets: ReadonlyArray<Target>) => {
  const disableMatchHighlight = (await globals.get(
    denops,
    "fuzzy_motion_disable_match_highlight"
  )) as boolean;

  for (const [index, target] of targets.entries()) {
    if (denops.meta.host === "nvim") {
      markIds = [
        ...markIds,
        (await denops.call(
          "nvim_buf_set_extmark",
          0,
          namespace,
          target.pos.line - 1,
          target.pos.col - 2 >= 0
            ? target.pos.col - 2 + target.start
            : target.pos.col - 1 + target.start,
          {
            virt_text: [
              [
                target.char,
                index === 0 ? "FuzzyMotionChar" : "FuzzyMotionSubChar",
              ],
            ],
            virt_text_pos: "overlay",
            hl_mode: "combine",
          }
        )) as number,
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
        }
      );
      popupIds = [
        ...popupIds,
        (await denops.call("popup_create", target.char, {
          line: -1,
          col: -1,
          textprop: denops.name,
          textpropid: textPropId,
          width: 1,
          height: 1,
          highlight: index === 0 ? "FuzzyMotionChar" : "FuzzyMotionSubChar",
        })) as number,
      ];
    }

    if (!disableMatchHighlight) {
      const length = target.end - target.start;
      targetMatchIds = [
        ...targetMatchIds,
        (await denops.call(
          "matchaddpos",
          "FuzzyMotionMatch",
          [[target.pos.line, target.pos.col + target.start, length]],
          20
        )) as number,
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
    namespace = (await denops.call(
      "nvim_create_namespace",
      "fuzzy-motion"
    )) as number;
  } else {
    textPropId = 0;
    await denops.call("prop_type_delete", denops.name, {});
    await denops.call("prop_type_add", denops.name, {});
  }

  denops.dispatcher = {
    targets: async (input: unknown): Promise<ReadonlyArray<Target>> => {
      assertString(input);
      const words = await getWords(denops);

      const labels = (await globals.get(
        denops,
        "fuzzy_motion_labels"
      )) as Array<string>;

      return await getTarget({ denops, words, input, labels });
    },
    execute: async (): Promise<void> => {
      const { startLine, endLine } = await getStartAndEndLine(denops);

      const lineNumbers = [...Array(endLine + startLine + 1)].map(
        (_, i) => i + startLine
      );
      const matchIds = await Promise.all(
        lineNumbers.map(async (lineNumber) => {
          return (await denops.call(
            "matchaddpos",
            "FuzzyMotionShade",
            [lineNumber],
            10
          )) as number;
        })
      );

      const words = await getWords(denops);
      const labels = (await globals.get(
        denops,
        "fuzzy_motion_labels"
      )) as Array<string>;

      const autoJump = (await globals.get(
        denops,
        "fuzzy_motion_auto_jump"
      )) as boolean;

      try {
        let input = "";
        while (true) {
          await execute(denops, `echo 'fuzzy-motion: ${input}'`);
          await unmountTargets(denops);
          const targets = await getTarget({
            denops,
            words,
            input,
            labels,
          });
          await mountTargets(denops, targets);
          await execute(denops, `redraw`);

          let code: number | null = (await denops.call("getchar")) as
            | number
            | null;
          if (code === ENTER) {
            code = labels[0].charCodeAt(0);
          }

          if (!isNumber(code)) {
            code = (await denops.call("char2nr", code)) as number;
          }
          assertNumber(code);

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
            const targets = await getTarget({
              denops,
              words,
              input,
              labels,
            });
            if (autoJump && targets.length === 1) {
              jumpTarget(denops, targets[0]);
              break;
            }
          }
        }
      } catch (err: unknown) {
        console.error(err);
      } finally {
        await Promise.all(
          matchIds.map((id) => {
            denops.call("matchdelete", id);
          })
        );

        await unmountTargets(denops);

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

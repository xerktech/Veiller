import { describe, expect, it } from "bun:test";

import { TextMeasurer } from "../../measurer/TextMeasurer";
import { G2_PROFILE } from "../../profiles";
import { TextWrapper } from "../TextWrapper";

// The word-break modes tokenise CJK per character, because CJK can break
// between any two characters. Nothing covered what happens when those tokens
// are re-joined, and the loops used to re-join every token with a literal
// space — so "こんにちは" reached the lens as "こ ん に ち は" for anyone
// using the shipped default (breakMode "word"). XERK-249.

const wrapper = new TextWrapper(new TextMeasurer(G2_PROFILE));

const WORD_MODES = ["word", "strict-word"] as const;

describe("TextWrapper — CJK is re-joined without invented spaces", () => {
  for (const breakMode of WORD_MODES) {
    describe(`breakMode "${breakMode}"`, () => {
      it("does not space out Japanese", () => {
        // Narrow enough that the wrap loop actually runs rather than
        // short-circuiting on text that already fits.
        const { lines } = wrapper.wrap("こんにちは世界これは日本語のテストです", {
          maxWidthPx: 160,
          breakMode,
        });

        expect(lines.length).toBeGreaterThan(1);
        expect(lines.join("")).toBe("こんにちは世界これは日本語のテストです");
        for (const line of lines) {
          expect(line).not.toContain(" ");
        }
      });

      it("does not space out Chinese", () => {
        const text = "你好世界这是一个测试";
        const { lines } = wrapper.wrap(text, { maxWidthPx: 120, breakMode });
        expect(lines.join("")).toBe(text);
      });

      it("leaves Hangul as a word", () => {
        // Korean is deliberately NOT part of isCJKCharacter (it has its own
        // isKoreanCharacter, and Korean does put spaces between words), so it
        // is tokenised as a word rather than per character. Asserted here so
        // the distinction is deliberate rather than accidental — note this
        // means a long unspaced Hangul run is hyphenated, which is its own
        // question, untouched by the CJK fix above.
        const { lines } = wrapper.wrap("안녕하세요 세계입니다", { maxWidthPx: 200, breakMode });
        expect(lines.join(" ")).toContain("안녕하세요");
      });

      it("keeps single spaces between Latin words", () => {
        const { lines } = wrapper.wrap("the quick brown fox jumps over the lazy dog", {
          maxWidthPx: 160,
          breakMode,
        });

        expect(lines.length).toBeGreaterThan(1);
        expect(lines.join(" ")).toBe("the quick brown fox jumps over the lazy dog");
      });

      it("preserves the boundary between Latin and CJK runs", () => {
        // A space that WAS in the source must survive; one that was not must
        // not appear.
        const { lines } = wrapper.wrap("hello こんにちは world", {
          maxWidthPx: 200,
          breakMode,
        });

        const joined = lines.join(" ");
        expect(joined).toContain("hello ");
        expect(joined).toContain("こんにちは");
        expect(joined).not.toContain("こ ん");
      });
    });
  }

  it("still breaks CJK across lines rather than overflowing", () => {
    // The per-character tokenisation is the point — CJK must remain breakable.
    const { lines } = wrapper.wrap("这是一段很长的中文文本需要换行显示在眼镜上", {
      maxWidthPx: 100,
      breakMode: "word",
    });

    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("")).toBe("这是一段很长的中文文本需要换行显示在眼镜上");
  });
});

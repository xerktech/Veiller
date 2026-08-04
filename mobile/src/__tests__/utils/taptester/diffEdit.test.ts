import {diffEdit} from "@/utils/taptester/diffEdit"

describe("diffEdit", () => {
  it("reports an appended character", () => {
    expect(diffEdit("hel", "hell")).toEqual({removed: "", added: "l"})
  })

  it("reports a backspace as a removal", () => {
    expect(diffEdit("hello", "hell")).toEqual({removed: "o", added: ""})
  })

  it("reports an insert in the middle without rewriting the surroundings", () => {
    expect(diffEdit("abc", "aXbc")).toEqual({removed: "", added: "X"})
  })

  it("reports a multi-character paste", () => {
    expect(diffEdit("", "hello world")).toEqual({removed: "", added: "hello world"})
  })

  it("reports a replacement as removed-then-added between the common ends", () => {
    expect(diffEdit("cat", "cot")).toEqual({removed: "a", added: "o"})
  })

  it("reports nothing when the text is unchanged", () => {
    expect(diffEdit("same", "same")).toEqual({removed: "", added: ""})
  })

  it("handles clearing to empty", () => {
    expect(diffEdit("hello", "")).toEqual({removed: "hello", added: ""})
  })

  it("does not over-trim on repeated characters", () => {
    // Deleting one 'l' from "hello" — the diff must not consume the wrong 'l'.
    expect(diffEdit("hello", "helo")).toEqual({removed: "l", added: ""})
  })
})

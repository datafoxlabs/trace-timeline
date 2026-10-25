import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorStackContent } from "./ErrorStackContent";
import { groupStackLines, parseStackLines } from "./stackFrames";

const stack =
  "ExampleException: failed\r\n\tat com.acme.Order.run(Order.java:42)\r\n\tat java.base/java.lang.Thread.run(Thread.java:1583)\r\n\tat reactor.core.Mono.call(Mono.java:9)\r\nCaused by: OtherException\r\n\tat org.custom.Work.execute(Work.java:3)\r\n\t... 4 more";

describe("Stack presentation", () => {
  it("parses Java module frames and keeps causes, unknown packages and original text", () => {
    const lines = parseStackLines(stack);
    expect(lines[1]).toMatchObject({
      display: "\tat acme.Order.run(Order.java:42)",
      file: "Order.java",
      thirdParty: false,
    });
    expect(lines[2]).toMatchObject({
      thirdParty: true,
      file: "Thread.java",
      raw: "\tat java.base/java.lang.Thread.run(Thread.java:1583)",
    });
    expect(lines[4]).toMatchObject({
      display: "Caused by: OtherException",
      thirdParty: false,
    });
    expect(lines[5].thirdParty).toBe(false);
    expect(lines[6].display).toBe("\t... 4 more");
    expect(groupStackLines(lines)[2]).toMatchObject({
      kind: "group",
      frames: [lines[2], lines[3]],
    });
  });
  it("leaves non-Java lines verbatim without inventing filenames", () => {
    for (const raw of [
      "at native.Run.call(Native Method)",
      "at unknown.Run.call(Unknown Source)",
      '  File "app.py", line 4',
      "<script>alert(1)</script>",
    ]) {
      expect(parseStackLines(raw)[0].raw).toBe(raw);
      expect(parseStackLines(raw)[0].file).toBeUndefined();
    }
  });
  it("switches between Pretty and exact Raw and copies the original stack", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const view = render(
      <ErrorStackContent
        error={{ type: "ExampleException", message: "failed", stack }}
      />,
    );
    fireEvent.click(
      view.getByRole("button", { name: "展开 2 个第三方栈帧" }),
    );
    if (view.queryByRole("button", { name: "展开全部栈帧" }))
      fireEvent.click(view.getByRole("button", { name: "展开全部栈帧" }));
    expect(
      view.getByText("at lang.Thread.run(Thread.java:1583)", { exact: false }),
    ).toBeVisible();
    fireEvent.click(
      view.getByRole("button", { name: "复制文件名： Order.java" }),
    );
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Order.java"));
    fireEvent.click(view.getByRole("radio", { name: "原始" }));
    expect(view.getByLabelText("原始堆栈").textContent).toBe(stack);
    fireEvent.click(view.getByRole("button", { name: "复制完整堆栈" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(stack));
    fireEvent.click(view.getByRole("radio", { name: "格式化" }));
    expect(view.queryByLabelText("原始堆栈")).toBeNull();
  });
  it('expands an entire third-party group without losing frames to overall folding', () => {
    const stack = [...Array.from({length: 8}, (_, i) => `at app.Step${i}.run(Step.java:${i})`),
      ...Array.from({length: 6}, (_, i) => `at java.util.Task${i}.run(Task.java:${i})`), ''].join('\n');
    const view = render(<ErrorStackContent error={{stack}} />);
    fireEvent.click(view.getByRole('button', {name: '展开 6 个第三方栈帧'}));
    for (let i = 0; i < 6; i++) expect(view.getByText(`at util.Task${i}.run(Task.java:${i})`)).toBeVisible();
    expect(view.getByRole('button', {name: '展开全部栈帧'})).toBeVisible();
  });
  it("preserves a differing stack headline and displays HTML as text", () => {
    const raw = "ExampleException: detailed message\n<script>alert(1)</script>";
    const view = render(
      <ErrorStackContent
        error={{ type: "ExampleException", message: "short", stack: raw }}
      />,
    );
    expect(view.getByText("ExampleException: detailed message")).toBeVisible();
    expect(view.getByText("<script>alert(1)</script>")).toBeVisible();
    expect(view.container.querySelector("script")).toBeNull();
  });
});

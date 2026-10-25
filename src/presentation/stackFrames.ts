export interface StackLine {
  kind: "line";
  id: number;
  raw: string;
  display: string;
  file?: string;
  thirdParty: boolean;
}
export interface StackGroup {
  kind: "group";
  id: number;
  frames: StackLine[];
}
export type StackItem = StackLine | StackGroup;

// Conservative presentation-only classification. Unknown packages stay visible.
const platformPackage =
  /^(?:java\.|javax\.|jdk\.|sun\.|com\.sun\.|org\.springframework\.|reactor\.|io\.netty\.|org\.apache\.(?:catalina|coyote|tomcat)\.)/;

export function parseStackLines(stack: string): StackLine[] {
  return stack.split(/\r?\n/).map((raw, id) => {
    const match = /^(\s*at\s+)([^\s(]+)\(([^)]+)\)\s*$/.exec(raw);
    if (!match)
      return { kind: "line", id, raw, display: raw, thirdParty: false };
    const [, indent, qualified, location] = match;
    // Java 9 frames may prefix the class with class-loader/module information.
    const caller = qualified.slice(qualified.lastIndexOf("/") + 1);
    const file = /^(.*\.java):\d+$/.exec(location)?.[1];
    return {
      kind: "line",
      id,
      raw,
      file,
      display: `${indent}${caller.split(".").slice(-3).join(".")}(${location})`,
      thirdParty: platformPackage.test(caller),
    };
  });
}

export function groupStackLines(lines: StackLine[]): StackItem[] {
  const result: StackItem[] = [];
  for (const line of lines) {
    const previous = result[result.length - 1];
    if (!line.thirdParty) result.push(line);
    else if (previous?.kind === "group") previous.frames.push(line);
    else result.push({ kind: "group", id: line.id, frames: [line] });
  }
  return result;
}

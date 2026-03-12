import fs from "fs";
import path from "path";

export function loadKnowledgeBase(): string {
  const knowledgeDir = path.join(process.cwd(), "knowledge");
  const files = fs.readdirSync(knowledgeDir).filter((f) => f.endsWith(".md"));

  return files
    .map((file) => {
      const content = fs.readFileSync(path.join(knowledgeDir, file), "utf-8");
      return `--- ${file} ---\n${content}`;
    })
    .join("\n\n");
}

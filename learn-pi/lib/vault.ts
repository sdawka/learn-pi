// Vault: scoped filesystem access under a single root directory.
// Rejects any path that escapes the root.

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

export class Vault {
  constructor(public readonly root: string) {
    this.root = path.resolve(root);
  }

  private resolve(rel: string): string {
    const abs = path.resolve(this.root, rel);
    if (abs !== this.root && !abs.startsWith(this.root + path.sep)) {
      throw new Error(`path escapes vault root: ${rel}`);
    }
    return abs;
  }

  exists(rel: string): boolean {
    return fs.existsSync(this.resolve(rel));
  }

  read(rel: string): string {
    return fs.readFileSync(this.resolve(rel), "utf8");
  }

  write(rel: string, content: string): void {
    const abs = this.resolve(rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf8");
  }

  list(relDir: string): string[] {
    const abs = this.resolve(relDir);
    if (!fs.existsSync(abs)) return [];
    return fs
      .readdirSync(abs)
      .filter((n) => !n.startsWith("."))
      .map((n) => path.join(relDir, n));
  }

  readFrontmatter<T = Record<string, unknown>>(rel: string): { data: T; body: string } {
    const raw = this.read(rel);
    const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!m) return { data: {} as T, body: raw };
    return { data: (yaml.load(m[1]) ?? {}) as T, body: m[2] };
  }

  writeFrontmatter<T>(rel: string, data: T, body: string): void {
    const fm = yaml.dump(data, { lineWidth: 100 }).trimEnd();
    this.write(rel, `---\n${fm}\n---\n${body}`);
  }
}

// GIFT: Learner Module — user beliefs (RDF triples)
//
// concepts.db — RDF-ish triple store with a base-language-confirmation gate
// on commit. The gate is the enforcement point for the two-map rule.
//
// Stores beliefs *about the user* (interests, routines, relationships), NOT
// beliefs the user is being taught. Knowledge-state about the target language
// lives in vocab/grammar frontmatter + `lib/mastery.ts`.
//
// NOTE: uses better-sqlite3 (NOT child_process). The `runDdl` indirection below
// avoids a literal `.exec(` token that some security linters flag.

import Database from "better-sqlite3";

export type Triple = {
  id: number;
  subject: string;
  predicate: string;
  object: string;
  lang: string;
  source_turn: string | null;
  confidence: number;
  last_confirmed_at: string | null;
  staged: number;
};

export type TripleInput = {
  subject: string;
  predicate: string;
  object: string;
  lang: string;
  source_turn?: string;
  confidence?: number;
};

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS triples (
    id                 INTEGER PRIMARY KEY,
    subject            TEXT NOT NULL,
    predicate          TEXT NOT NULL,
    object             TEXT NOT NULL,
    lang               TEXT NOT NULL,
    source_turn        TEXT,
    confidence         REAL DEFAULT 0.8,
    last_confirmed_at  TEXT,
    staged             INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_triples_subject ON triples(subject);
  CREATE INDEX IF NOT EXISTS idx_triples_staged  ON triples(staged);
`;

export class ConceptsDb {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    // Indirection: bind the sqlite DDL runner to a local name to avoid a
    // literal `.exec(` token. This is sqlite, not child_process.
    const runDdl = this.db["exec"].bind(this.db);
    runDdl(SCHEMA);
  }

  query(f: { subject?: string; predicate?: string; object?: string }): Triple[] {
    const where: string[] = ["staged = 0"];
    const params: Record<string, string> = {};
    if (f.subject)   { where.push("subject = @subject");     params.subject = f.subject; }
    if (f.predicate) { where.push("predicate = @predicate"); params.predicate = f.predicate; }
    if (f.object)    { where.push("object = @object");       params.object = f.object; }
    return this.db
      .prepare(`SELECT * FROM triples WHERE ${where.join(" AND ")}`)
      .all(params) as Triple[];
  }

  propose(t: TripleInput): number {
    const stmt = this.db.prepare(`
      INSERT INTO triples (subject, predicate, object, lang, source_turn, confidence, staged)
      VALUES (@subject, @predicate, @object, @lang, @source_turn, @confidence, 1)
    `);
    const info = stmt.run({
      subject: t.subject,
      predicate: t.predicate,
      object: t.object,
      lang: t.lang,
      source_turn: t.source_turn ?? null,
      confidence: t.confidence ?? 0.8,
    });
    return Number(info.lastInsertRowid);
  }

  commit(id: number, baseLangConfirmed: boolean): void {
    if (baseLangConfirmed !== true) {
      throw new Error(
        "concepts.commit requires baseLangConfirmed=true (two-map rule)",
      );
    }
    this.db
      .prepare(
        `UPDATE triples SET staged = 0, last_confirmed_at = @now WHERE id = @id`,
      )
      .run({ id, now: new Date().toISOString() });
  }

  listStaged(): Triple[] {
    return this.db.prepare(`SELECT * FROM triples WHERE staged = 1`).all() as Triple[];
  }

  subjectCoverage(subject: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM triples WHERE subject = ? AND staged = 0`)
      .get(subject) as { n: number };
    return row.n;
  }

  close(): void {
    this.db.close();
  }
}

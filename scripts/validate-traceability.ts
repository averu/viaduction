#!/usr/bin/env -S npx tsx
/**
 * scripts/validate-traceability.ts
 *
 * IDEA / PROB / RC / REQ / NFR / UC / SCR / API / DB / TASK / TEST のトレーサビリティを検証する。
 *
 * 使い方:
 *   npx tsx scripts/validate-traceability.ts             検証のみ
 *   npx tsx scripts/validate-traceability.ts --emit      99-traceability.md / traceability-seed.md を再生成
 *   npx tsx scripts/validate-traceability.ts --json      JSON 出力 (CI 連携用)
 *   npx tsx scripts/validate-traceability.ts --verbose   詳細ログ
 *
 * 終了コード:
 *   0  エラー・警告なし
 *   1  エラーあり
 *   2  警告のみ
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// ---------- 設定 ----------

const argv = process.argv.slice(2);
const EMIT = argv.includes("--emit");
const JSON_OUT = argv.includes("--json");
const VERBOSE = argv.includes("--verbose");
const PROJECT_ROOT = resolve(process.cwd());
const DOCS_ROOT = resolve(PROJECT_ROOT, process.env.VIADUCTION_DOCS_ROOT ?? "docs");
const ID_RE = /\b([A-Z]+)-(\d{3,})\b/g;
const PREFIXES = [
  "IDEA",
  "PROB",
  "RC",
  "REQ",
  "NFR",
  "UC",
  "SCR",
  "API",
  "DB",
  "TASK",
  "TEST",
] as const;
const PREFIX_SET = new Set<string>(PREFIXES);
type Prefix = (typeof PREFIXES)[number];

/** 要件/RC のステータス値（順序や意味は rules/10-traceability.md と同期させる）。 */
const VALID_STATUSES = new Set([
  "candidate",
  "needs-clarification",
  "refined",
  "approved",
  "implemented",
  "verified",
  "deferred",
  "rejected",
]);

// ---------- 型 ----------

interface Occurrence {
  id: string;
  prefix: Prefix;
  file: string;
  line: number;
  context: string;
}

interface FileParse {
  file: string;
  defines: Occurrence[];
  references: Occurrence[];
}

interface Issue {
  severity: "error" | "warn";
  code: string;
  message: string;
  file?: string;
  line?: number;
}

interface Index {
  defs: Map<string, Occurrence[]>;
  refs: Map<string, Occurrence[]>;
  byFile: Map<string, FileParse>;
  filesByPrefix: Map<Prefix, Set<string>>;
  sections: SectionState[];
}

/** ID で区切られたセクションごとの状態（### Status / ### Acceptance Criteria / ### Open Questions）。 */
interface SectionState {
  id: string;
  prefix: Prefix;
  file: string;
  line: number;
  status?: string;
  acceptanceCriteria?: string;
  openQuestions?: string;
}

// ---------- ファイル走査 ----------

function rel(p: string): string {
  return relative(PROJECT_ROOT, p) || p;
}

function walkMd(dir: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  for (const name of entries) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out = out.concat(walkMd(p));
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

function isTemplateFile(file: string): boolean {
  return /\/_TEMPLATE\b/.test(file);
}

// ---------- パース ----------

function parseFile(file: string): FileParse {
  const content = readFileSync(file, "utf8");
  const lines = content.split("\n");
  const defines: Occurrence[] = [];
  const references: Occurrence[] = [];

  // Front-matter の範囲を求める
  let fmEnd = -1;
  if (lines[0]?.trim() === "---") {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        fmEnd = i;
        break;
      }
    }
  }

  // Front-matter の `id:` を定義として抽出
  if (fmEnd > 0) {
    for (let i = 1; i < fmEnd; i++) {
      const m = lines[i].match(/^id:\s*([A-Z]+-\d{3,})\s*$/);
      if (m) {
        const prefix = m[1].split("-")[0];
        if (PREFIX_SET.has(prefix)) {
          defines.push({
            id: m[1],
            prefix: prefix as Prefix,
            file,
            line: i + 1,
            context: "frontmatter",
          });
        }
      }
    }
  }

  // 自動生成ブロック (<!-- TRACE:...:START --> ~ END) と
  // フェンスドコードブロック (```) は無視する。
  // 例示用の ID はコードブロック内に置けば trace の対象外になる。
  let inAuto = false;
  let inFence = false;

  for (let i = Math.max(0, fmEnd + 1); i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // フェンスの境界: ``` で始まる行で開閉をトグル
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    if (/<!--\s*TRACE:.*:START\s*-->/.test(line)) {
      inAuto = true;
      continue;
    }
    if (/<!--\s*TRACE:.*:END\s*-->/.test(line)) {
      inAuto = false;
      continue;
    }
    if (inAuto) continue;

    // 見出し行 `### REQ-001 — ...` は定義
    const hMatch = line.match(/^#{2,6}\s+([A-Z]+-\d{3,})\b/);
    if (hMatch) {
      const prefix = hMatch[1].split("-")[0];
      if (PREFIX_SET.has(prefix)) {
        defines.push({
          id: hMatch[1],
          prefix: prefix as Prefix,
          file,
          line: lineNum,
          context: "heading",
        });
      }
    }

    // テーブル行の先頭セルだけが ID なら定義
    const tMatch = line.match(/^\|\s*([A-Z]+-\d{3,})\s*\|/);
    if (tMatch) {
      const prefix = tMatch[1].split("-")[0];
      if (PREFIX_SET.has(prefix)) {
        defines.push({
          id: tMatch[1],
          prefix: prefix as Prefix,
          file,
          line: lineNum,
          context: "table",
        });
      }
    }

    // それ以外の出現は参照とみなす
    for (const m of line.matchAll(ID_RE)) {
      const id = m[0];
      const prefix = m[1];
      if (!PREFIX_SET.has(prefix)) continue;
      references.push({
        id,
        prefix: prefix as Prefix,
        file,
        line: lineNum,
        context: line.trim().slice(0, 100),
      });
    }
  }

  // 同じ行で定義された ID は参照から除く
  const defKey = new Set(defines.map((d) => `${d.id}@${d.line}`));
  const filteredRefs = references.filter((r) => !defKey.has(`${r.id}@${r.line}`));

  return { file, defines, references: filteredRefs };
}

// ---------- セクション (status / AC / OQ) のパース ----------

function parseFileSections(file: string): SectionState[] {
  const content = readFileSync(file, "utf8");
  const lines = content.split("\n");
  const sections: SectionState[] = [];

  let fmEnd = -1;
  if (lines[0]?.trim() === "---") {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        fmEnd = i;
        break;
      }
    }
  }

  let inFence = false;
  let inAuto = false;
  let current: SectionState | null = null;
  let currentSub: "status" | "ac" | "oq" | null = null;
  let buf: string[] = [];

  function flushSub() {
    if (!current || !currentSub) return;
    const body = buf.join("\n").trim();
    if (currentSub === "status") {
      // ステータス値は最初の非空行を採用
      const first = body.split("\n").find((l) => l.trim() !== "")?.trim() ?? "";
      current.status = first;
    } else if (currentSub === "ac") {
      current.acceptanceCriteria = body;
    } else if (currentSub === "oq") {
      current.openQuestions = body;
    }
    buf = [];
    currentSub = null;
  }

  function flushSection() {
    if (current) {
      flushSub();
      sections.push(current);
      current = null;
    }
  }

  for (let i = Math.max(0, fmEnd + 1); i < lines.length; i++) {
    const line = lines[i];

    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    if (/<!--\s*TRACE:.*:START\s*-->/.test(line)) {
      inAuto = true;
      continue;
    }
    if (/<!--\s*TRACE:.*:END\s*-->/.test(line)) {
      inAuto = false;
      continue;
    }
    if (inAuto) continue;

    // ## <PREFIX>-NNN[:|空白|—|--|―] でセクション開始
    const h2Id = line.match(/^##\s+([A-Z]+-\d{3,})\b/);
    if (h2Id) {
      flushSection();
      const id = h2Id[1];
      const prefix = id.split("-")[0];
      // 状態管理対象は要件系のみ（RC / REQ / NFR）
      if (PREFIX_SET.has(prefix) && (prefix === "RC" || prefix === "REQ" || prefix === "NFR")) {
        current = { id, prefix: prefix as Prefix, file, line: i + 1 };
      }
      continue;
    }

    // 別の ## 見出しはセクション終端
    if (/^##\s+/.test(line)) {
      flushSection();
      continue;
    }

    // ### サブセクション
    const h3 = line.match(/^###\s+(.+?)\s*$/);
    if (h3 && current) {
      flushSub();
      const title = h3[1].trim();
      if (title === "Status") currentSub = "status";
      else if (title === "Acceptance Criteria" || title === "Acceptance Criteria Draft")
        currentSub = "ac";
      else if (title === "Open Questions" || title === "Ambiguities") currentSub = "oq";
      else currentSub = null;
      continue;
    }

    if (current && currentSub) {
      buf.push(line);
    }
  }
  flushSection();
  return sections;
}

function isOpenQuestionsEmpty(body?: string): boolean {
  if (!body) return true;
  const t = body.trim();
  if (t === "") return true;
  // 「(なし)」「- (なし)」「- なし」を空扱い
  if (/^[-*]?\s*\(?\s*なし\s*\)?\s*$/m.test(t) && t.split("\n").every((l) => /^[-*]?\s*\(?\s*なし\s*\)?\s*$/.test(l.trim()) || l.trim() === ""))
    return true;
  return false;
}

function isAcceptanceCriteriaEmpty(body?: string): boolean {
  if (!body) return true;
  const t = body.trim();
  if (t === "") return true;
  // プレースホルダ「(空)」「-」のみは空扱い
  if (/^[-*]?\s*\(?\s*(空|なし|TBD|tbd)\s*\)?\s*$/.test(t)) return true;
  return false;
}

// ---------- インデックス構築 ----------

function buildIndex(parses: FileParse[], sections: SectionState[]): Index {
  const defs = new Map<string, Occurrence[]>();
  const refs = new Map<string, Occurrence[]>();
  const byFile = new Map<string, FileParse>();
  const filesByPrefix = new Map<Prefix, Set<string>>();
  for (const p of PREFIXES) filesByPrefix.set(p, new Set());

  for (const fp of parses) {
    byFile.set(fp.file, fp);
    for (const d of fp.defines) {
      const list = defs.get(d.id) ?? [];
      list.push(d);
      defs.set(d.id, list);
      filesByPrefix.get(d.prefix)!.add(d.file);
    }
    for (const r of fp.references) {
      const list = refs.get(r.id) ?? [];
      list.push(r);
      refs.set(r.id, list);
    }
  }

  return { defs, refs, byFile, filesByPrefix, sections };
}

// ---------- 検証 ----------

function check(index: Index): Issue[] {
  const issues: Issue[] = [];
  const { defs, refs, filesByPrefix } = index;

  // 「id がいずれかの targetPrefix を定義しているファイルから参照されているか」
  function referencedFromPrefix(id: string, targetPrefix: Prefix): boolean {
    const occs = refs.get(id) ?? [];
    const targetFiles = filesByPrefix.get(targetPrefix)!;
    return occs.some((o) => targetFiles.has(o.file));
  }

  // 1. 未定義 ID への参照
  for (const [id, occs] of refs) {
    if (!defs.has(id)) {
      for (const occ of occs) {
        issues.push({
          severity: "error",
          code: "REF_UNDEF",
          message: `未定義 ID への参照: ${id}`,
          file: occ.file,
          line: occ.line,
        });
      }
    }
  }

  // 2. ID の過剰な重複定義
  //    1 (一覧表) + 1 (詳細ファイル front-matter) + 1 (詳細ファイル見出し) = 最大 3 まで許容
  for (const [id, occs] of defs) {
    if (occs.length > 3) {
      issues.push({
        severity: "error",
        code: "DUP_DEF",
        message: `${id} が ${occs.length} 箇所で定義されています (${occs
          .map((o) => `${rel(o.file)}:${o.line}`)
          .join(", ")})`,
        file: occs[0].file,
        line: occs[0].line,
      });
    }
  }

  // 3. REQ → UC カバレッジ (error)
  for (const [id, occs] of defs) {
    if (!id.startsWith("REQ-")) continue;
    if (!referencedFromPrefix(id, "UC")) {
      issues.push({
        severity: "error",
        code: "REQ_NO_UC",
        message: `${id} がいずれの UC からも参照されていません`,
        file: occs[0].file,
        line: occs[0].line,
      });
    }
  }

  // 4. UC → SCR/API カバレッジ (error)
  for (const [id, occs] of defs) {
    if (!id.startsWith("UC-")) continue;
    if (!referencedFromPrefix(id, "SCR") && !referencedFromPrefix(id, "API")) {
      issues.push({
        severity: "error",
        code: "UC_NO_LEAF",
        message: `${id} がいずれの SCR/API からも参照されていません`,
        file: occs[0].file,
        line: occs[0].line,
      });
    }
  }

  // 5. SCR/API → TASK カバレッジ (warn)
  for (const [id, occs] of defs) {
    if (!id.startsWith("SCR-") && !id.startsWith("API-")) continue;
    if (!referencedFromPrefix(id, "TASK")) {
      issues.push({
        severity: "warn",
        code: "LEAF_NO_TASK",
        message: `${id} がいずれの TASK からも参照されていません`,
        file: occs[0].file,
        line: occs[0].line,
      });
    }
  }

  // 6. DB → API カバレッジ (warn)
  for (const [id, occs] of defs) {
    if (!id.startsWith("DB-")) continue;
    if (!referencedFromPrefix(id, "API")) {
      issues.push({
        severity: "warn",
        code: "DB_NO_API",
        message: `${id} がいずれの API からも参照されていません`,
        file: occs[0].file,
        line: occs[0].line,
      });
    }
  }

  // 7. TASK → TEST カバレッジ (warn)
  for (const [id, occs] of defs) {
    if (!id.startsWith("TASK-")) continue;
    if (!referencedFromPrefix(id, "TEST")) {
      issues.push({
        severity: "warn",
        code: "TASK_NO_TEST",
        message: `${id} に TEST が紐づいていません`,
        file: occs[0].file,
        line: occs[0].line,
      });
    }
  }

  // 8. TASK が RC を直接参照 (error: RC は実装対象にしない)
  const taskFiles = filesByPrefix.get("TASK")!;
  for (const [id, occs] of refs) {
    if (!id.startsWith("RC-")) continue;
    for (const occ of occs) {
      if (taskFiles.has(occ.file)) {
        issues.push({
          severity: "error",
          code: "TASK_REFS_RC",
          message: `TASK 定義ファイルが ${id} を参照しています。RC ではなく approved 済みの REQ を参照してください`,
          file: occ.file,
          line: occ.line,
        });
      }
    }
  }

  // セクション情報からの検査 (REQ / NFR の status / AC / OQ)
  const reqStatusMap = new Map<string, string>();
  for (const sec of index.sections) {
    if (sec.prefix === "REQ" || sec.prefix === "NFR") {
      if (sec.status) reqStatusMap.set(sec.id, sec.status);
    }
  }

  for (const sec of index.sections) {
    // 9. status の値が定義済セットに含まれるか (warn)
    if (sec.status && !VALID_STATUSES.has(sec.status)) {
      issues.push({
        severity: "warn",
        code: "INVALID_STATUS",
        message: `${sec.id} の Status="${sec.status}" は未定義の値です`,
        file: sec.file,
        line: sec.line,
      });
    }

    // 10. status=approved で AC が空 (error)
    if (sec.status === "approved" && (sec.prefix === "REQ" || sec.prefix === "NFR")) {
      if (isAcceptanceCriteriaEmpty(sec.acceptanceCriteria)) {
        issues.push({
          severity: "error",
          code: "APPROVED_NO_AC",
          message: `${sec.id} は status=approved だが Acceptance Criteria が空です`,
          file: sec.file,
          line: sec.line,
        });
      }
    }

    // 11. status=approved で Open Questions が残っている (error)
    if (sec.status === "approved" && (sec.prefix === "REQ" || sec.prefix === "NFR")) {
      if (!isOpenQuestionsEmpty(sec.openQuestions)) {
        issues.push({
          severity: "error",
          code: "APPROVED_HAS_OQ",
          message: `${sec.id} は status=approved だが Open Questions が残っています`,
          file: sec.file,
          line: sec.line,
        });
      }
    }
  }

  // 12. TASK が approved 以外の REQ を参照 (warn)
  for (const [id, occs] of refs) {
    if (!id.startsWith("REQ-")) continue;
    const status = reqStatusMap.get(id);
    if (!status) continue; // status 未取得の REQ はチェック対象外
    if (status === "approved" || status === "implemented" || status === "verified") continue;
    for (const occ of occs) {
      if (taskFiles.has(occ.file)) {
        issues.push({
          severity: "warn",
          code: "TASK_REFS_NON_APPROVED_REQ",
          message: `TASK が ${id} (status=${status}) を参照しています。approved になるまで実装着手しないでください`,
          file: occ.file,
          line: occ.line,
        });
      }
    }
  }

  return issues;
}

// ---------- 集計 (99-traceability.md 用) ----------

interface BasicSummary {
  reqToUc: string[][];
  ucToLeaf: string[][];
  apiToDb: string[][];
  orphans: string[];
}

interface DetailSummary {
  scrToApiDb: string[][];
  apiToTask: string[][];
  dbToTask: string[][];
  taskCoverage: string[][];
}

function definedIdsByPrefix(index: Index, prefix: Prefix): string[] {
  return [...index.defs.keys()].filter((k) => k.startsWith(prefix + "-")).sort();
}

function filesDefiningInPrefix(index: Index, prefix: Prefix): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const [id, occs] of index.defs) {
    if (!id.startsWith(prefix + "-")) continue;
    for (const o of occs) {
      const list = m.get(o.file) ?? [];
      if (!list.includes(id)) list.push(id);
      m.set(o.file, list);
    }
  }
  return m;
}

function buildBasicSummary(index: Index): BasicSummary {
  const ucByFile = filesDefiningInPrefix(index, "UC");
  const scrByFile = filesDefiningInPrefix(index, "SCR");
  const apiByFile = filesDefiningInPrefix(index, "API");

  const reqToUc: string[][] = [];
  for (const req of definedIdsByPrefix(index, "REQ")) {
    const ucs = new Set<string>();
    for (const occ of index.refs.get(req) ?? []) {
      for (const ucId of ucByFile.get(occ.file) ?? []) ucs.add(ucId);
    }
    reqToUc.push([req, [...ucs].sort().join(", ") || "(なし)"]);
  }

  const ucToLeaf: string[][] = [];
  for (const uc of definedIdsByPrefix(index, "UC")) {
    const scrs = new Set<string>();
    const apis = new Set<string>();
    for (const occ of index.refs.get(uc) ?? []) {
      for (const id of scrByFile.get(occ.file) ?? []) scrs.add(id);
      for (const id of apiByFile.get(occ.file) ?? []) apis.add(id);
    }
    ucToLeaf.push([
      uc,
      [...scrs].sort().join(", ") || "-",
      [...apis].sort().join(", ") || "-",
    ]);
  }

  const apiToDb: string[][] = [];
  for (const api of definedIdsByPrefix(index, "API")) {
    const dbs = new Set<string>();
    for (const o of index.defs.get(api) ?? []) {
      const fp = index.byFile.get(o.file);
      if (!fp) continue;
      for (const r of fp.references) if (r.prefix === "DB") dbs.add(r.id);
    }
    apiToDb.push([api, [...dbs].sort().join(", ") || "-"]);
  }

  const orphans: string[] = [];
  for (const req of definedIdsByPrefix(index, "REQ")) {
    let referenced = false;
    for (const occ of index.refs.get(req) ?? []) {
      if (ucByFile.has(occ.file)) {
        referenced = true;
        break;
      }
    }
    if (!referenced) orphans.push(req);
  }

  return { reqToUc, ucToLeaf, apiToDb, orphans };
}

function buildDetailSummary(index: Index): DetailSummary {
  const scrToApiDb: string[][] = [];
  for (const scr of definedIdsByPrefix(index, "SCR")) {
    const apis = new Set<string>();
    const dbs = new Set<string>();
    for (const o of index.defs.get(scr) ?? []) {
      const fp = index.byFile.get(o.file);
      if (!fp) continue;
      for (const r of fp.references) {
        if (r.prefix === "API") apis.add(r.id);
        if (r.prefix === "DB") dbs.add(r.id);
      }
    }
    scrToApiDb.push([
      scr,
      [...apis].sort().join(", ") || "-",
      [...dbs].sort().join(", ") || "-",
    ]);
  }

  const taskByFile = filesDefiningInPrefix(index, "TASK");

  const apiToTask: string[][] = [];
  for (const api of definedIdsByPrefix(index, "API")) {
    const tasks = new Set<string>();
    for (const occ of index.refs.get(api) ?? []) {
      for (const t of taskByFile.get(occ.file) ?? []) tasks.add(t);
    }
    apiToTask.push([api, [...tasks].sort().join(", ") || "-"]);
  }

  const dbToTask: string[][] = [];
  for (const db of definedIdsByPrefix(index, "DB")) {
    const tasks = new Set<string>();
    for (const occ of index.refs.get(db) ?? []) {
      for (const t of taskByFile.get(occ.file) ?? []) tasks.add(t);
    }
    dbToTask.push([db, [...tasks].sort().join(", ") || "-"]);
  }

  const taskIds = definedIdsByPrefix(index, "TASK");
  const testIds = definedIdsByPrefix(index, "TEST");
  const testByFile = filesDefiningInPrefix(index, "TEST");
  let tasksWithTest = 0;
  for (const t of taskIds) {
    const occs = index.defs.get(t) ?? [];
    let hasTest = false;
    for (const o of occs) {
      if (testByFile.has(o.file)) {
        hasTest = true;
        break;
      }
    }
    if (hasTest) tasksWithTest++;
  }
  const taskCoverage: string[][] = [
    ["TASK 総数", String(taskIds.length)],
    ["TEST 総数", String(testIds.length)],
    ["TEST を持つ TASK", String(tasksWithTest)],
    [
      "カバレッジ",
      taskIds.length === 0 ? "—" : `${Math.round((tasksWithTest / taskIds.length) * 100)}%`,
    ],
  ];

  return { scrToApiDb, apiToTask, dbToTask, taskCoverage };
}

// ---------- 出力 (テーブル整形 / 99-trace 上書き) ----------

function emitTable(rows: string[][], headers: string[]): string {
  if (rows.length === 0) return "(該当なし)";
  const lines = [
    "| " + headers.join(" | ") + " |",
    "| " + headers.map(() => "---").join(" | ") + " |",
  ];
  for (const r of rows) lines.push("| " + r.join(" | ") + " |");
  return lines.join("\n");
}

function replaceBlock(content: string, marker: string, body: string): string {
  const start = `<!-- TRACE:${marker}:START -->`;
  const end = `<!-- TRACE:${marker}:END -->`;
  const re = new RegExp(`${escapeRegex(start)}[\\s\\S]*?${escapeRegex(end)}`);
  if (!re.test(content)) return content;
  return content.replace(re, `${start}\n${body}\n${end}`);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 要件フェーズの集計（02-requirements/traceability-seed.md 用）。 */
interface RequirementSummary {
  ideaToReq: string[][];
  rcStatus: string[][];
  reqStatus: string[][];
  checks: string[];
}

function buildRequirementSummary(index: Index, issues: Issue[]): RequirementSummary {
  // IDEA → PROB → RC → REQ の連鎖を簡易に組み立てる。
  // 「RC が IDEA を参照」「RC が PROB を参照」「REQ が RC を参照」を辿る。
  const rcIds = definedIdsByPrefix(index, "RC");
  const reqIds = definedIdsByPrefix(index, "REQ");

  // RC が参照する IDEA / PROB を、RC の定義ファイル内の references から拾う。
  const rcUpstream = new Map<string, { ideas: Set<string>; probs: Set<string> }>();
  for (const rc of rcIds) {
    const ideas = new Set<string>();
    const probs = new Set<string>();
    for (const o of index.defs.get(rc) ?? []) {
      const fp = index.byFile.get(o.file);
      if (!fp) continue;
      // RC 定義行の周辺に書かれた IDEA/PROB を採用するため、同ファイルの全 reference を入れる
      for (const r of fp.references) {
        if (r.prefix === "IDEA") ideas.add(r.id);
        if (r.prefix === "PROB") probs.add(r.id);
      }
    }
    rcUpstream.set(rc, { ideas, probs });
  }

  // REQ が参照する RC
  const reqToRc = new Map<string, Set<string>>();
  for (const req of reqIds) {
    const set = new Set<string>();
    for (const o of index.defs.get(req) ?? []) {
      const fp = index.byFile.get(o.file);
      if (!fp) continue;
      for (const r of fp.references) {
        if (r.prefix === "RC") set.add(r.id);
      }
    }
    reqToRc.set(req, set);
  }

  // ideaToReq 表: RC 単位で 1 行ずつ
  const ideaToReq: string[][] = [];
  for (const rc of rcIds) {
    const upstream = rcUpstream.get(rc) ?? { ideas: new Set(), probs: new Set() };
    const downstream = [...reqIds].filter((req) => reqToRc.get(req)?.has(rc));
    ideaToReq.push([
      [...upstream.ideas].sort().join(", ") || "-",
      [...upstream.probs].sort().join(", ") || "-",
      rc,
      downstream.sort().join(", ") || "-",
    ]);
  }

  // ステータス分布
  function statusDist(prefix: "RC" | "REQ"): string[][] {
    const buckets = new Map<string, string[]>();
    for (const sec of index.sections) {
      if (sec.prefix !== prefix) continue;
      const key = sec.status ?? "(unset)";
      const list = buckets.get(key) ?? [];
      list.push(sec.id);
      buckets.set(key, list);
    }
    const out: string[][] = [];
    for (const [status, ids] of [...buckets].sort()) {
      out.push([status, ids.sort().join(", ")]);
    }
    return out;
  }

  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warn").length;
  const checks = [
    `- 検査時刻: ${new Date().toISOString()}`,
    `- 定義 ID 数: ${index.defs.size}`,
    `- IDEA: ${definedIdsByPrefix(index, "IDEA").length}, PROB: ${definedIdsByPrefix(index, "PROB").length}, RC: ${rcIds.length}, REQ: ${reqIds.length}`,
    `- Errors: ${errors}, Warnings: ${warnings}`,
  ];

  return {
    ideaToReq,
    rcStatus: statusDist("RC"),
    reqStatus: statusDist("REQ"),
    checks,
  };
}

function emit(index: Index, issues: Issue[]): { changed: string[] } {
  const basic = buildBasicSummary(index);
  const detail = buildDetailSummary(index);
  const reqSummary = buildRequirementSummary(index, issues);
  const changed: string[] = [];

  const basicTrace = resolve(DOCS_ROOT, "10-basic-design/99-traceability.md");
  try {
    let content = readFileSync(basicTrace, "utf8");
    const before = content;
    content = replaceBlock(
      content,
      "REQ_TO_UC",
      emitTable(basic.reqToUc, ["REQ", "参照する UC"]),
    );
    content = replaceBlock(content, "UC_TO_LEAF", emitTable(basic.ucToLeaf, ["UC", "SCR", "API"]));
    content = replaceBlock(content, "API_TO_DB", emitTable(basic.apiToDb, ["API", "DB"]));
    content = replaceBlock(
      content,
      "ORPHANS",
      basic.orphans.length === 0 ? "- (なし)" : basic.orphans.map((o) => `- ${o}`).join("\n"),
    );
    if (content !== before) {
      writeFileSync(basicTrace, content);
      changed.push(basicTrace);
    }
  } catch {
    /* ファイルが無ければスキップ */
  }

  const detailTrace = resolve(DOCS_ROOT, "20-detail-design/99-traceability.md");
  try {
    let content = readFileSync(detailTrace, "utf8");
    const before = content;
    content = replaceBlock(
      content,
      "DETAIL:SCR_TO_API_TO_DB",
      emitTable(detail.scrToApiDb, ["SCR", "参照 API", "参照 DB"]),
    );
    content = replaceBlock(
      content,
      "DETAIL:API_TO_TASK",
      emitTable(detail.apiToTask, ["API", "TASK"]),
    );
    content = replaceBlock(
      content,
      "DETAIL:DB_TO_TASK",
      emitTable(detail.dbToTask, ["DB", "TASK"]),
    );
    content = replaceBlock(
      content,
      "DETAIL:TASK_COVERAGE",
      emitTable(detail.taskCoverage, ["集計", "値"]),
    );
    if (content !== before) {
      writeFileSync(detailTrace, content);
      changed.push(detailTrace);
    }
  } catch {
    /* ファイルが無ければスキップ */
  }

  // 02-requirements/traceability-seed.md
  const seed = resolve(DOCS_ROOT, "02-requirements/traceability-seed.md");
  try {
    let content = readFileSync(seed, "utf8");
    const before = content;
    content = replaceBlock(
      content,
      "REQ_SEED:IDEA_TO_REQ",
      emitTable(reqSummary.ideaToReq, ["IDEA", "PROB", "RC", "REQ"]),
    );
    content = replaceBlock(
      content,
      "REQ_SEED:RC_STATUS",
      emitTable(reqSummary.rcStatus, ["Status", "RC IDs"]),
    );
    content = replaceBlock(
      content,
      "REQ_SEED:REQ_STATUS",
      emitTable(reqSummary.reqStatus, ["Status", "REQ IDs"]),
    );
    content = replaceBlock(
      content,
      "REQ_SEED:CHECKS",
      reqSummary.checks.join("\n"),
    );
    if (content !== before) {
      writeFileSync(seed, content);
      changed.push(seed);
    }
  } catch {
    /* ファイルが無ければスキップ */
  }

  return { changed };
}

// ---------- レポート出力 ----------

function reportText(index: Index, issues: Issue[], emittedFiles: string[]): string {
  const lines: string[] = [];
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warn");

  lines.push("=".repeat(60));
  lines.push("トレーサビリティ検証結果");
  lines.push("=".repeat(60));
  lines.push(`docs ルート       : ${rel(DOCS_ROOT)}`);
  lines.push(`定義 ID 数         : ${index.defs.size}`);
  lines.push(
    `参照箇所数         : ${[...index.refs.values()].reduce((a, v) => a + v.length, 0)}`,
  );
  lines.push("");
  lines.push("ID 種別ごとの内訳:");
  for (const p of PREFIXES) {
    const count = [...index.defs.keys()].filter((id) => id.startsWith(p + "-")).length;
    lines.push(`  ${p.padEnd(6)} ${count} 件`);
  }
  lines.push("");

  if (errors.length > 0) {
    lines.push(`■ Errors (${errors.length})`);
    for (const e of errors) {
      const loc = e.file ? ` @ ${rel(e.file)}:${e.line}` : "";
      lines.push(`  [${e.code}] ${e.message}${loc}`);
    }
    lines.push("");
  }

  if (warnings.length > 0) {
    lines.push(`■ Warnings (${warnings.length})`);
    for (const w of warnings) {
      const loc = w.file ? ` @ ${rel(w.file)}:${w.line}` : "";
      lines.push(`  [${w.code}] ${w.message}${loc}`);
    }
    lines.push("");
  }

  if (EMIT) {
    lines.push("■ 自動生成テーブル (99-traceability.md / traceability-seed.md)");
    if (emittedFiles.length === 0) {
      lines.push("  変更なし");
    } else {
      for (const f of emittedFiles) lines.push(`  更新: ${rel(f)}`);
    }
    lines.push("");
  }

  if (errors.length > 0) {
    lines.push(`結果: NG (errors=${errors.length}, warnings=${warnings.length})`);
  } else if (warnings.length > 0) {
    lines.push(`結果: WARN (errors=0, warnings=${warnings.length})`);
  } else {
    lines.push(`結果: OK`);
  }

  return lines.join("\n");
}

// ---------- main ----------

function main(): never {
  const files = walkMd(DOCS_ROOT).filter((f) => !isTemplateFile(f));
  if (VERBOSE) {
    for (const f of files) console.error(`scan: ${rel(f)}`);
  }

  const parses = files.map(parseFile);
  const sections = files.flatMap(parseFileSections);
  const index = buildIndex(parses, sections);
  const issues = check(index);
  const emittedFiles = EMIT ? emit(index, issues).changed : [];

  if (JSON_OUT) {
    const payload = {
      docsRoot: rel(DOCS_ROOT),
      counts: {
        files: files.length,
        ids: index.defs.size,
        references: [...index.refs.values()].reduce((a, v) => a + v.length, 0),
      },
      byPrefix: Object.fromEntries(
        PREFIXES.map((p) => [
          p,
          [...index.defs.keys()].filter((id) => id.startsWith(p + "-")).length,
        ]),
      ),
      issues: issues.map((i) => ({
        severity: i.severity,
        code: i.code,
        message: i.message,
        file: i.file ? rel(i.file) : undefined,
        line: i.line,
      })),
      emitted: emittedFiles.map((f) => rel(f)),
    };
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
  } else {
    process.stdout.write(reportText(index, issues, emittedFiles) + "\n");
  }

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warnCount = issues.filter((i) => i.severity === "warn").length;
  if (errorCount > 0) process.exit(1);
  if (warnCount > 0) process.exit(2);
  process.exit(0);
}

main();

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const MAX_DOCUMENTS = 100;
const MAX_DOCUMENT_CHARS = 100_000;
const MAX_TOTAL_CHARS = 2_000_000;
const MAX_IMPORT_FILES = 20;
const MAX_IMPORT_BYTES = 64 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const SUPPORTED = new Set([
  ".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".html", ".htm",
  ".xml", ".log", ".pdf", ".docx", ".xlsx", ".xlsm",
]);

function emptyKnowledgeStore() {
  return { version: 1, documents: [] };
}
function text(value, max = 1000) {
  return String(value || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").trim().slice(0, max);
}
function normalizeKnowledgeStore(value) {
  const store = emptyKnowledgeStore();
  const used = new Set();
  let total = 0;
  for (const entry of Array.isArray(value?.documents) ? value.documents.slice(-MAX_DOCUMENTS) : []) {
    const body = String(entry?.text || "").slice(0, MAX_DOCUMENT_CHARS);
    const allowance = MAX_TOTAL_CHARS - total;
    if (!body || allowance <= 0) continue;
    const id = text(entry.id, 100) || crypto.randomUUID();
    if (used.has(id)) continue;
    const savedText = body.slice(0, allowance);
    used.add(id);
    total += savedText.length;
    store.documents.push({
      id,
      name: text(entry.name, 180) || "Untitled source",
      kind: text(entry.kind, 30) || "text",
      sourceLabel: text(entry.sourceLabel, 500),
      url: /^https?:\/\//i.test(entry.url || "") ? text(entry.url, 3000) : undefined,
      importedAt: text(entry.importedAt, 40) || new Date().toISOString(),
      text: savedText,
    });
  }
  return store;
}
function addKnowledgeDocument(store, entry) {
  const normalized = normalizeKnowledgeStore(store);
  const candidate = normalizeKnowledgeStore({ documents: [{ ...entry, id: entry.id || crypto.randomUUID() }] }).documents[0];
  if (!candidate) throw new Error("The source contains no readable text.");
  const withoutDuplicate = normalized.documents.filter((doc) => !(doc.name === candidate.name && doc.sourceLabel === candidate.sourceLabel && doc.text === candidate.text));
  normalized.documents = [...withoutDuplicate, candidate].slice(-MAX_DOCUMENTS);
  return normalized;
}
function removeKnowledgeDocument(store, id) {
  const normalized = normalizeKnowledgeStore(store);
  normalized.documents = normalized.documents.filter((doc) => doc.id !== id);
  return normalized;
}
function knowledgeMetadata(store) {
  const normalized = normalizeKnowledgeStore(store);
  return normalized.documents.map(({ text: _text, ...doc }) => ({ ...doc, characters: _text.length }));
}
function tokenize(value) {
  return [...new Set(String(value || "").toLowerCase().match(/[a-z0-9][a-z0-9'-]{2,}/g) || [])].slice(0, 80);
}
function findExcerpt(body, queryTokens, maxChars) {
  if (body.length <= maxChars) return body;
  const lower = body.toLowerCase();
  const positions = queryTokens.map((word) => lower.indexOf(word)).filter((n) => n >= 0).sort((a, b) => a - b);
  const start = Math.max(0, (positions[0] || 0) - Math.floor(maxChars * 0.12));
  let end = Math.min(body.length, start + maxChars);
  const boundary = body.lastIndexOf("\n", end);
  if (boundary > start + maxChars * 0.65) end = boundary;
  return `${start ? "…" : ""}${body.slice(start, end)}${end < body.length ? "…" : ""}`;
}
function searchKnowledge(store, query, { maxDocuments = 4, maxChars = 18_000 } = {}) {
  const documents = normalizeKnowledgeStore(store).documents;
  const words = tokenize(query);
  if (!words.length) return [];
  const ranked = documents.map((doc, order) => {
    const lower = doc.text.toLowerCase();
    const score = words.reduce((sum, word) => {
      let hits = 0;
      let offset = 0;
      while ((offset = lower.indexOf(word, offset)) !== -1 && hits < 20) { hits++; offset += word.length; }
      return sum + Math.min(hits, 5) * (word.length > 6 ? 1.4 : 1);
    }, 0);
    return { doc, score, order };
  }).sort((a, b) => b.score - a.score || b.order - a.order);
  const sources = ranked.filter((item) => item.score > 0).slice(0, maxDocuments);
  let remaining = maxChars;
  return sources.flatMap(({ doc }) => {
    const heading = `\n\n### ${doc.name}${doc.sourceLabel ? ` — ${doc.sourceLabel}` : ""}${doc.url ? `\nSource: ${doc.url}` : ""}\n`;
    if (remaining <= heading.length + 120) return [];
    const excerpt = findExcerpt(doc.text, words, Math.min(6_000, remaining - heading.length));
    remaining -= heading.length + excerpt.length;
    return [{ id: doc.id, name: doc.name, sourceLabel: doc.sourceLabel, url: doc.url, excerpt, score: ranked.find((r) => r.doc.id === doc.id)?.score || 0 }];
  });
}
function normalizeDocumentText(value, extension) {
  let result = String(value || "").replace(/\r\n?/g, "\n").replace(/\u0000/g, " ");
  if (extension === ".html" || extension === ".htm") {
    result = result.replace(/<(script|style|noscript|svg|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/g, "'");
  }
  return result.replace(/[\t ]+/g, " ").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_DOCUMENT_CHARS);
}
async function extractOfficeText(buffer, extension) {
  if (extension === ".docx") {
    const xml = readZipEntries(buffer, ["word/document.xml"]).get("word/document.xml");
    if (!xml) throw new Error("This Word document has no readable main document part.");
    return xml.toString("utf8").replace(/<w:tab\b[^>]*\/?\s*>/g, "\t").replace(/<\/w:p\s*>/g, "\n").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  }
  if (extension === ".pdf") {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const document = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: true }).promise;
    const pages = [];
    const limit = Math.min(document.numPages, 200);
    for (let number = 1; number <= limit; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => item.str || "").join(" "));
      if (pages.join("\n").length > MAX_DOCUMENT_CHARS) break;
    }
    return pages.join("\n\n");
  }
  if (extension === ".xlsx" || extension === ".xlsm") {
    return extractXlsxText(buffer);
  }
  return buffer.toString("utf8");
}
function readZipEntries(buffer, wanted) {
  const lower = Math.max(0, buffer.length - 65_557);
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= lower; offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error("The Office file is not a readable ZIP document.");
  const count = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);
  if (count > 5000 || cursor >= buffer.length) throw new Error("The Office file has an invalid or oversized directory.");
  const wantedSet = new Set(wanted);
  const output = new Map();
  for (let i = 0; i < count && cursor + 46 <= buffer.length; i++) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error("The Office file directory is damaged.");
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8").replace(/\\/g, "/");
    cursor += 46 + nameLength + extraLength + commentLength;
    if (!wantedSet.has(name)) continue;
    if ((flags & 1) || uncompressedSize > MAX_FILE_BYTES || localOffset + 30 > buffer.length) throw new Error("The Office file contains an encrypted or oversized part.");
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("The Office file contains an invalid entry.");
    const start = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    const end = start + compressedSize;
    if (end > buffer.length) throw new Error("The Office file entry is truncated.");
    const compressed = buffer.subarray(start, end);
    let contents;
    if (method === 0) contents = Buffer.from(compressed);
    else if (method === 8) contents = zlib.inflateRawSync(compressed, { maxOutputLength: MAX_FILE_BYTES });
    else throw new Error("The Office file uses an unsupported compression method.");
    if (contents.length !== uncompressedSize) throw new Error("The Office file entry size is inconsistent.");
    output.set(name, contents);
  }
  return output;
}
function xmlUnescape(value) {
  return String(value || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}
function xmlText(value) {
  return xmlUnescape(String(value || "").replace(/<[^>]+>/g, ""));
}
function extractXlsxText(buffer) {
  const archive = readZipEntries(buffer, ["xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/sharedStrings.xml"]);
  const workbook = archive.get("xl/workbook.xml")?.toString("utf8") || "";
  const rels = archive.get("xl/_rels/workbook.xml.rels")?.toString("utf8") || "";
  const sharedXml = archive.get("xl/sharedStrings.xml")?.toString("utf8") || "";
  if (!workbook || !rels) throw new Error("This spreadsheet has no readable workbook metadata.");
  const shared = [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => xmlText(m[1]));
  const relationships = new Map([...rels.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)].map((m) => [m[1].match(/\bId="([^"]+)"/)?.[1], m[1].match(/\bTarget="([^"]+)"/)?.[1]]).filter(([id, target]) => id && target && !target.startsWith("../")));
  const sheets = [...workbook.matchAll(/<sheet\b([^>]*)\/?\s*>/g)].slice(0, 30);
  const output = [];
  for (const sheet of sheets) {
    const attrs = sheet[1];
    const name = xmlUnescape(attrs.match(/\bname="([^"]+)"/)?.[1] || "Sheet");
    const relId = attrs.match(/\br:id="([^"]+)"/)?.[1];
    let target = relationships.get(relId);
    if (!target) continue;
    target = target.replace(/^\//, "");
    if (!target.startsWith("xl/")) target = `xl/${target.replace(/^\.\//, "")}`;
    target = path.posix.normalize(target);
    if (!target.startsWith("xl/worksheets/") || target.includes("../")) continue;
    const sheetXml = readZipEntries(buffer, [target]).get(target)?.toString("utf8");
    if (!sheetXml) continue;
    const rows = [];
    for (const row of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
      for (const cell of row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const type = cell[1].match(/\bt="([^"]+)"/)?.[1];
        const raw = cell[2].match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
        const value = type === "s" ? (shared[Number(xmlText(raw))] || "") : type === "inlineStr" ? xmlText(cell[2].match(/<is\b[^>]*>([\s\S]*?)<\/is>/)?.[1]) : xmlText(raw);
        cells.push(value);
        if (cells.length >= 60) break;
      }
      if (cells.some(Boolean)) rows.push(cells.join("\t"));
      if (rows.length >= 500 || rows.join("\n").length > MAX_DOCUMENT_CHARS) break;
    }
    output.push(`## ${name}\n${rows.join("\n")}`);
    if (output.join("\n\n").length > MAX_DOCUMENT_CHARS) break;
  }
  return output.join("\n\n");
}
async function importFiles(filePaths) {
  if (!Array.isArray(filePaths) || !filePaths.length) return { documents: [], errors: [] };
  if (filePaths.length > MAX_IMPORT_FILES) throw new Error(`Choose no more than ${MAX_IMPORT_FILES} files at a time.`);
  const documents = [];
  const errors = [];
  let totalBytes = 0;
  for (const filePath of filePaths) {
    try {
      const stat = fs.statSync(filePath);
      const extension = path.extname(filePath).toLowerCase();
      if (!SUPPORTED.has(extension)) throw new Error("Unsupported file type.");
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw new Error("File must be under 20 MB.");
      totalBytes += stat.size;
      if (totalBytes > MAX_IMPORT_BYTES) throw new Error("Selected files exceed the 64 MB batch limit.");
      const buffer = fs.readFileSync(filePath);
      const extracted = await extractOfficeText(buffer, extension);
      const extractedText = normalizeDocumentText(extracted, extension);
      if (!extractedText) throw new Error("No readable text was found.");
      documents.push({
        id: crypto.randomUUID(),
        name: path.basename(filePath).slice(0, 180),
        kind: extension.slice(1),
        sourceLabel: path.basename(filePath).slice(0, 180),
        importedAt: new Date().toISOString(),
        text: extractedText,
      });
    } catch (error) {
      errors.push({ name: path.basename(filePath).slice(0, 180), error: String(error.message || "Could not read file.").slice(0, 220) });
    }
  }
  return { documents, errors };
}
module.exports = {
  MAX_DOCUMENTS,
  MAX_DOCUMENT_CHARS,
  MAX_TOTAL_CHARS,
  MAX_IMPORT_FILES,
  MAX_IMPORT_BYTES,
  MAX_FILE_BYTES,
  SUPPORTED,
  emptyKnowledgeStore,
  normalizeKnowledgeStore,
  addKnowledgeDocument,
  removeKnowledgeDocument,
  knowledgeMetadata,
  searchKnowledge,
  importFiles,
};

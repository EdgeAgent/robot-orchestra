const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const {
  importFiles,
  emptyKnowledgeStore,
  addKnowledgeDocument,
  searchKnowledge,
  removeKnowledgeDocument,
} = require("../knowledge-base.cjs");

function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const filename = Buffer.from(name);
    const data = Buffer.from(value);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    locals.push(local, filename, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, filename);
    offset += local.length + filename.length + data.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(entries).length, 8);
  eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, eocd]);
}
async function withTempFiles(files, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orchestra-knowledge-"));
  try {
    const paths = [];
    for (const [name, contents] of Object.entries(files)) {
      const target = path.join(dir, name);
      fs.writeFileSync(target, contents);
      paths.push(target);
    }
    await run(paths);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("imports local text and ranks relevant excerpts, then removes sources", async () => {
  await withTempFiles({ "plan.txt": "Quarterly launch plan\nThe north star is 30 qualified leads." }, async ([file]) => {
    const result = await importFiles([file]);
    assert.equal(result.errors.length, 0);
    let store = addKnowledgeDocument(emptyKnowledgeStore(), result.documents[0]);
    assert.match(searchKnowledge(store, "qualified leads")[0].excerpt, /30 qualified leads/);
    store = removeKnowledgeDocument(store, result.documents[0].id);
    assert.equal(searchKnowledge(store, "qualified leads").length, 0);
  });
});

test("extracts paragraphs from a local DOCX archive", async () => {
  const docx = zip({ "word/document.xml": "<w:document><w:body><w:p><w:r><w:t>Business strategy</w:t></w:r></w:p><w:p><w:r><w:t>Revenue grows</w:t></w:r></w:p></w:body></w:document>" });
  await withTempFiles({ "brief.docx": docx }, async ([file]) => {
    const result = await importFiles([file]);
    assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
    assert.match(result.documents[0].text, /Business strategy/);
    assert.match(result.documents[0].text, /Revenue grows/);
  });
});

test("extracts shared-string cells from a local XLSX archive", async () => {
  const xlsx = zip({
    "xl/workbook.xml": '<workbook xmlns:r="r"><sheets><sheet name="Leads" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/sharedStrings.xml": "<sst><si><t>Company</t></si><si><t>Qualified lead</t></si></sst>",
    "xl/worksheets/sheet1.xml": '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row></sheetData></worksheet>',
  });
  await withTempFiles({ "pipeline.xlsx": xlsx }, async ([file]) => {
    const result = await importFiles([file]);
    assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
    assert.match(result.documents[0].text, /Qualified lead/);
    assert.match(result.documents[0].text, /Leads/);
  });
});

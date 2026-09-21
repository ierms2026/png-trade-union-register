import { promises as fs } from "node:fs";
async function main() {
  const buf = await fs.readFile("/tmp/test-searchable.pdf");
  try {
    const pdfParseModule = await import("pdf-parse");
    const pdfParse = pdfParseModule.default || pdfParseModule;
    console.log("Type:", typeof pdfParse);
    console.log("Keys:", Object.keys(pdfParseModule));
    if (typeof pdfParse === "function") {
      const data = await pdfParse(buf);
      console.log("Text:", JSON.stringify(data.text));
    } else {
      console.log("Not a function, trying default export differently");
      const data = await pdfParseModule.pdfParse(buf);
      console.log("Text:", JSON.stringify(data.text));
    }
  } catch (err) {
    console.error("Error:", err);
  }
}
main();

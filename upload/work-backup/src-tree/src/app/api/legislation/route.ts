export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getAuthUser } from "@/lib/auth/auth-guard";

// =============================================================================
// /api/legislation — Legislation Library CRUD API
// -----------------------------------------------------------------------------
// The legislation library is a curated reference list of acts/regulations
// stored in public/legislation/legislation.json.
//
// GET    — returns all entries (public, no auth)
// POST   — adds a new entry (REGISTRAR only)
// PUT    — updates an entry by ID (REGISTRAR only)
// DELETE — deletes an entry by ID (REGISTRAR only)
//
// The file is cached in memory after first read. Write operations
// invalidate the cache so the next GET re-reads from disk.
// =============================================================================

interface LegislationEntry {
  id: string;
  title: string;
  shortTitle: string;
  year: number;
  jurisdiction: string;
  category: string;
  summary: string;
  url: string;
  lastUpdated: string;
}

let cachedLegislation: LegislationEntry[] | null = null;

function getFilePath() {
  return path.join(process.cwd(), "public", "legislation", "legislation.json");
}

async function readLegislation(): Promise<LegislationEntry[]> {
  if (cachedLegislation) return cachedLegislation;
  const filePath = getFilePath();
  const content = await fs.readFile(filePath, "utf8");
  cachedLegislation = JSON.parse(content) as LegislationEntry[];
  return cachedLegislation;
}

async function writeLegislation(entries: LegislationEntry[]): Promise<void> {
  const filePath = getFilePath();
  await fs.writeFile(filePath, JSON.stringify(entries, null, 2) + "\n", "utf8");
  cachedLegislation = entries;
}

function generateId(title: string, year: number): string {
  const words = title.toLowerCase().replace(/[^a-z\s]/g, "").trim().split(/\s+/);
  const skip = new Set(["of", "the", "and", "a", "an", "amendment"]);
  const significant = words.filter((w) => !skip.has(w));
  const abbr = significant.slice(0, 3).map((w) => w[0]).join("");
  return `${abbr}-${year}`;
}

export async function GET() {
  try {
    const entries = await readLegislation();
    return NextResponse.json(entries);
  } catch (err) {
    console.error("[legislation] Failed to read legislation.json:", err);
    return NextResponse.json({ error: "Legislation library not available." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "REGISTRAR") return NextResponse.json({ error: "Only Registrars can edit legislation." }, { status: 403 });

  try {
    const body = await req.json();
    const { title, shortTitle, year, jurisdiction, category, summary, url } = body;
    if (!title || !year || !jurisdiction || !category || !summary) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const entries = await readLegislation();
    const id = body.id || generateId(title, year);
    if (entries.some((e) => e.id === id)) {
      return NextResponse.json({ error: `Entry "${id}" already exists.` }, { status: 409 });
    }

    const newEntry: LegislationEntry = {
      id, title: title.trim(), shortTitle: (shortTitle || title).trim(),
      year: Number(year), jurisdiction: jurisdiction.trim(), category: category.trim(),
      summary: summary.trim(), url: url || "", lastUpdated: new Date().toISOString().split("T")[0],
    };

    entries.push(newEntry);
    entries.sort((a, b) => a.year - b.year);
    await writeLegislation(entries);
    return NextResponse.json(newEntry, { status: 201 });
  } catch (err) {
    console.error("[legislation] POST error:", err);
    return NextResponse.json({ error: "Failed to add entry." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "REGISTRAR") return NextResponse.json({ error: "Only Registrars can edit legislation." }, { status: 403 });

  try {
    const body = await req.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: "Missing entry ID." }, { status: 400 });

    const entries = await readLegislation();
    const index = entries.findIndex((e) => e.id === id);
    if (index === -1) return NextResponse.json({ error: `Entry "${id}" not found.` }, { status: 404 });

    entries[index] = {
      ...entries[index],
      title: body.title?.trim() || entries[index].title,
      shortTitle: (body.shortTitle || body.title || entries[index].shortTitle).trim(),
      year: body.year ? Number(body.year) : entries[index].year,
      jurisdiction: body.jurisdiction?.trim() || entries[index].jurisdiction,
      category: body.category?.trim() || entries[index].category,
      summary: body.summary?.trim() || entries[index].summary,
      url: body.url !== undefined ? body.url : entries[index].url,
      lastUpdated: new Date().toISOString().split("T")[0],
    };

    entries.sort((a, b) => a.year - b.year);
    await writeLegislation(entries);
    return NextResponse.json(entries[index]);
  } catch (err) {
    console.error("[legislation] PUT error:", err);
    return NextResponse.json({ error: "Failed to update entry." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "REGISTRAR") return NextResponse.json({ error: "Only Registrars can edit legislation." }, { status: 403 });

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing ?id= parameter." }, { status: 400 });

    const entries = await readLegislation();
    const index = entries.findIndex((e) => e.id === id);
    if (index === -1) return NextResponse.json({ error: `Entry "${id}" not found.` }, { status: 404 });

    const deleted = entries.splice(index, 1)[0];
    await writeLegislation(entries);
    return NextResponse.json({ deleted, remaining: entries.length });
  } catch (err) {
    console.error("[legislation] DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete entry." }, { status: 500 });
  }
}

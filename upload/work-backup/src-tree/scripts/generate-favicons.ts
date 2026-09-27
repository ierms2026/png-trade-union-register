import sharp from "sharp";
import { resolve } from "node:path";

const svgPath = resolve(process.cwd(), "public/favicon.svg");
const outDir = resolve(process.cwd(), "public");

const variants = [
  { size: 32, name: "favicon-32.png" },
  { size: 180, name: "apple-touch-icon.png" },
  { size: 192, name: "icon-192.png" },
  { size: 512, name: "icon-512.png" },
];

async function main() {
  for (const v of variants) {
    await sharp(svgPath).resize(v.size, v.size).png().toFile(resolve(outDir, v.name));
    console.log(`generated ${v.name} (${v.size}x${v.size})`);
  }

  const ogSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" fill="none">
      <rect width="1200" height="630" fill="#1e3a5f"/>
      <rect x="40" y="40" width="1120" height="550" fill="none" stroke="#c9a227" stroke-width="2"/>
      <g transform="translate(140, 200) scale(4)">
        <path d="M32 4 L56 12 L56 32 C56 46 46 56 32 60 C18 56 8 46 8 32 L8 12 Z" fill="#15293f" stroke="#c9a227" stroke-width="1.5"/>
        <g stroke="#c9a227" stroke-width="2" stroke-linecap="round" fill="none">
          <line x1="32" y1="20" x2="32" y2="42"/><line x1="20" y1="24" x2="44" y2="24"/>
          <line x1="20" y1="24" x2="16" y2="32"/><line x1="16" y1="32" x2="24" y2="32"/>
          <path d="M16 32 Q20 38 24 32"/><line x1="44" y1="24" x2="48" y2="32"/>
          <line x1="48" y1="32" x2="40" y2="32"/><path d="M40 32 Q44 38 48 32"/>
          <line x1="26" y1="42" x2="38" y2="42"/>
        </g>
      </g>
      <text x="520" y="280" font-family="Georgia, serif" font-size="64" font-weight="bold" fill="#ffffff">Register of</text>
      <text x="520" y="360" font-family="Georgia, serif" font-size="64" font-weight="bold" fill="#ffffff">Trade Unions</text>
      <text x="520" y="430" font-family="Helvetica, Arial, sans-serif" font-size="28" fill="#c9a227">Office of The Industrial Registrar</text>
      <text x="520" y="470" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="#a0aec0">Papua New Guinea · Department of Labour &amp; Industrial Relations</text>
    </svg>`;
  await sharp(Buffer.from(ogSvg)).png().toFile(resolve(outDir, "og-image.png"));
  console.log("generated og-image.png (1200x630)");
}

main().catch((err) => { console.error(err); process.exit(1); });

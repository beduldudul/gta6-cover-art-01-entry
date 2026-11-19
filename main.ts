/* Neon Coast Cover Studio — entry program (program/v1).
   Copies app/ and screenshots/ from this repository to /output (or
   $MAKEFUN_OUTPUT_DIR) and writes /output/dossier.json with buildDossier
   from vendor/makefun-app.ts. Node 22, standard library only. */
import { buildDossier } from "./vendor/makefun-app.ts";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoDir = resolve(dirname(fileURLToPath(import.meta.url)));
const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? "/output");

function copyTree(srcDir: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true });
  const names = readdirSync(srcDir).sort();
  for (const name of names) {
    const src = join(srcDir, name);
    const dest = join(destDir, name);
    if (statSync(src).isDirectory()) copyTree(src, dest);
    else copyFileSync(src, dest);
  }
}

function main(): void {
  for (const sub of ["app", "screenshots"]) {
    const target = join(outDir, sub);
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  }
  const dossierPath = join(outDir, "dossier.json");
  if (existsSync(dossierPath)) rmSync(dossierPath, { force: true });
  mkdirSync(outDir, { recursive: true });
  copyTree(join(repoDir, "app"), join(outDir, "app"));
  copyTree(join(repoDir, "screenshots"), join(outDir, "screenshots"));
  const dossier = buildDossier(repoDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 50331648,
    app_path_max_bytes: 1000,
  });
  writeFileSync(dossierPath, dossier);
  console.log(`wrote ${join(outDir, "dossier.json")} (${dossier.length} bytes)`);
}

main();

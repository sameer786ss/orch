#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const version = process.argv[2];
if (!version) {
  console.error("Usage: node scripts/stamp-desktop-version.mjs <version>");
  process.exit(1);
}

const desktopDir = path.resolve(import.meta.dirname, "..", "apps", "desktop");

const tauriConfPath = path.join(desktopDir, "src-tauri", "tauri.conf.json");
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"));
tauriConf.version = version;
fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + "\n");

const cargoPath = path.join(desktopDir, "src-tauri", "Cargo.toml");
const cargo = fs.readFileSync(cargoPath, "utf8");
const updatedCargo = cargo.replace(/^version = ".*"$/m, `version = "${version}"`);
if (updatedCargo === cargo && !cargo.includes(`version = "${version}"`)) {
  console.error("Failed to stamp version in apps/desktop/src-tauri/Cargo.toml");
  process.exit(1);
}
fs.writeFileSync(cargoPath, updatedCargo);

const pkgPath = path.join(desktopDir, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
pkg.version = version;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

console.log(`Stamped desktop version ${version}`);

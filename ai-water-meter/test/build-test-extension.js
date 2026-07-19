// Copies the real extension into test/tmp-extension and widens its
// manifest matches/host_permissions to also cover the local fixture server,
// so the *real* content scripts / manifest wiring get exercised against
// static fixtures instead of live sites. Does not touch the real manifest.
const fs = require("fs");
const path = require("path");

const EXT_ROOT = path.join(__dirname, "..");
const TMP_EXT = path.join(__dirname, "tmp-extension");
const LOCAL_ORIGIN_PATTERN = "http://127.0.0.1:8933/*";

const SKIP_DIRS = new Set(["test", "node_modules", ".git"]);

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function build() {
  fs.rmSync(TMP_EXT, { recursive: true, force: true });
  copyDir(EXT_ROOT, TMP_EXT);

  const manifestPath = path.join(TMP_EXT, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  manifest.host_permissions = [...(manifest.host_permissions || []), LOCAL_ORIGIN_PATTERN];
  manifest.content_scripts.forEach((cs) => {
    cs.matches = [...cs.matches, LOCAL_ORIGIN_PATTERN];
  });
  manifest.web_accessible_resources.forEach((war) => {
    war.matches = [...war.matches, LOCAL_ORIGIN_PATTERN];
  });

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return TMP_EXT;
}

module.exports = { build, TMP_EXT };

if (require.main === module) {
  const p = build();
  console.log(`Built test extension at ${p}`);
}

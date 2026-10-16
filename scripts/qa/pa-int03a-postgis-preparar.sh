#!/bin/sh
# Runtime oficial autocontenido para macOS; no instala ni altera PostgreSQL del
# sistema. Solo descarga artefacto público y copia binarios/extensiones a /tmp.
# Fuente: https://github.com/PostgresApp/PostgresApp/releases/tag/v2.9.6
set -eu
if [ "$(uname -s)" != Darwin ]; then
  printf '%s\n' 'En Linux instala PostgreSQL+PostGIS con tu gestor y pasa --pg-bin; este preparador es para macOS.' >&2
  exit 1
fi
runtime=$(mktemp -d /tmp/pa-postgis-runtime.XXXXXX)
mount="$runtime/mount"
mkdir "$mount"
mounted=false
cleanup() {
  if [ "$mounted" = true ]; then hdiutil detach "$mount" -quiet || true; fi
}
trap cleanup EXIT HUP INT TERM
url='https://github.com/PostgresApp/PostgresApp/releases/download/v2.9.6/Postgres-2.9.6-14.dmg'
expected='a73a5d7c78c1fdce15ff1cc31b55d670c0b68070e0c436add53d3b053ef6567a'
curl --fail --location --show-error "$url" --output "$runtime/postgres.dmg"
actual=$(shasum -a 256 "$runtime/postgres.dmg" | cut -d ' ' -f 1)
if [ "$actual" != "$expected" ]; then
  printf '%s\n' 'El SHA256 del artefacto difiere del usado para QA; no se monta ni ejecuta.' >&2
  exit 1
fi
hdiutil attach "$runtime/postgres.dmg" -readonly -nobrowse -mountpoint "$mount" >&2
mounted=true
cp -R "$mount/Postgres.app/Contents/Versions/14" "$runtime/14"
hdiutil detach "$mount" -quiet
mounted=false
rm "$runtime/postgres.dmg"
rmdir "$mount"
printf 'Runtime PostgreSQL/PostGIS preparado en %s\n' "$runtime/14/bin"
printf 'Verificar: python3 scripts/qa/pa-int03a-db-test.py --pg-bin %s\n' "$runtime/14/bin"
printf 'Eliminar únicamente este runtime al terminar: rm -rf %s\n' "$runtime"

#!/bin/sh
# Se ejecuta UNA sola vez, al crear el volumen por primera vez (carpeta docker-entrypoint-initdb.d).
# Crea las dos bases de desarrollo: kiosco_dev (la de trabajo) y kiosco_test (solo para tests).
set -e
for db in kiosco_dev kiosco_test; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
    -c "CREATE DATABASE $db OWNER \"$POSTGRES_USER\""
done

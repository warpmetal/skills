# Integraciones de terceros

> Read this in English: [`INTEGRATIONS.md`](INTEGRATIONS.md)

Cómo las skills de agency hablan con GitHub, Cloudflare y Slack: cómo funciona la
maquinaria, qué se puede hacer hoy y qué **no** se puede hacer por diseño. Esto describe
lo que el código hace de verdad, incluidos los casos en los que se niega a actuar.

**Contenido**

1. [La regla que explica el resto](#1-la-regla-que-explica-el-resto)
2. [Las tres capas](#2-las-tres-capas)
3. [Por qué dos binarios se llaman `warpmetal`](#3-por-qué-dos-binarios-se-llaman-warpmetal)
4. [Qué se puede hacer hoy](#4-qué-se-puede-hacer-hoy)
5. [Credenciales: dónde puede vivir un secreto](#5-credenciales-dónde-puede-vivir-un-secreto)
6. [La API de la librería bash](#6-la-api-de-la-librería-bash)
7. [Gates: el doble chequeo](#7-gates-el-doble-chequeo)
8. [Degradación honesta](#8-degradación-honesta)
9. [Cómo la usan las skills](#9-cómo-la-usan-las-skills)
10. [Configuración: el manifiesto del cliente](#10-configuración-el-manifiesto-del-cliente)
11. [Puesta en marcha](#11-puesta-en-marcha)
12. [Qué no se puede hacer](#12-qué-no-se-puede-hacer)
13. [Cómo se prueba](#13-cómo-se-prueba)
14. [Añadir un proveedor](#14-añadir-un-proveedor)

---

## 1. La regla que explica el resto

> **Un script de skill nunca habla con un proveedor por su cuenta.**

Nada de `curl https://api.cloudflare.com`, ni `gh`, ni una URL de webhook dentro de un
script de skill. El script llama a `conventions/lib/integration.sh`, y esa librería llama
al motor `warpmetal`. El motor es dueño de las credenciales, los scopes, los reintentos y
la idempotencia; la skill es dueña de **la decisión y la aprobación**.

Esto no es una preferencia de estilo. `scripts/validate-skills.mjs` falla el build cuando
un script de skill contiene `api.cloudflare.com`, `api.github.com`, una URL de la API de
Slack, `warpmetal integration` o `warpmetal env secret`. La librería es el único lugar
donde esas cadenas pueden aparecer.

Las consecuencias prácticas: **un único lugar donde viven las credenciales**, y **todo
llamado a un proveedor es un evento gate-able y auditable**.

---

## 2. Las tres capas

| Capa | Dónde | Es dueña de |
|------|-------|-------------|
| Script de skill | `skills/<name>/scripts/*.sh` | La decisión, el gate, la entrada del diario |
| Librería de integración | `skills/<name>/conventions/lib/integration.sh` | Resolución, degradación honesta, materialización de secretos |
| Motor | `@warpmetal/cli` (`warpmetal env`, `warpmetal integration`) | Credenciales, adaptadores de proveedor, scopes, idempotencia |

```
script de skill ──require_confirm──▶ integration_run_mutating ──▶ warpmetal integration … ──▶ proveedor
                       ▲                        │
                       └── el gate se comprueba dos veces: aquí y en el motor
```

---

## 3. Por qué dos binarios se llaman `warpmetal`

El paquete público `warpmetal` ya existe y ya implementa los comandos del ciclo de vida
del VPS (deploy, rollback, etcétera). Reimplementarlos aquí crearía dos motores que se
separan con el tiempo. En lugar de eso, `@warpmetal/cli` es un **superconjunto** que
envuelve al paquete público:

```
warpmetal env ...            almacén de credenciales     (implementado aquí)
warpmetal integration ...    integraciones de proveedor  (implementado aquí)
warpmetal <cualquier otra>   reenviado al upstream       (sin reinterpretar nada)
```

Detalles que importan:

- La lista de namespaces locales (`env`, `integration`) es un **conjunto cerrado**. Nada
  más se interpreta aquí.
- El orden de los flags, los valores y los flags desconocidos se reenvían **exactos**. Una
  versión nueva del upstream que añada un comando funciona sin tocar nada.
- El upstream se declara como dependencia con alias
  (`"warpmetal-upstream": "npm:warpmetal@0.8.12"`) para que ambos binarios puedan llamarse
  `warpmetal` sin colisionar.
- La resolución **solo mira dentro de `node_modules`**, y rechaza cualquier candidato cuyo
  path real sea este mismo CLI. Una búsqueda en `PATH` encontraría este binario y se
  llamaría a sí misma en bucle.

**Por qué esto es un problema real que la librería resuelve:** el CLI público también se
llama `warpmetal` pero **no tiene el namespace `env`**. Así que la librería bash no
comprueba si el binario existe; comprueba si *puede hacer esto*:

```bash
if "${INTEGRATION_CLI}" env status --json >/dev/null 2>&1; then
    INTEGRATION_CLI_OK=true
fi
```

La diferencia entre "instalado" y "instalado y capaz de hacer esto" es una **advertencia**,
no un crash. `WARPMETAL_CLI` apunta la librería a un binario concreto, que es como la
manejan las pruebas.

---

## 4. Qué se puede hacer hoy

`warpmetal integration list --json` es el contrato autoritativo. Resumen:

| Proveedor | Verbos | Gate | Secretos | Herramienta extra |
|-----------|--------|------|----------|-------------------|
| `cloudflare` | `status`, `dns-list`, `dns-upsert` | `CONFIRM DNS CHANGE` (solo `dns-upsert`) | `cloudflare.token` | — |
| `github` | `status`, `repo-view` | — (solo lectura) | `github.token`, o una sesión `gh` | `gh` (opcional) |
| `slack` | `status`, `notify` | `CONFIRM NOTIFY` (solo `notify`) | `slack.token` o `slack.webhook` | — |

### Ejemplos directos

```bash
# El catálogo completo
warpmetal integration list --json

# Sondear un proveedor (nunca muta)
warpmetal integration status cloudflare --json
warpmetal integration status github --json
warpmetal integration status slack --json

# Leer los registros DNS de una zona
warpmetal integration cloudflare dns-list --zone-id <zone> --type A --name acme.com --json

# Escribir un registro A (el gate es obligatorio)
warpmetal integration cloudflare dns-upsert \
  --zone-id <zone> --name acme.com --type A --content 203.0.113.10 --ttl 60 \
  --confirm "CONFIRM DNS CHANGE" --json

# Ver un repositorio
warpmetal integration github repo-view --repo org/acme --json

# Enviar una notificación
warpmetal integration slack notify --channel "#acme-alerts" --text "Deploy OK" \
  --confirm "CONFIRM NOTIFY" --json
```

### Capacidades declaradas

Las capacidades son un enum cerrado: `dns.record.list`, `dns.record.upsert`, `repo.view`,
`notify.send`. Un adaptador **implementa** el catálogo; nunca lo amplía por su cuenta.
`scripts/verify.mjs` lee el mismo catálogo, así que una skill no puede declarar una
integración que el motor no tiene de verdad.

---

## 5. Credenciales: dónde puede vivir un secreto

Un valor secreto existe en **exactamente dos lugares**:

1. La bóveda cifrada en reposo — el archivo local AES-256-GCM, o el keychain del
   sistema, o el cifrado del servidor cuando se usa el backend remoto.
2. El stream que produce `warpmetal env secret NAME --stdout`.

Y en ningún otro. **No puede aparecer en:**

- `argv`, jamás. `env store set` rechaza valores posicionales: lee de `--stdin` o
  `--from-env`, y rechaza una terminal interactiva.
- La salida `--json`. Todo documento pasa por un redactor que elimina tanto las claves que
  parecen credenciales **como** cualquier valor secreto registrado.
- Planes, `status`, `doctor` o el diario. Esos reportan **nombres y resultados**.
- Mensajes de error. Los fallos del proveedor se proyectan sobre un `errorMap` preparado,
  nunca se reproducen desde el cuerpo de la respuesta.

`env secret NAME --stdout --json` es un **error de uso**, no una comodidad: un
serializador JSON es exactamente cómo un secreto acaba en un agregador de logs.

### Backends

| Backend | Cuándo | Qué protege |
|---------|--------|-------------|
| `remote` | `WARPMETAL_VAULT_URL` está definida | Todo, de forma centralizada. El valor nunca toca el disco local; el servidor guarda el cifrado y aplica compare-and-set por nombre. |
| `keychain` | `@napi-rs/keyring` presente | Todo. Ningún material de clave se escribe en el directorio de config. |
| `file` | en el resto (por defecto) | La bóveda en reposo: backups, dotfiles copiados, un commit accidental. **No** a un atacante local que pueda leer el directorio de config. |

El backend `file` es AES-256-GCM con clave derivada por scrypt (`N=2^15, r=8, p=1`). La
clave viene de `WARPMETAL_VAULT_PASSPHRASE`, o de `env/vault.key` creado con `0600` en el
primer uso. Escritura-y-renombrado: una escritura interrumpida no deja media bóveda atrás.

Ubicación: `$WARPMETAL_CONFIG_DIR`, si no `$XDG_CONFIG_HOME/warpmetal`, si no
`~/.config/warpmetal`, dentro de `env/`.

#### El backend remoto

`WARPMETAL_VAULT_URL` (un endpoint de cara al cliente que expone las rutas
`/internal/customer/cli/credentials*` de WarpMetal Identity) convierte al servidor en la
bóveda. Tiene prioridad sobre cualquier backend local, y la sesión es el token de
dispositivo del CLI de cliente, enviado como `X-Warpmetal-Customer-Authorization`;
`WARPMETAL_VAULT_TOKEN` lo sustituye para CI, y si no, la sesión se lee de
`<config>/session.json`.

| Variable | Significado |
|----------|-------------|
| `WARPMETAL_VAULT_URL` | URL base del endpoint de la bóveda. Definirla selecciona este backend. |
| `WARPMETAL_VAULT_TOKEN` | Bearer de la sesión de dispositivo. Tiene prioridad sobre el archivo de sesión. |

Cuatro consecuencias que conviene saber antes de cambiar:

- **Falla cerrado.** Sin sesión, o con una caducada, toda operación es `NEEDS_AUTH`
  (salida 4). Nunca cae al fichero local, así que una sesión rechazada no puede dejar una
  credencial donde tú no elegiste.
- **Es por clave.** Una escritura envía solo el valor que le diste; `has` se responde desde
  los metadatos del listado, así que `env plan` y `env doctor` nunca traen un valor.
- **No cachea nada.** `generation` es la versión que reporta el servidor: la escritura de
  otro cliente se ve de inmediato y puede invalidar la tuya.
- **Dos comandos se rechazan.** `env store rotate` y `env store destroy` devuelven
  `unsupported` contra una bóveda de servidor: la versión es del servidor, y destruir la
  bóveda de un inquilino no es un acto local. Usa `env revoke`, que quita un namespace
  nombre a nombre.

### Gestión de credenciales

```bash
warpmetal env store set cloudflare.token --stdin      # lee el valor de stdin
warpmetal env store set slack.token --from-env SLACK_TOKEN
warpmetal env list --json                             # nombres, nunca valores
warpmetal env status --json                           # backend, generación, cuántos secretos
warpmetal env plan --json                             # qué secretos de proveedor existen y cuáles faltan
warpmetal env doctor --json                           # diagnostica; nunca imprime un secreto
warpmetal env store remove cloudflare.token
warpmetal env store rotate  --confirm ROTATE          # sube la generación sin tocar valores
warpmetal env store destroy --confirm DESTROY
warpmetal env revoke --service cloudflare --confirm REVOKE
```

`env revoke` reporta `unsupported` o `uncertain` en lugar de fingir que un borrado local
es una revocación.

---

## 6. La API de la librería bash

| Función | Contrato |
|---------|----------|
| `integration_available <provider>` | Predicado puro. 0 si la integración se puede usar ahora mismo. **No emite advertencias**, así que es seguro antes de `result_init`. |
| `integration_ready <provider>` | Más estricto: pide al motor que **sondee** el proveedor, así que es falso si la credencial falta o fue rechazada. |
| `integration_require_tools <provider> [purpose]` | Llamar **después** de `result_init`. Registra una advertencia `check_skipped` por cada requisito ausente. 1 si falta algo. |
| `integration_require_ready <provider> [purpose]` | El caso común: registra el motivo honesto por el que se saltó un camino y dice si el llamante puede tomarlo. |
| `integration_run <provider> <verb> [flags…]` | Llamada de solo lectura o ya gate-ada. Añade `--json` siempre. Devuelve el exit code del motor. |
| `integration_run_mutating <provider> <verb> <gate> [flags…]` | Igual, pero **se niega** salvo que `<gate>` se haya aprobado en esta ejecución, y reenvía `--confirm <gate>`. Exit 11 si se niega. |
| `integration_secret_file <name>` | Archivo `0600` con un secreto; imprime la ruta. Registrado para limpieza. |
| `integration_emit_secret <name>` | El valor crudo en stdout. **La única forma de leer una credencial.** |
| `integration_tmp_cleanup` | Borra cada archivo que la librería creó. |
| `integration_journal <phase> <action> <detail> [code]` | Entrada del diario sin línea de comando y sin valor. |
| `integration_denied <provider> <verb> <gate> [code]` | Registra una negativa **con su motivo**, y luego devuelve el código. |
| `integration_declared <provider>` | 0 si el manifiesto tiene una sección `[integrations.<provider>]`. |
| `integration_ref <provider> <key> [defecto]` | Una referencia del manifiesto (zone id, etiqueta de cuenta). **Nunca un valor.** |
| `integration_secret_name <provider> [defecto]` | El nombre en la bóveda que hay que leer. Defecto `<provider>.token`. |
| `integration_json_string` / `integration_status_of` | Leen **un** campo de nivel superior del sobre del motor. Usa `jq` para un documento de verdad. |

### `available` frente a `ready`: la distinción que importa

`integration_available` responde *"¿este motor puede hacer este proveedor?"*.
`integration_ready` responde *"¿puedo hacerlo **ahora mismo**?"*. No son la misma
pregunta, y usar la primera antes de una mutación dejaría un cutover fallando a mitad de
camino por un token que faltaba desde el principio.

```bash
# Falso si el motor no soporta cloudflare, aunque el token exista:
integration_available cloudflare

# Falso además si la credencial falta o el proveedor la rechazó:
integration_ready cloudflare
```

`integration_ready` devuelve 0 tanto para `OK` como para `DEGRADED`: un `DEGRADED` es una
sonda que corrió y reportó honestamente, y el llamante lee el detalle de
`integration_run status`.

### Materializar un secreto en disco

Algunas herramientas (certbot, restic) exigen un archivo de credenciales. Para eso existe
`integration_secret_file`:

```bash
creds="$(integration_secret_file cloudflare.token)" || fail_with 5 STOPPED "No cloudflare.token en el almacén"
printf 'dns_cloudflare_api_token = %s\n' "$(cat "${creds}")" >"${CERTBOT_INI}"
integration_tmp_cleanup
```

El archivo se crea bajo `umask 077` **antes** de escribir el valor, así que no hay ventana
en la que sea legible por nadie más. La ruta se registra en un registro por proceso
indexado por `$$`, que es estable a través de subshells, así que la limpieza funciona
aunque la función se llamara dentro de `$( )`.

> **Cuidado:** `integration_tmp_cleanup` instala un trap `EXIT` solo si el script no tiene
> ya uno — pisar el trap de un script sería una regresión silenciosa. **Si tu script define
> su propio trap `EXIT`, debes llamar a `integration_tmp_cleanup` tú mismo.**

---

## 7. Gates: el doble chequeo

**No hay bypass.** `integration_run_mutating` exige que la cadena del gate se haya aprobado
en esta ejecución y **vuelve a comprobarla** antes de llamar al motor, porque un helper
alcanzable desde un bucle no debe separarse del gate que lo protege. El motor comprueba el
**mismo literal** otra vez: defensa en profundidad, no redundancia.

Las cadenas de gate salen del catálogo del motor, no de este documento:

```bash
warpmetal integration list --json | jq -r '.providers[] | select(.name=="cloudflare") | .gates["dns-upsert"]'
```

`integration_run` (la forma de solo lectura) **nunca inventa** un `--confirm`.

---

## 8. Degradación honesta

Una comprobación saltada **debe ser visible**. `warnings: []` junto a una afirmación no
verificada es un **falso OK**, y un falso OK es el peor resultado posible para un
consumidor autónomo.

| Estado del motor | Exit | Significado |
|------------------|------|-------------|
| `OK` | 0 | El proveedor lo confirmó |
| `DEGRADED` | 0 | La sonda corrió y reportó honestamente; el detalle está en `data`/`warnings` |
| `NEEDS_AUTH` | 4 | Falta una credencial o fue rechazada |
| `ERROR` | 5 | El proveedor rechazó la acción |

`DEGRADED` sale con 0 a propósito: el comando tuvo éxito en responder la pregunta. Lee
`status` del JSON, nunca lo adivines desde el exit code. **Un webhook de Slack es el caso
canónico de `DEGRADED`**: no se puede verificar sin enviar un mensaje, así que no se envía
ninguno y el resultado lo dice.

### Advertencias de `check_skipped`

`integration_require_tools` reporta, en este orden:

| Situación | Advertencia |
|-----------|-------------|
| No hay `warpmetal` en `PATH` | `check_skipped: the warpmetal CLI is not installed, so <purpose> was not verified` |
| `warpmetal` presente pero sin `env`/`integration` (el CLI público) | `check_skipped: '<path>' has no env/integration support (install @warpmetal/cli), so <purpose> was not verified` |
| Proveedor no ofrecido por el motor instalado | `check_skipped: the '<provider>' integration is not offered by '<path>', so <purpose> was not verified` |
| Falta una herramienta que el proveedor prefiere | `check_skipped: '<tool>' is not installed, so <purpose> was not verified` |
| No se pudo leer la lista de herramientas | `check_skipped: could not read the tool requirements for '<provider>', so <purpose> was not verified` |

### Mapeo de exit codes

El motor y un script de skill responden preguntas distintas, así que los códigos se
**mapean** en lugar de propagarse. Una credencial ausente no es "fallo de git": es un
prerrequisito ausente, y la tabla de la skill (`outputs.md`) tiene la palabra para eso.

| Exit del motor | Significado | Acción de la skill |
|----------------|-------------|--------------------|
| `0` | Reportado (incluye `DEGRADED`) | Continuar; leer `status` del JSON si la distinción importa |
| `2` | Error de uso o de configuración, incluido un verbo mutante sin su `--confirm` | Corregir la invocación; no se envió nada |
| `4` | `NEEDS_AUTH` | `fail_with 5 STOPPED` — prerrequisito ausente |
| `5` | `ERROR` (el proveedor lo rechazó) | `fail_with 1 FAILED` |
| `127` | El motor no está instalado o desapareció | `fail_with 127 STOPPED` |

Un script **nunca** debe emitir un estado del motor como resultado propio (`NEEDS_AUTH`,
etcétera); `outputs.md` solo permite el conjunto compartido más la fila propia de la skill.

> **Sobre el exit `11`.** El motor nunca lo devuelve: un `--confirm` ausente o incorrecto
> es `usage_error` (exit **2**), y el motor no envía nada. El `11` lo produce **la capa
> bash** (`integration_run_mutating` / `integration_denied`), que es lo que un script ve
> en la práctica, antes de que el motor llegue a llamarse.
> `conventions/integrations.md` lista ambos códigos y atribuye cada uno a la capa que lo
> devuelve.

---

## 9. Cómo la usan las skills

### `migrate-site` → `cutover.sh`: elegir cómo se aplica el cambio de DNS

El modo se resuelve **antes** de imprimir el plan, para que el plan nunca prometa un cambio
automático que esta ejecución no puede entregar:

```bash
DNS_MODE="manual"
if [[ -n "${DNS_COMMAND}" ]]; then
    DNS_MODE="command"
elif [[ -n "${CF_ZONE_ID}" ]] && integration_ready cloudflare; then
    DNS_MODE="integration"
fi
```

Con un Cloudflare declarado pero sin credencial usable, degrada a imprimir el registro (con
una advertencia visible) **en lugar de fallar a mitad del cutover**. Cada flag se pasa como
su propia entrada de argv y el motor vuelve a comprobar el literal del gate.

### `deploy-site` → `deploy.sh`: el preflight de GitHub es una advertencia

```bash
REPO_SLUG="$(integration_ref github repo)"
if integration_require_ready github "the GitHub repository access check"; then
    REPO_OUT="$(integration_run github repo-view --repo "${REPO_SLUG}" 2>&1)"
```

Es una **advertencia, no un stop**: la clave de deploy del propio servidor es la que hace
el `pull`, así que un `gh` ausente degrada el preflight y el deploy continúa.

### `ssl-dns-fix` → `fix-cert.sh`: el reto DNS-01

Cuando el reto elegido es DNS-01, el token se materializa en un archivo local `0600`, se
copia al servidor por **stdin** bajo el `umask 077` remoto, y se borra por trap pase lo que
pase:

```bash
CF_SECRET="$(integration_secret_name cloudflare)"
CREDS_LOCAL="$(integration_secret_file "${CF_SECRET}")" || fail_with 5 STOPPED "..."
```

El valor viaja por stdin, nunca en `argv`: `cat > archivo` bajo el `umask 077` remoto es más
estricto que `scp`, que dejaría el archivo legible mientras dura la copia.

También soporta `--skip-dns-preflight` para el caso en que el registro **existe pero este
host no puede verlo** (sin `dig`, vista split-horizon, todavía propagándose). El skip se
registra como advertencia y se reporta como `dns_preflight: "skipped"`, nunca en silencio.

### `server-monitoring` → `test-alert.sh`: notificar por Slack

```bash
SLACK_CHANNEL="$(integration_ref slack channel)"
if ! integration_require_ready slack "the Slack test notification"; then ...
NOTIFY_OUT="$(integration_run_mutating slack notify "CONFIRM NOTIFY" ...)"
```

---

## 10. Configuración: el manifiesto del cliente

Ubicación: `~/.config/agency/clients/<client>.toml` (se puede sobrescribir con
`AGENCY_MANIFEST_DIR`). Las tablas de integración contienen **referencias solamente**:

```toml
[integrations.cloudflare]
zone_id = "023e105f4ecef8ad9ca31a8372d0c353"
account = "acme"                # etiqueta para el diario; nunca se usa para autenticar
secret  = "cloudflare.token"    # el *nombre*; el valor vive en la bóveda
ttl     = 60                    # defecto 1 (auto de Cloudflare)

[integrations.github]
repo    = "org/acme"
secret  = "github.token"

[integrations.slack]
channel = "#acme-alerts"
secret  = "slack.token"         # o slack.webhook para un hook entrante
```

| Referencia | Proveedor | Requerida para | Descripción |
|------------|-----------|----------------|-------------|
| `zone_id` | cloudflare | el cambio DNS de `cutover.sh` | Sin ella, el cutover **imprime** el cambio en lugar de aplicarlo |
| `account` | cloudflare | opcional | Etiqueta para el diario y el reporte |
| `ttl` | cloudflare | opcional | TTL del registro A. Defecto `1` (auto) |
| `secret` | cualquiera | opcional | Nombre en la bóveda que hay que leer. Defecto `<provider>.token` |
| `repo` | github | el preflight de `deploy.sh` | `owner/name`, verificado antes del deploy |
| `channel` | slack | `notify` | Canal destino de la notificación |

> **Un token en el manifiesto es un bug, no una configuración.** El validador lo rechaza.

---

## 11. Puesta en marcha

```bash
# 1. Instalar el motor
npm install            # dentro de packages/warpmetal-cli

# 2. Ver qué hay disponible
warpmetal integration list
warpmetal env doctor --json

# 3. Guardar la credencial (nunca como argumento)
printf '%s' "$CLOUDFLARE_API_TOKEN" | warpmetal env store set cloudflare.token --stdin

# 4. Verificar que el proveedor responde
warpmetal integration status cloudflare --json     # lee "status", no el exit code

# 5. Declarar la referencia en el manifiesto del cliente
#    ~/.config/agency/clients/acme.toml -> [integrations.cloudflare]

# 6. Ensayar sin mutar (las skills respetan --dry-run)
skills/migrate-site/scripts/cutover.sh --client acme --dry-run
```

---

## 12. Qué no se puede hacer

Estos límites son deliberados y están declarados en el catálogo; puedes releerlos con
`warpmetal integration list --json`.

- **Cloudflare: solo DNS.** `dns-list` y `dns-upsert`. WAF y reglas de firewall son una
  fase posterior.
- **El scope se define en el dashboard del proveedor.** Este toolkit **no puede
  estrecharlo**, e `integration status` reporta como mucho si el token es válido,
  **nunca** a qué zonas alcanza. Un PAT clásico de GitHub no se puede limitar desde aquí;
  uno *fine-grained* sí, en el dashboard de GitHub.
- **Un webhook entrante de Slack está atado a un canal para siempre** y no se puede
  re-apuntar.
- **GitHub es de solo lectura en esta versión** (`repo.view`): no hay verbo mutante que
  gatear. Tampoco declara scopes, porque la API de GitHub no expone los scopes de un PAT
  clásico, así que `status` reporta identidad y nada más.
- **La revocación es honesta, no mágica.** `cloudflare` y `slack`: `unsupported` (revoca en
  el dashboard). `github`: `uncertain` (confirma en el dashboard). `env revoke` elimina
  material local y lo dice.
- **`env secret` no acepta `--json`.** Es un error de uso.

---

## 13. Cómo se prueba

```bash
bash tools/check-all.sh     # validador de política + bash -n + integration-selftest.sh
npm run verify              # registro, espejos de conventions, catálogo
npm test                    # dentro de packages/warpmetal-cli
```

`tools/integration-selftest.sh` maneja la librería contra un CLI stub y **afirma** las
advertencias de degradación, el archivo `0600`, y que una mutación sin gate **no envía
nada** y sale con 11. La suite del motor es **sin red por construcción**: la función
`fetch`, el runner de procesos y el backend de credenciales están todos inyectados. Un test
de canario prueba que un valor guardado **nunca** aparece en ningún diagnóstico, plan,
listado, error o documento `--json`, y que **sí** aparece en el único stream sancionado.

---

## 14. Añadir un proveedor

1. Añade un `ProviderSpec` a `PROVIDERS` en
   `packages/warpmetal-cli/src/integration/registry.ts`: capacidades, secretos,
   `requiresTools`, scoping honesto, `filesWritten`, `verifyCommand`, un `errorMap`
   redactado, y `revoke`.
2. Implementa el adaptador en `src/integration/adapters/<provider>.ts`. `status` **nunca**
   muta y **nunca** imprime un éxito que no puede verificar.
3. Declara el gate de cada verbo mutante en el mapa `gates`.
   **Valida el verbo, los flags y el gate antes de leer la credencial** — un gate ausente es
   `usage_error` (exit 2), no `NEEDS_AUTH` (exit 4). Un `--confirm` olvidado y un token
   olvidado son diagnósticos distintos y no deben confundirse.
4. Registra el adaptador en `adapters/index.ts`.
5. Añade el proveedor al array `integrations` en el `skill.json` de cada skill que lo use;
   `verify.mjs` rechaza un proveedor declarado que no esté en el catálogo.
6. Añade la fila a `conventions/integrations.md` y ejecuta el build: sincroniza
   `conventions/` a las siete skills y regenera `catalog/` y `plugins/`.

---

## Ver también

- [`INTEGRATIONS.md`](INTEGRATIONS.md) — esta misma guía en inglés.
- [`conventions/integrations.md`](conventions/integrations.md) — el contrato normativo que
  siguen las skills, y el catálogo de proveedores.
- [`conventions/client-manifest.md`](conventions/client-manifest.md) — el esquema completo
  del manifiesto, incluidas las tablas de integración.
- [`packages/warpmetal-cli/README.md`](packages/warpmetal-cli/README.md) — el motor en sí:
  dispatch de superconjunto, modelo de credenciales, exit codes.
- [`docs/coding-env-skill-plan.md`](docs/coding-env-skill-plan.md) — donde está congelado el
  contrato de exit codes.

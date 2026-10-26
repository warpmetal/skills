# Modelo de amenaza: secretos e identidades de WarpMetal

Este documento responde una sola pregunta: **¿qué sigue protegido cuando el atacante ya tiene
acceso de lectura al host?** No pregunta si existe cifrado —existe— sino si el cifrado cubre al
adversario que importa.

## Por qué este documento existe

El 21 de octubre Railway detectó acceso no autorizado a variables de entorno de clientes y, en
algunos casos, a su contenido ya descifrado. El cifrado en reposo no ayudó: el atacante no copió el
disco, alcanzó el servicio en ejecución, donde los secretos viven en variables de entorno, en argv,
en logs y en la memoria del proceso.

WarpMetal tiene la misma forma: un vault cifrado en el host del operador, una passphrase que puede
venir del entorno, identidades SSH en disco y un servidor MCP que habla con ambos. Este documento
declara qué defiende cada control, qué no defiende, y con qué prueba se comprueba.

## Activos

| Activo | Dónde vive | Qué pasa si se filtra |
|---|---|---|
| Payload del vault (tokens de proveedores) | `env/vault.enc` cifrado | Acceso a los proveedores del operador |
| Clave del vault | `env/vault.key`, `WARPMETAL_VAULT_PASSPHRASE`, keychain | Abre el vault y **todas sus copias de seguridad** |
| Sesión del customer CLI | `session.json`, `WARPMETAL_VAULT_TOKEN` | Lee el vault remoto del tenant |
| Claves privadas SSH | Rutas del operador (nunca las toca el servidor MCP) | Acceso a los servidores |
| `ownerToken` y state file | State file de WarpMetal | Recuperación y control de la cuenta |
| Log de auditoría | `<state>/warpmetal-mcp/audit.jsonl` | Metadatos de uso, no valores |

## Adversarios en alcance

| ID | Adversario | Capacidad asumida |
|---|---|---|
| A1 | Lectura del directorio de configuración | Copia `~/.config/warpmetal` entero |
| A2 | Mismo usuario en el host | Lee entorno (`/proc/<pid>/environ`), argv (`ps`), y lo que el proceso escriba |
| A3 | Lector de transcripciones | Ve las respuestas del MCP, los errores y los tickets |
| A4 | Lector de artefactos | Un tarball de backup, un repo con dotfiles, un contenedor de CI |
| A5 | CI comprometido | Controla el entorno y los subprocesos del job |

Fuera de alcance: un atacante con control total del usuario mientras el vault está desbloqueado
(puede leer la memoria del proceso), el proveedor, la consola del cloud y el servidor del vault
remoto.

## Controles por activo

| Activo | A1 | A2 | A3 | A4 | A5 |
|---|---|---|---|---|---|
| Payload del vault | AES-256-GCM + scrypt, 0600 (Fase 3: ver nota Windows) | Cifrado en memoria del proceso, no en argv | Sólo `env secret --stdout` lo emite | Cifrado, AAD `warpmetal-env:v1` | Cifrado, misma clave |
| Clave del vault | **Ya no se crea junto al vault** sin aceptación explícita; keychain instalable | `childEnv()` la elimina de todo hijo | `env status` reporta `keySource`, nunca el valor | Documentado como riesgo si es `key-file` | `childEnv()` |
| Sesión del CLI | `0600` cuando la escribe el customer CLI | `WARPMETAL_VAULT_TOKEN` se elimina de hijos | Sólo se nombra la ruta del archivo en el error | Es un bearer: tratarlo como secreto | Idem |
| Claves SSH | El servidor MCP no las lee nunca | Rutas ya no se devuelven ni se registran | Sin rutas en envelope ni en auditoría | — | — |
| Log de auditoría | `0600` | Sin argv ni valores, sólo nombres de campos | N/A | Sin secretos por diseño | Idem |

## Decisiones que un lector debe poder auditar

1. **La llave no nace junto al vault.** Si no hay keychain, ni passphrase externa, ni una llave
   previa, el CLI **falla** con `key_required` (exit 4) y nombra las tres salidas. Leer una llave
   existente sigue permitido: la instalación que ya la tiene no se rompe, sólo se le marca el
   problema en `env doctor`.
2. **La passphrase no viaja a los hijos.** `childEnv()` construye un entorno explícito sin
   `WARPMETAL_VAULT_PASSPHRASE`, `WARPMETAL_VAULT_TOKEN`, `WARPMETAL_ACCEPT_LOCAL_KEY` ni
   `X402API_WALLET_PASSWORD`. Un override del llamador tampoco puede reintroducirlos.
3. **Ninguna ruta local cruza la superficie MCP.** `wm_identity_list` y `wm_server_identity`
   proyectan el payload a `{ keyName, sshFingerprint, hasLocalKey, … }`; el redactor además trata
   cualquier valor que sea *entero* una ruta absoluta como `[REDACTED:path]`, sin depender del
   nombre del campo.
4. **El log no es una superficie de datos.** Registra tool, subcomando, estado, código, duración y
   **nombres** de campos redactados.

## Riesgo residual, declarado

- Con `keySource: key-file`, A1 gana: quien copia el directorio obtiene cifrado y llave. Es el
  estado que `env doctor` marca en error y que la migración documentada elimina.
- En Windows los `0600` no se aplican, así que `env doctor` no los finge: lee el descriptor real
  (SDDL) y avisa si una ACE da lectura amplia. Sigue sin aplicarlo ni corregirlo; verificarlo exige
  que el operador actúe sobre el `icacls`.
- Un atacante que controla el mismo usuario con el vault desbloqueado puede leer la memoria del
  proceso y la salida de `env secret --stdout`. Ningún esquema local lo evita.
- Las rutas siguen viajando en argv de los comandos que las necesitan (`--identity`,
  `--connection-file`). Son visibles con `ps` para el mismo usuario; la mitigación es no
  registrarlas y no ecoarlas, no ocultarlas del sistema operativo.
- El nombre del archivo de auditoría es visible para quien pueda listar el directorio; el contenido
  no, y el directorio se crea en `0700`.

## Cómo se verifica

| Afirmación | Prueba |
|---|---|
| El vault no deja plaintext en disco | `packages/warpmetal-cli/test/vault.test.ts` |
| La passphrase no está en el vault ni en diagnósticos | `packages/warpmetal-cli/test/key-material.test.ts`, `test/leak.test.ts` |
| Un hijo no ve la passphrase | `test/leak.test.ts` (spawn real que imprime su entorno) |
| Sin aceptación no se crea `vault.key` | `test/key-material.test.ts` |
| Las tools de identidad no devuelven rutas | `packages/skills-mcp/test/conformance.test.ts` |
| El log de auditoría no lleva rutas ni valores | `packages/skills-mcp/test/conformance.test.ts` |
| En Windows se verifica la ACL real, no un `chmod` | `packages/warpmetal-cli/test/win-acl.test.ts` y el job `windows-cli` |

Ejecutar: `npm --prefix packages/warpmetal-cli test` y `npm --prefix packages/skills-mcp test`.

## Migración para un operador con `vault.key`

```sh
# 1. Elegir un camino: instalar el keychain, exportar la passphrase desde el
#    gestor de secretos, o apuntar WARPMETAL_VAULT_URL al vault remoto.
# 2. Re-escribir cada secreto por nombre (no hay lectura masiva a propósito).
warpmetal env list | while read -r name; do
  warpmetal env secret "$name" --stdout | warpmetal env store set "$name" --stdin
done
# 3. Borrar el vault viejo y su llave.
warpmetal env store destroy --confirm DESTROY
# 4. Confirmar: `key-material` debe quedar en `ok`.
warpmetal env doctor
```

`WARPMETAL_ACCEPT_LOCAL_KEY=1` existe para el operador que decide, con la información de este
documento, que la llave junto al vault es aceptable en su host. No está pensado para scripts.

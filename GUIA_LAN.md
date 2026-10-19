# Guía de conexión por LAN — UNO.js

Esta guía explica paso a paso cómo jugar UNO.js desde varios equipos de la misma red local (LAN/WiFi), sin necesidad de internet.

---

## Resumen rápido

1. El **anfitrión** (host) levanta RabbitMQ en su máquina y corre el servidor del juego.
2. Cada **cliente** (otro equipo) se conecta a RabbitMQ usando la **IP LAN** del anfitrión.
3. Todas las máquinas deben estar en la **misma red** y el puerto **5672** debe estar abierto.

---

## Paso 0 — Requisitos en todas las máquinas

- Node.js 18+ y npm instalados.
- El proyecto copiado y las dependencias instaladas:
  ```powershell
  cd C:\ruta\al\UNO.js
  npm install
  ```
- Estar conectados a la **misma red** (misma WiFi o LAN).

---

## Paso 1 — Levantar RabbitMQ (solo en el anfitrión)

RabbitMQ es el "servidor de mensajes" que une a todos los jugadores. Corre **solo en la máquina del anfitrión**.

### Opción A: Docker (recomendada)

```powershell
docker run -d --hostname rabbitmq --name uno-rabbit `
  -p 5672:5672 -p 15672:15672 rabbitmq:3-management
```

- Puerto `5672`: comunicación del juego (AMQP).
- Puerto `15672`: panel web de administración (http://localhost:15672).

### Opción B: RabbitMQ instalado nativamente

Instala Erlang y RabbitMQ, y asegúrate de que el servicio esté corriendo en el puerto 5672.

---

## Paso 2 — Crear un usuario para la red (IMPORTANTE)

RabbitMQ **bloquea el usuario `guest` para conexiones que no sean desde `localhost`**. Si tus clientes se conectan desde otro equipo, **no podrán usar `guest`**. Hay que crear un usuario real.

Con Docker:
```powershell
docker exec -it uno-rabbit rabbitmqctl add_user juega password123
docker exec -it uno-rabbit rabbitmqctl set_permissions -p / juega ".*" ".*" ".*"
docker exec -it uno-rabbit rabbitmqctl set_user_tags juega administrator
```

> Cambia `juega` / `password123` por el usuario y contraseña que quieras. Guárdalos: los clientes los usarán para conectarse.

---

## Paso 3 — Abrir el firewall del anfitrión (Windows)

Si el anfitrión usa Windows Firewall, hay que permitir el puerto 5672 para que los clientes puedan conectarse. Ejecuta esto **como Administrador** en la máquina del anfitrión:

```powershell
New-NetFirewallRule -DisplayName "RabbitMQ UNO" -Direction Inbound -LocalPort 5672 -Protocol TCP -Action Allow
```

> Si usas otro firewall (router, antivirus), asegúrate de que el puerto 5672 TCP esté abierto hacia la red local.

---

## Paso 4 — Descubrir la IP LAN del anfitrión

En la máquina del anfitrión:
```powershell
ipconfig
```
Busca la dirección **IPv4** de tu adaptador de red (WiFi o Ethernet). Ejemplo:
```
IPv4 Address. . . . . . . . . . . : 192.168.56.1
```
Esa IP es la que repartirás a los demás jugadores. (El programa también la muestra al iniciar el host.)

---

## Paso 5 — Iniciar el host (anfitrión)

En la máquina del anfitrión:
```powershell
npm run start:host
```
1. Te pide un **nombre** (escribe el tuyo y pulsa Enter).
2. Verás un tablero con el **Game ID** y la **IP LAN**. Ejemplo:
   ```
   Game ID: game-a1b2c3 | IP: 192.168.56.1:5672
   Estado: WAITING | Jugadores: 0
   ```
3. **Comparte el Game ID y tu IP** con los demás jugadores.
4. Cuando entren suficientes jugadores, el host escribe `i` y Enter para **iniciar la partida**.

El host debe permanecer abierto durante toda la sesión.

---

## Paso 6 — Conectarse desde los otros equipos

En **cada** otro equipo (con el proyecto copiado y `npm install` hecho), define las variables de entorno y arranca el cliente.

### Usando variables de entorno (PowerShell)

```powershell
# IP LAN del anfitrión (paso 4)
$env:RABBITMQ_HOST="192.168.175.106"
# Usuario y contraseña creados en el paso 2
$env:RABBITMQ_USER="juega"
$env:RABBITMQ_PASS="password123"
# Game ID mostrado por el host
$env:GAME_ID="game-mvfp4h1u-39bf7s"

npm run start:client
```

### O respondiendo a los prompts

Si no defines `GAME_ID` ni `RABBITMQ_HOST`, el cliente te los pedirá por teclado. Escribe:
- **Game ID**: el que muestra el host.
- **RabbitMQ host**: la IP LAN del host.
- **Tu nombre**: el que quieras.

> **Nota:** el usuario y contraseña (`RABBITMQ_USER` / `RABBITMQ_PASS`) **sí** deben definirse como variables de entorno; el cliente no los pide por teclado y usaría `guest` (que falla desde otro equipo).

Tras conectarte verás tu tablero. Cada jugador se reparte 7 cartas cuando el host inicia la partida.

---

## Paso 7 — Jugar

- Cada jugador ve su **mano** y el estado de la partida; el tablero se **redibuja solo** cuando alguien actúa.
- Escribe el **número** de una carta para jugarla.
- `d` = robar, `u` = UNO (aunque el UNO se asigna automático al quedar con 1 carta), `p` = ver jugadores, `s` = salir.
- Si juegas un comodín (+4 o comodín de color), te pedirá elegir color: `r` (rojo), `b` (azul), `g` (verde), `y` (amarillo).

Cuando un jugador gana, todas las terminales lo muestran y el host puede pulsar `i` para **empezar otra partida**.

---

## Solución de problemas

| Problema | Causa probable | Solución |
|---|---|---|
| El cliente dice `AUTH` o `ACCESS_REFUSED` | Está usando `guest` desde otro equipo | Define `RABBITMQ_USER` y `RABBITMQ_PASS` con el usuario creado en el paso 2. |
| El cliente no conecta (timeout) | Firewall cerrado o IP incorrecta | Abre el puerto 5672 (paso 3) y verifica la IP con `ipconfig` (paso 4). |
| No ve a los demás jugadores | Distinto `GAME_ID` | Asegúrate de que todos usan el mismo Game ID que muestra el host. |
| Conexión intermitente | Red inestable o IP dinámica | Fija la IP del host o usa la IP real de la red, no `127.0.0.1`. |

### Verificar que RabbitMQ responde

Desde un cliente, comprueba que el puerto responde:
```powershell
Test-NetConnection -ComputerName 192.168.56.1 -Port 5672
```
`TcpTestSucceeded : True` indica que la red está bien.

Panel de administración (solo desde el host): http://localhost:15672 (usuario `guest` en local).

---

## Notas

- **No se necesita internet.** Todo funciona en la red local.
- El host ejecuta RabbitMQ **y** el servidor del juego en la misma máquina. Los clientes solo necesitan alcanzar esa máquina por IP.
- Si el host se apaga, la partida se corta; al reiniciarlo hay que volver a iniciar la partida.

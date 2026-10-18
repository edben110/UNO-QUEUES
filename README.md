# UNO.js - Juego UNO Multijugador sobre RabbitMQ

Juego multijugador de cartas UNO completamente desde terminal, usando Node.js, RabbitMQ y `amqplib`. Permite que varios jugadores se conecten desde distintos equipos en la misma red LAN.

## Requisitos previos

- Node.js 18+ (probado con v24.13.1)
- npm 10+
- RabbitMQ (ejecutándose y accesible desde la LAN en puerto 5672). Recomendado: Docker
- Docker (opcional, pero recomendado para levantar RabbitMQ local)

## 1. Levantar RabbitMQ

### Opción A: Docker (recomendada)
```powershell
docker run -d --hostname rabbitmq --name uno-rabbit -p 5672:5672 -p 15672:15672 rabbitmq:3-management
```
- Interfaz web (admin): http://localhost:15672 (guest/guest)
- Credenciales por defecto: guest/guest. Para red LAN, usa usuario/password propio si accedes desde otros equipos.

### Opción B: Instalación nativa
Instala RabbitMQ y Erlang. Asegúrate de que el puerto 5672 esté abierto para conexiones desde tu red.

## 2. Instalar dependencias

```powershell
cd C:\Users\edben\OneDrive\Desktop\codes\distribuidos\UNO.js
npm install
```

## 3. Iniciar el anfitrión (Host)

Desde la terminal donde correrá el servidor/juego anfitrión:

```powershell
npm run start:host
```

El anfitrión te pedirá un nombre. A partir de ahí verás un tablero dinámico que se redibuja solo:
- Game ID (identificador de la partida)
- IP LAN del host
- Lista de jugadores conectados (con su número de cartas)
- Tu mano y menú de acciones

El host permanece abierto mientras se juega y ve en tiempo real cuando otros jugadores se unen o actúan.

### Menú del host

Cuando la partida está en espera (WAITING):
- `i` / `iniciar` - Iniciar la partida (necesitas al menos 2 jugadores)
- `p` / `jugadores` / `estado` - Refrescar vista
- `s` / `salir` - Salir

Durante la partida:
- Escribe el **número** de una carta de tu mano para jugarla
- `d` / `robar` - Robar una carta
- `u` / `uno` - Anunciar UNO
- `i` / `iniciar` - (solo en espera)
- `p` / `estado` - Refrescar vista
- `s` / `salir` - Salir

Si juegas un comodín (WILD / WILD4), te pedirá elegir color: `r` (rojo), `b` (azul), `g` (verde), `y` (amarillo), o `cancel` para anular.

## 4. Conectar clientes

En cada equipo (o terminal distinta), ejecutar:

```powershell
cd C:\Users\edben\OneDrive\Desktop\codes\distribuidos\UNO.js
$env:RABBITMQ_HOST="192.168.1.50"  # IP LAN del anfitrión
$env:GAME_ID="game-xxx"            # Game ID mostrado por host
npm run start:client
```

El cliente pedirá: Game ID (o usa env), RabbitMQ host (o usa env), y tu nombre. Luego muestra tu tablero dinámico.

## 5. Menú del cliente

Una vez conectado verás tu tablero (se redibuja solo con los cambios de todos). El menú es el mismo que el del host, pero sin `iniciar`:

- Escribe el **número** de una carta de tu mano para jugarla
- `d` / `robar` - Robar una carta
- `u` / `uno` - Anunciar UNO
- `p` / `estado` - Refrescar vista
- `s` / `salir` - Salir

Comodines piden color (`r/b/g/y` o `cancel`). Tu mano privada solo se muestra en tu terminal, nunca se envía a la cola pública.

## 6. Reglas de cartas de acción (con apilamiento)

- **+2 (DRAW2):** el siguiente jugador acumula +2 robo. Puede **apilar** con otro +2 o con un +4, o **robar** el acumulado y perder el turno.
- **+4 (WILD_DRAW4):** el siguiente acumula +4 y el jugador elige el color. Solo se puede apilar con otro +4.
- **Regla de apilamiento:** un +2 se puede responder con +2 o +4; pero una vez en la mesa un +4, **solo** se responde con +4. Cada carta de robo suma su valor al acumulado.
- **Escape forzado:** con un robo pendiente, el jugador solo puede apilar con la carta de robo válida o robar el acumulado; no puede jugar una carta normal aunque coincida en color/número.
- **SALTO (SKIP):** salta el turno del siguiente jugador.
- **CAMBIO (REVERSE):** invierte el sentido del juego. Con 2 jugadores actúa como SALTO (sigue el mismo jugador).

Cuando hay un robo pendiente, la terminal muestra `ROBO PENDIENTE: +N`. El comando `d` roba ese acumulado y pierde el turno.

## 7. Pruebas

```powershell
npm test
```
Ejecuta pruebas unitarias de lógica de juego y una prueba de integración (host + 2 clientes sincronizados) si RabbitMQ está disponible.

## Notas de red

- Funciona únicamente en red LAN/WiFi. No requiere internet.
- El puerto 5672 debe estar accesible desde clientes al host de RabbitMQ.
- Revisa firewall de Windows si hay problemas de conexión.
- Usa la IP LAN real (no 127.0.0.1) si clientes están en otros equipos.

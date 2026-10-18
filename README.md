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

El anfitrión te pedirá un nombre y mostrará:
- Game ID (identificador de la partida)
- IP LAN del host
- Instrucciones para que los clientes se conecten

Ejemplo de salida:
```text
Host name: HostUno
[HOST] Game game-xxx started...
=== HOST READY ===
Game ID: game-xxx
RabbitMQ (AMQP): 192.168.1.50:5672
```

El host debe permanecer abierto mientras se juega.

## 4. Conectar clientes

En cada equipo (o terminal distinta), ejecutar:

```powershell
cd C:\Users\edben\OneDrive\Desktop\codes\distribuidos\UNO.js
$env:RABBITMQ_HOST="192.168.1.50"  # IP LAN del anfitrión
$env:GAME_ID="game-xxx"            # Game ID mostrado por host
npm run start:client
```

El cliente pedirá: Game ID (o usa env), RabbitMQ host (o usa env), y tu nombre.

## 5. Comandos del cliente

Una vez conectado, puedes escribir comandos en la terminal:

- `state` - Muestra estado público: jugadores, cartas en mano (resumido), turno actual, color activo, carta superior, dirección
- `players` / `list` - Lista jugadores con su turno (quién va primero/actual/siguiente)
- `hand` - Muestra tu mano completa con IDs de carta
- `draw` - Robar una carta
- `play <cardId> [COLOR]` - Jugar carta. Si es comodín (WILD/WILD4), indica color: `RED|BLUE|GREEN|YELLOW`
- `uno` - Anunciar UNO (cuando tengas 1 carta)
- `ping` - Comprobar conexión
- `quit`/`exit` - Salir

## 6. Pruebas

```powershell
npm test
```

## Notas de red

- Funciona únicamente en red LAN/WiFi. No requiere internet.
- El puerto 5672 debe estar accesible desde clientes al host de RabbitMQ.
- Revisa firewall de Windows si hay problemas de conexión.
- Usa la IP LAN real (no 127.0.0.1) si clientes están en otros equipos.

# Bitácora - UNO.js

## 2026-10-18
- Estructura inicial del proyecto creada.
- Lógica del juego implementada (Card, Deck, Player, TurnManager, RulesEngine, Game).
- Mensajería y servidor/cliente base con RabbitMQ/amqplib.
- Pruebas unitarias básicas ejecutadas con éxito.
- Mejorada interfaz de cliente (comandos: state, players, hand, draw, play, uno, ping, quit).
- Añadidos helpers para mostrar estado claro y lista de turnos.
- Documentación README actualizada con guía completa de ejecución.
- Interfaz de terminal dinámica (host y cliente): tablero que se redibuja solo, menú numérico para jugar cartas, prompt de color para comodines.
- Mensaje GET_HAND añadido; mano privada viaja solo por la cola de reply de cada jugador (nunca a la pública).
- GameServer expone hook onUpdate para re-render del host tras cada acción.
- Sincronización host/cliente verificada: cuando un jugador actúa, el otro ve el cambio en vivo.
- Prueba de integración añadida (host + 2 clientes). Fix: cierre limpio de conexiones (flag closing) y auto-start reemplazado por inicio explícito del host.
- Arregladas las cartas de robo (+2/+4): ahora obligan al siguiente a robar y perder el turno. Implementado apilamiento (un +2 se responde con +2 o +4; un +4 solo con +4; escape forzado: apilar o robar el acumulado). Estado `pendingDraw` reemplaza a `draw2Stack`/`draw4Stack`.
- Corregidos SKIP (salta al siguiente) y REVERSE (invierte y pasa el turno con 3+ jugadores; con 2 actúa como skip). Añadido reciclado del mazo (`_refillDeck`) para no quedarse sin cartas. Añadidas 9 pruebas unitarias de cartas de acción.
- UNO automático: al quedar con 1 carta se asigna solo. Victoria al jugar la última carta (0 cartas) → estado FINISHED con ganador visible en todas las terminales. Añadido `resetForNewRound()` para que el host pueda empezar otra partida tras terminar (reinicia mazo/manos/descarte y vuelve a repartir 7). Añadidas 3 pruebas unitarias (UNO auto, victoria, reinicio).

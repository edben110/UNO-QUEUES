# Configuración de RabbitMQ
Este juego usa RabbitMQ + amqplib. Para desarrollo local, puedes ejecutar RabbitMQ con Docker.

### Usando Docker (recomendado)
```bash
docker run -d --hostname rabbitmq --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management
```
Credenciales por defecto: guest/guest (usuario local).

### Conexión en red LAN
El anfitrión debe compartir su IP LAN. Configura RABBITMQ_HOST en clientes apuntando a esa IP.
Clientes necesitan acceso al puerto AMQP 5672.

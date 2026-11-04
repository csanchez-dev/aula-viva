# Aula Viva

**Repaso anti-olvido para estudiantes de medicina.** El estudiante sube sus apuntes (texto o PDF), la IA los convierte en flashcards y preguntas tipo examen que citan el fragmento del que salen, y un algoritmo de repaso espaciado (FSRS) le pide repasar cada día justo lo que está a punto de olvidar.

El MVP sale de una encuesta a estudiantes de 4.º de Medicina: olvidar lo estudiado es el problema que comparten todos, y las funciones más pedidas son flashcards con repaso espaciado, quizzes con explicación y generar desde sus propios apuntes.

Modelo de negocio: freemium con cuota diaria de generaciones con IA (plan gratis y plan Pro). Repasar no consume cuota.

---

## El ciclo de uso

1. **Nuevo tema:** pega los apuntes o sube un PDF (se extrae el texto para revisarlo antes).
2. **Generación:** los apuntes se dividen en fragmentos numerados; la IA crea tarjetas usando solo esos fragmentos y cada tarjeta guarda de cuál sale.
3. **Revisión:** el estudiante edita, suspende o borra las tarjetas que no le convenzan.
4. **Repaso diario:** una cola con lo que vence hoy y hasta 20 tarjetas nuevas al día. Tras ver la respuesta, el estudiante valora (Otra vez, Difícil, Bien, Fácil) y FSRS calcula cuándo vuelve.
5. **Simulacro:** las preguntas tipo test del tema, con explicación, sin afectar a la planificación.
6. **Progreso:** cada tema muestra cuántas tarjetas domina, cuántas está aprendiendo y cuántas se le están olvidando.

---

## Estructura del monorepo

```
aula-viva/
├── packages/
│   ├── shared/   Contratos entre frontend y backend: esquemas Zod, tipos y reglas puras (fragmentado de apuntes, intervalos)
│   └── ai/       Motor de IA: prompts, proveedores (Anthropic y simulador) y validación de lo que devuelve el modelo
├── apps/
│   ├── api/      API REST en Node + Express con arquitectura limpia y PostgreSQL
│   └── web/      Frontend en React + Vite
├── render.yaml · netlify.toml · .github/workflows/ci.yml   Despliegue
├── docker-compose.yml   PostgreSQL 17 para desarrollo (puerto 5433)
└── .env.example         Variables de entorno
```

### Arquitectura de la API (capas)

```
apps/api/src/
├── domain/           Reglas puras: usuario, cuota, estado de memoria de una tarjeta y resumen de progreso.
├── application/      Casos de uso (CreateTopic, GetReviewQueue, ReviewCard…) y puertos (interfaces).
├── infrastructure/   PostgreSQL, FSRS (ts-fsrs), extracción de PDF (unpdf), bcrypt, JWT, migraciones.
├── interfaces/http/  Express: rutas, middlewares, traducción de errores.
├── container.ts      Composition root: conecta las implementaciones (inyección de dependencias).
└── main.ts           Arranque y cierre ordenado.
```

Las dependencias apuntan siempre hacia dentro: HTTP → aplicación → dominio. La aplicación conoce interfaces (`CardRepository`, `Scheduler`, `AiGenerator`, `PdfTextExtractor`), no PostgreSQL, ts-fsrs ni Anthropic. Por eso los tests usan repositorios en memoria y un reloj falso para simular el paso de los días.

---

## Puesta en marcha

Requisitos: **Node 22.9 o superior** y **Docker** (o un PostgreSQL 13+ propio).

```bash
npm install                     # instala los 4 módulos (workspaces de npm)
cp .env.example .env            # en Windows: copy .env.example .env  → cambia JWT_SECRET
npm run db:up                   # PostgreSQL en Docker, puerto 5433
npm run db:migrate              # crea las tablas
npm run dev                     # API en :3000 y web en :5173
```

Abre http://localhost:5173, crea una cuenta y sube unos apuntes.

### IA real o simulada

Por defecto `AI_PROVIDER=mock`: el simulador crea ejercicios de «completar el hueco» con frases de tus propios apuntes, gratis y sin conexión. Sirve para probar todo el ciclo. Para usar Claude: `AI_PROVIDER=anthropic` y `ANTHROPIC_API_KEY=tu-clave` en `.env`. La clave vive solo en el servidor.

---

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | API y web en modo desarrollo con recarga automática |
| `npm test` | Tests de todos los paquetes (Vitest) |
| `npm run typecheck` | Comprueba los tipos de todo el monorepo |
| `npm run build` | Compila la API (`apps/api/dist`) y la web (`apps/web/dist`) |
| `npm run db:up` / `npm run db:migrate` | Arranca PostgreSQL / aplica migraciones pendientes |
| `npm run make-admin -w @aula-viva/api -- correo@ejemplo.com` | Convierte un usuario en administrador |

---

## API

Todas las rutas cuelgan de `/api`. La sesión viaja en una cookie `httpOnly`.

| Método | Ruta | Descripción |
| --- | --- | --- |
| POST | `/auth/register` · `/auth/login` · `/auth/logout` | Cuenta y sesión |
| GET | `/me` | Perfil y cuota del día |
| GET | `/dashboard` | Pantalla Hoy: pendientes, nuevas disponibles, repasadas hoy y progreso por tema |
| POST | `/notes/extract` | Extrae el texto de un PDF (base64, máx. 10 MB) |
| POST | `/topics` | Crea un tema y lanza la generación (consume cuota). Responde `202` con el trabajo |
| GET / DELETE | `/topics/:id` | Tema con progreso, tarjetas y última generación / borrarlo |
| POST | `/topics/:id/generate` | Más tarjetas de los mismos apuntes, sin repetir (consume cuota) |
| GET | `/topics/:id/quiz` | Preguntas tipo test del tema, barajadas |
| GET | `/jobs/:id` | Estado de una generación: `pending`, `done` o `failed` |
| GET | `/review/queue?topicId=` | Cola de repaso con el intervalo de cada botón |
| POST | `/cards/:id/review` | Valorar una tarjeta (`rating` 1 a 4) |
| PATCH / DELETE | `/cards/:id` | Corregir, suspender o borrar una tarjeta |
| PATCH | `/admin/users/:id/plan` | Cambiar plan (solo administradores) |

Las rutas `/themes` (temas visuales con IA) siguen en la API pero no aparecen en la interfaz del MVP.

Errores siempre con la forma `{ "error": { "code": "QUOTA_EXCEEDED", "message": "..." } }`.

---

## Decisiones de diseño

- **Tarjetas comprobables.** Los apuntes se dividen en fragmentos de ~700 caracteres respetando párrafos. El prompt exige usar solo esa información y citar el número de fragmento; las tarjetas que citan un fragmento inexistente o se repiten se descartan. Es la respuesta a la queja n.º 1 de la encuesta: «la IA se equivoca o inventa».
- **FSRS en lugar de SM-2.** Es el algoritmo actual de Anki: modela estabilidad y dificultad de cada recuerdo y programa el repaso cuando la probabilidad de recordar baja al 90 %. Vive detrás de la interfaz `Scheduler`, así que se puede cambiar.
- **Base de datos.** `topics` → `source_chunks` → `cards` (con el estado FSRS en columnas) → `reviews` (historial). El índice parcial `cards (user_id, due_at) WHERE NOT suspended` sirve la consulta más frecuente: qué toca hoy.
- **Generación asíncrona.** El proxy de Netlify corta a los 26 s. `POST /api/topics` responde al momento y la IA trabaja en segundo plano por lotes de 12 fragmentos. Si el servidor se reinicia, el trabajo se marca como fallido a los 6 minutos y la cuota se devuelve.
- **Cuota sin trampas (ACID).** La reserva bloquea la fila del usuario (`SELECT … FOR UPDATE`) dentro de una transacción.
- **Seguridad.** Contraseñas con bcrypt, JWT en cookie `httpOnly` + `SameSite=Lax`, Helmet, límite de intentos de login, validación con Zod en cliente y servidor, y defensa básica contra prompt injection.

El prototipo anterior (anatomía 2D, temas visuales en la interfaz, mazos por tema) está en la etiqueta de git `v0.1-prototipo`.

## Próximos pasos

- Probar 2 semanas con los beta testers de la encuesta y medir cuántos vuelven a repasar al día siguiente y a la semana.
- Pagos con Stripe: el webhook de suscripción llamará al caso de uso `ChangeUserPlan`.
- Simulaciones animadas de procesos (fisiología cardíaca, farmacocinética): la siguiente función más pedida.
- Cola de trabajos persistente (por ejemplo `pg-boss`) cuando haya tráfico real.
- Revisión del contenido por un profesional antes de abrir a usuarios de pago.

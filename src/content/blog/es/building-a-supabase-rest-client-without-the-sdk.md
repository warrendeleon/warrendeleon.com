---
title: "Construir una integración con Supabase en React Native sin el SDK"
description: "Intro de la serie: por qué construí una integración propia con Supabase en React Native sin el SDK. Auth, refresco de tokens, storage, pinning, enmascarado y RLS."
draft: true
tags: ["react-native", "architecture", "http", "authentication", "supabase"]
locale: es
heroImage: "/images/blog/supabase-rest-client.webp"
heroAlt: "Construir una integración con Supabase en React Native sin el SDK"
campaign: "supabase-rest-client"
relatedPosts: ["token-refresh-race-condition-react-native", "tiered-secure-storage-react-native", "feature-first-project-structure-react-native"]
---

Si quieres entender qué hace de verdad un SDK, el mejor ejercicio es no usarlo.

Este es el ensayo de apertura de una serie sobre cómo construir una integración propia con Supabase en React Native sin el SDK. La serie cubre auth, race conditions en el refresco de tokens, subidas a storage con reintentos, certificate pinning, interceptores que enmascaran PII y el endurecimiento del backend con RLS. Seis tutoriales y este ensayo sobre el *porqué*.

El SDK de Supabase te da auth funcional en tres líneas. Un cliente propio te lleva unas 600. Los dos funcionan. La diferencia está en si puedes ver qué hace la capa de auth cuando algo necesita cambiar.

## Lo que el SDK hace por ti (y lo que te oculta)

El SDK de Supabase gestiona autenticación, storage, consultas a la base de datos y suscripciones en tiempo real. Lo instalas, le pasas la URL de tu proyecto y la anon key, y ya está funcionando. Tres líneas para login, dos para subir un archivo, una para una consulta.

El SDK expone hooks para algunas de las preocupaciones transversales: puedes pasar un adaptador de storage propio con `auth: { storage }` y sobreescribir `global.fetch` en `createClient`. La flexibilidad es real. Aun así, los puntos de integración siguen siendo incómodos:

- **Almacenamiento de tokens.** Por defecto, en React Native es AsyncStorage, en texto plano. Puedes cambiarlo por un adaptador respaldado por el Keychain escribiendo tu propio shim de `getItem`/`setItem`/`removeItem`, pero el SDK llama al adaptador en momentos que no ves, y sigues operando dentro del modelo de sesión del SDK. Auditar qué se guarda en realidad, cuándo y por qué ruta de código significa meterse a depurar el código fuente del SDK.
- **Refresco de tokens.** El SDK refresca los tokens caducados internamente. La lógica de refresco, el mecanismo de reintento y qué pasa cuando cinco peticiones se disparan a la vez con el mismo token caducado viven todos por debajo de tu línea de visibilidad.
- **Forma de los errores.** El SDK lanza sus propios tipos de error. Te llega un string de mensaje y un nombre de clase; mapear eso a un estado útil para la UI, con un código legible por la máquina que sobreviva a las actualizaciones del SDK, es problema tuyo.
- **Capa HTTP.** El SDK acepta una sobreescritura de `global.fetch`, así que puedes envolver las llamadas. Pero los patrones de llamada *internos* del SDK siguen siendo opacos: qué URLs se disparan, en qué orden, con qué comportamiento de reintento. Montar certificate pinning, observabilidad y una cola de refresco sobre el bucle HTTP de otra persona es más difícil que ser tú quien controla el bucle.

Para un prototipo, nada de eso importa. Para una app que tiene que funcionar en producción, con rotación de tokens, redes intermitentes, requisitos de observabilidad y una postura de seguridad real, todo importa.

El SDK es un atajo, y los atajos están bien cuando sabes qué se saltan. La parte interesante de construir esto desde cero es descubrir exactamente cuáles son esas piezas que se saltan.

## Por qué este código está abierto a clientes y empleadores

Mantengo el repo de mi portfolio de React Native en GitHub como registro de cómo pienso sobre la plataforma. Cuando aparece un ejercicio de código o una prueba técnica, el trabajo resultante va al mismo repo, junto al resto del código. Clientes para los que he trabajado, y empleadores con los que he hecho entrevistas, lo han leído todos como parte de evaluar mi trabajo.

Eso convierte al repo en un artefacto vivo, no en un proyecto tutorial. La integración con Supabase es la parte donde las decisiones de producción son más visibles. Las llamadas al SDK muestran que alguien ha leído la documentación. Un cliente REST propio con interceptores tipados, una cola de suscriptores para el refresco de tokens, certificate pinning, validación en runtime y storage seguro por niveles muestra que alguien ha pensado en cómo funcionan las apps móviles de verdad en producción.

Esa visibilidad es la razón de la reconstrucción. Las razones técnicas vienen a partir de ahí.

## Qué cubre esta serie

Seis tutoriales, cada uno sobre una pieza del stack:

1. **Construir un cliente de auth para Supabase basado en Axios.** El cliente base, el interceptor de petición para adjuntar el token, sign-in/up/out, mapeo de errores tipado con `AuthError`, handlers de test con MSW.
2. **Race conditions en el refresco de tokens.** Qué pasa cuando cinco peticiones reciben un 401 a la vez, y el patrón de cola de suscriptores que evita varias llamadas de refresco. Con un test que demuestra que la cola funciona.
3. **Construir un cliente de storage para Supabase con reintentos.** Subidas de archivos con backoff exponencial, gestión del content-type, patrones de subida y borrado de imágenes, tests de reintento.
4. **Certificate pinning en React Native.** TrustKit en iOS, `network_security_config.xml` en Android, extracción de pins, estrategia de rotación sin dejar fuera a los usuarios con binarios ya desplegados.
5. **Interceptores que enmascaran PII.** Logging de breadcrumbs en Sentry que no filtra tokens, emails ni números de teléfono. Patrones regex y un logger personalizado.
6. **Asegurar tu backend de Supabase con RLS.** Políticas de Row Level Security que aguantan bajo presión, seguridad a nivel de función, rate limiting y la superficie de ataque de OWASP-mobile donde casi todo el contenido de "tutorial de Supabase" se queda corto.

Cada post se sostiene por sí solo. Lee los que encajen con lo que estás construyendo. El orden de la serie es el orden en el que yo los construiría.

## Qué se queda en el SDK

Hay una cosa que la API REST no puede hacer: **suscripciones en tiempo real.** Supabase Realtime usa WebSockets, que no puedes manejar desde Axios.

Cuando la feature de chat llegue a mi app, el SDK de Supabase entra para *solo esa feature*. El cliente de auth se queda en Axios. El cliente de storage se queda en Axios. Un import del SDK, contenido en una sola feature, con un alcance claro. Sin esparcirse por toda la app tocando cada capa.

## La contrapartida

Prescindir del SDK significa mantener la lógica de auth contra la API REST de Supabase directamente. Si Supabase cambia un endpoint, el cliente se actualiza. Si aparece un nuevo flujo de auth, se implementa. Es trabajo real, y el SDK lo hace gratis.

Lo que el SDK no hace gratis es *enseñarte* los patrones de producción que hay debajo. El cliente de auth de este código es el archivo más leído del repo, porque es donde el pensamiento de producción está más concentrado. Almacenamiento de tokens por niveles. Una cola de suscriptores para refrescos concurrentes. Tipos de error mapeados sobre los que la UI puede actuar de verdad. HTTP con pinning. Enmascarado de PII de camino a Sentry. Validación en runtime contra el drift del esquema.

Si estás construyendo algo que tiene que durar más allá del prototipo, el resto de esta serie desgrana cada una de esas piezas por turnos.

La implementación completa está en [github.com/warrendeleon/rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), en `src/httpClients/`. Cada post de esta serie se archiva bajo [el tag de supabase en warrendeleon.com](https://warrendeleon.com/blog/tag/supabase/) a medida que se publica.

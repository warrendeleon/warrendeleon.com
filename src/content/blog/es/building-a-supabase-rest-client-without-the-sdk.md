---
title: "Construir un cliente REST para Supabase sin el SDK"
description: "Por qué elegí Axios en lugar del SDK oficial de Supabase para una app React Native. Control total sobre interceptores, refresco de tokens, gestión de errores y la posibilidad de cambiar el backend sin tocar el código de la app."
publishDate: 2026-06-01
tags: ["react-native", "architecture", "http", "authentication"]
locale: es
heroImage: "/images/blog/supabase-rest-client.jpg"
heroAlt: "Construir un cliente REST para Supabase sin el SDK en React Native"
campaign: "supabase-rest-client"
relatedPosts: ["token-refresh-race-condition-react-native", "tiered-secure-storage-react-native", "feature-first-project-structure-react-native"]
---

## Tres líneas de código que me costaron todas las entrevistas

```typescript
const { data } = await supabase.auth.signInWithPassword({ email, password });
```

Eso es el SDK de Supabase. Una línea para autenticación. Una para subida de archivos. Una para consultas a la base de datos. Funciona. Está bien documentado. Y cada vez que un posible cliente abría el código fuente de mi app de portfolio, eso era todo lo que veía.

Llevo años trabajando como contractor. Mi app en React Native no es un proyecto personal. **Es mi portfolio.** Cuando un cliente me pregunta qué sé hacer, le envío este código fuente. Lo abren, leen el código y deciden si contratarme en función de lo que encuentran.

Si encuentran llamadas al SDK, ven a alguien que sabe leer documentación. Si encuentran un cliente REST personalizado con interceptores tipados, gestión de race conditions en el refresco de tokens, certificate pinning y almacenamiento seguro por niveles, ven a alguien que entiende cómo funcionan realmente las apps móviles en producción.

Nunca me planteé usar el SDK. Ni por un momento.

## Lo que el SDK oculta

El SDK de Supabase gestiona autenticación, almacenamiento, consultas a la base de datos y suscripciones en tiempo real. Lo instalas, pasas la URL de tu proyecto y la anon key, y ya está funcionando. Tres líneas para login, dos para subir un archivo, una para una consulta.

Detrás de esas líneas, el SDK toma decisiones que no ves:

- **Dónde se almacenan los tokens.** El SDK usa su propio adaptador de almacenamiento. En React Native, eso suele ser AsyncStorage. Texto plano. Sin cifrado. Sin seguridad respaldada por hardware.
- **Cómo funciona el refresco de tokens.** El SDK gestiona los tokens caducados internamente. No ves la lógica de refresco, el mecanismo de reintento ni qué pasa cuando cinco peticiones se disparan a la vez con tokens caducados.
- **Qué pasa con los errores.** El SDK lanza sus propios tipos de error. Te llega un string con un mensaje y esperas que sea útil.
- **Cómo se hacen las llamadas HTTP.** El SDK usa `fetch` internamente. No puedes añadir interceptores, certificate pinning ni logging de peticiones sin rodear el SDK con workarounds.

Para un prototipo, nada de eso importa. Para una app que representa mis capacidades profesionales ante hiring managers y clientes, **todo importa.**

## El cliente

Una instancia de Axios. Un archivo. El único lugar en toda la app que sabe que Supabase existe.

```typescript
this.axiosInstance = axios.create({
  baseURL: Config.SUPABASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    apikey: Config.SUPABASE_ANON_KEY,
  },
});
```

Cambia la URL base y las rutas de los endpoints, y este cliente habla con un backend completamente distinto. Firebase, AWS Cognito, un servidor Node.js propio. **El resto de la app no se entera.** Sin llamadas al SDK dispersas por 13 features. Sin vendor lock-in. Un solo archivo que cambiar.

Mi app ya habla con dos backends siguiendo el mismo patrón: Supabase para auth y almacenamiento, la API de contenido raw de GitHub para los datos del portfolio. Misma estructura Axios, mismo enfoque de interceptores, misma gestión de errores. El SDK convertiría uno de esos backends en un caso especial.

## Interceptor de petición: tokens desde el enclave seguro

Cada petición autenticada necesita un Bearer token. El interceptor lo lee del **enclave seguro respaldado por hardware** del dispositivo (iOS Keychain / Android Keystore) y lo adjunta automáticamente:

```typescript
this.axiosInstance.interceptors.request.use(async config => {
  const accessToken = await SecureStore.get(SecureStoreKey.ACCESS_TOKEN);
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});
```

No AsyncStorage. No el adaptador de almacenamiento del SDK. El [Keychain](/blog/tiered-secure-storage-react-native/). El mismo sitio donde las apps bancarias de tu móvil guardan sus tokens.

El SDK ignoraría esto por completo. Gestiona su propio almacenamiento de tokens, y en React Native eso significa que tus access tokens quedan en texto plano al lado de tu preferencia de tema. Para una app de portfolio que se supone que demuestra prácticas de seguridad de producción, eso no es aceptable.

## Interceptor de respuesta: la race condition de la que nadie habla

Cuando un access token caduca, Supabase devuelve un 401. Refrescas el token y reintentas la petición. Sencillo.

Hasta que **cinco peticiones se disparan a la vez** y todas reciben 401. Sin coordinación, cada una lanza su propio refresco. Cinco llamadas de refresco. La primera funciona. La segunda falla porque el refresh token ya se usó. Los tokens se sobreescriben. La sesión se rompe. El usuario queda desconectado sin motivo.

El SDK gestiona esto internamente. Nunca lo ves. Tampoco lo ves fallar, y nunca aprendes a solucionarlo.

Mi cliente usa **una cola de suscriptores**:

```typescript
private isRefreshing = false;
private refreshSubscribers: Array<(token: string) => void> = [];
```

La primera petición que detecta un 401 inicia el refresco. Todas las peticiones con 401 posteriores **se encolan y esperan.** Cuando el refresco termina, todas las peticiones en espera reciben el nuevo token y reintentan simultáneamente.

```typescript
if (this.isRefreshing) {
  return new Promise(resolve => {
    this.refreshSubscribers.push((token: string) => {
      originalRequest.headers.Authorization = `Bearer ${token}`;
      resolve(this.axiosInstance(originalRequest));
    });
  });
}

originalRequest._retry = true;
this.isRefreshing = true;

try {
  const { data } = await this.axiosInstance.post(
    '/auth/v1/token?grant_type=refresh_token',
    { refresh_token: refreshToken }
  );

  // Notify all waiting requests
  this.refreshSubscribers.forEach(cb => cb(data.access_token));
  this.refreshSubscribers = [];

  return this.axiosInstance(originalRequest);
} catch (refreshError) {
  await SecureStore.clear(); // Logout on refresh failure
  return Promise.reject(refreshError);
} finally {
  this.isRefreshing = false;
}
```

Tres mecanismos trabajando juntos: el **flag `_retry`** previene bucles infinitos, la **puerta `isRefreshing`** asegura que solo un refresco se ejecuta a la vez, y el **array `refreshSubscribers`** es la cola. Si el refresco falla, se borran los tokens y se cierra la sesión del usuario. Sin estados a medias. Sin fallos silenciosos.

Cuando un cliente abre este archivo y ve la cola de suscriptores, sabe que he lidiado con auth concurrente en producción. Eso no se aprende usando un SDK.

## Cada respuesta se valida

El SDK confía en lo que Supabase devuelve. Mi cliente no.

```typescript
async signIn(request: SupabaseSignInRequest): Promise<SupabaseSignInResponse> {
  const { data } = await this.axiosInstance.post(
    '/auth/v1/token?grant_type=password', request
  );
  return validateResponse(SupabaseSignInResponseSchema, data, 'signIn');
}
```

Cada respuesta de la API pasa por un esquema Zod antes de entrar en la app. Si Supabase cambia el formato de respuesta, mi app lo detecta en la capa de validación con un error claro en lugar de fallar tres capas más abajo con `Cannot read property 'email' of undefined`.

## Errores sobre los que la app puede actuar

El SDK lanza objetos de error con un string de mensaje. Mi cliente mapea cada código de error de Supabase a un `AuthError` con un **mensaje para el usuario** y un **código legible por la máquina**:

```typescript
switch (errorData?.error_code) {
  case 'email_not_confirmed':
    return new AuthError('Email not confirmed', 'email_not_confirmed');
  case 'invalid_credentials':
    return new AuthError('Invalid email or password', 'invalid_credentials');
}

switch (error.response?.status) {
  case 429:
    return new AuthError(
      'Too many attempts. Please try again later.', 'rate_limit_exceeded'
    );
}
```

La UI muestra el mensaje. El store de Redux evalúa el código para decidir qué pantalla mostrar. **Ningún detalle interno de Supabase se filtra a la app.** La capa de gestión de errores es la frontera. Todo lo que hay por encima habla el idioma de la app, no el de Supabase.

## Las subidas reintentan automáticamente

El cliente de almacenamiento sigue el mismo patrón de Axios, con una adición: **backoff exponencial** para las subidas. Las redes móviles se caen. Los túneles existen. Una sola subida fallida no debería significar que el usuario pierde su foto de perfil.

```typescript
for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
  try {
    const { data } = await this.axiosInstance.post(
      `/object/${BUCKET_NAME}/${filePath}`, bytes,
      { headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'true' } }
    );
    return validateResponse(SupabaseUploadResponseSchema, data, 'upload');
  } catch (error) {
    // Don't retry client errors (400-499)
    if (error.response?.status >= 400 && error.response?.status < 500) {
      throw error;
    }
    if (attempt < MAX_RETRIES) {
      await this.sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1));
    }
  }
}
```

Reintenta ante fallos de red y errores de servidor. Falla inmediatamente ante errores de cliente. El SDK no te da este control. O reintenta todo o nada.

## ¿Y el certificate pinning?

El cliente Axios funciona con **certificate pinning** en ambas plataformas (pins SHA-256 en el dominio de Supabase en el `network_security_config.xml` de Android y TrustKit en iOS). Cada llamada HTTP pasa por la conexión con pin. Los ataques MITM no pueden interceptar el tráfico ni en redes comprometidas.

El SDK hace sus propias llamadas HTTP internamente. Esas llamadas no pasarían por la conexión con pin a menos que el SDK lo soporte explícitamente. No lo hace. **El certificate pinning solo funciona cuando tú controlas la capa HTTP.**

Lo mismo aplica a la **observabilidad en producción**. Tengo interceptores de Axios que registran breadcrumbs de peticiones en Sentry, con todos los datos sensibles (tokens, emails, contraseñas) automáticamente enmascarados por un logger personalizado. Las llamadas internas del SDK no usarían mis reglas de enmascaramiento de PII.

## Tests E2E sin red

Mis [tests E2E con Detox](/blog/detox-cucumber-bdd-react-native-e2e-testing/) se ejecutan sin conexión a internet. Toda la capa de API se intercambia por fixtures locales en tiempo de build. Eso solo funciona porque yo controlo el cliente HTTP. Cada método de autenticación tiene una ruta de mock que devuelve datos de fixtures cuando el flag E2E está activo.

Con el SDK, las llamadas de red están enterradas dentro del código de Supabase. No puedo intercambiarlas a nivel de Metro. El SDK necesitaría su propia estrategia de mocking, añadiendo complejidad para algo que mi arquitectura ya resuelve.

## "¿Por qué no React Query?"

Mi app usa **Redux Toolkit como fuente única de verdad.** Estado de auth, perfil de usuario, ajustes, experiencia laboral. Las llamadas a la API pasan por thunks de Redux, que llaman al cliente Axios, que almacena los resultados en el store de Redux. Un sistema de estado, un modelo mental.

Evalué RTK Query como posible migración:

| | Axios + thunks | RTK Query |
|---|---|---|
| **Boilerplate** | ~160 líneas por feature | ~3 líneas por endpoint |
| **Caché** | Manual | Automático con TTL |
| **Mocking E2E** | Simple, por función | Custom baseQuery, más complejo |
| **Coste de migración** | Ninguno | 18+ archivos de tests que reescribir |

Para una app de portfolio con cinco endpoints y datos mayormente estáticos, **el esfuerzo de migración no compensa los beneficios.** RTK Query y React Query se ganan su lugar en apps con decenas de endpoints, refetching frecuente y dashboards en tiempo real. Añadir un segundo sistema de estado para datos que se cargan una vez al arrancar no merece la complejidad.

## Donde el SDK sigue ganando

Hay una cosa que la API REST no puede hacer: **suscripciones en tiempo real.** Supabase Realtime usa WebSockets. No puedes replicar eso con Axios.

Cuando mi app tenga su feature de chat, incorporaré el SDK de Supabase para *solo esa feature*. El cliente de auth se queda con Axios. El cliente de almacenamiento se queda con Axios. **Un import del SDK, contenido en una sola feature.** Sin dispersarse por toda la app.

## La contrapartida

Prescindir del SDK significa mantener la lógica de auth yo mismo. Si Supabase cambia un endpoint, actualizo mi cliente. Si añaden un nuevo flujo de auth, lo implemento. Es trabajo real.

Pero la alternativa es peor: una app que parece como cualquier otro proyecto tutorial con SDK. Cuando un cliente está eligiendo entre contractors, el que demuestra patrones de producción en su portfolio (certificate pinning, colas de refresco de tokens, almacenamiento por niveles, validación en runtime) **gana frente al que instaló un SDK y lo dio por terminado.**

El SDK es un atajo. Los atajos están bien cuando sabes lo que te saltas. El problema es cuando la persona que evalúa tu código *también* sabe lo que te saltas.

La implementación completa está en [github.com/warrendeleon/rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), en `src/httpClients/`.

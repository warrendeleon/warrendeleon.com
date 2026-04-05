---
title: "Construir un client REST de Supabase sense el SDK"
description: "Per què vaig triar Axios en lloc del SDK oficial de Supabase per a una app React Native. Control total sobre interceptors, renovació de tokens, gestió d'errors, i la capacitat de canviar el backend sense tocar el codi de l'app."
publishDate: 2026-05-25
tags: ["react-native", "typescript", "architecture", "tutorial"]
locale: ca
heroImage: "/images/blog/supabase-rest-client.jpg"
heroAlt: "Construir un client REST de Supabase sense el SDK a React Native"
campaign: "supabase-rest-client"
---

## Tres línies de codi que em van costar totes les entrevistes

```typescript
const { data } = await supabase.auth.signInWithPassword({ email, password });
```

Això és el SDK de Supabase. Una línia per a autenticació. Una per a pujada de fitxers. Una per a consultes a base de dades. Funciona. Està ben documentat. I cada cop que un client potencial obria el codi font de la meva app de portafoli, era tot el que veia.

Fa anys que treballo com a contractista. La meva app React Native no és un projecte personal. **És el meu portafoli.** Quan un client em pregunta què sé fer, li envio aquest codi. L'obren, el llegeixen, i decideixen si em contracten basant-se en el que hi troben.

Si hi troben crides al SDK, veuen algú que sap llegir documentació. Si hi troben un client REST personalitzat amb interceptors tipats, gestió de condicions de carrera en la renovació de tokens, certificate pinning i emmagatzematge segur per nivells, veuen algú que entén com funcionen de debò les apps mòbils en producció.

No vaig considerar fer servir el SDK ni un moment.

## Què amaga el SDK

El SDK de Supabase gestiona autenticació, emmagatzematge, consultes a base de dades i subscripcions en temps real. L'instal·les, li passes la URL del projecte i la clau anon, i ja funciona. Tres línies per fer login, dues per pujar un fitxer, una per a una consulta.

Darrere d'aquestes línies, el SDK pren decisions que no veus:

- **On s'emmagatzemen els tokens.** El SDK fa servir el seu propi adaptador d'emmagatzematge. A React Native, normalment és AsyncStorage. Text pla. Sense xifrar. Sense seguretat recolzada per hardware.
- **Com funciona la renovació de tokens.** El SDK gestiona els tokens expirats internament. No veus la lògica de renovació, el mecanisme de reintent, ni què passa quan cinc peticions es disparen simultàniament amb tokens expirats.
- **Què passa amb els errors.** El SDK llança els seus propis tipus d'error. Reps una cadena de text amb el missatge i esperes que sigui útil.
- **Com es fan les crides HTTP.** El SDK fa servir `fetch` internament. No pots afegir interceptors, certificate pinning ni registre de peticions sense haver de fer workarounds sobre el SDK.

Per a un prototip, res d'això importa. Per a una app que representa les meves capacitats professionals davant de responsables de contractació i clients, **tot importa.**

## El client

Una instància d'Axios. Un fitxer. L'únic lloc de tota l'app que sap que Supabase existeix.

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

Canvia la URL base i les rutes dels endpoints, i aquest client parla amb un backend completament diferent. Firebase, AWS Cognito, un servidor Node.js propi. **La resta de l'app no se n'assabenta.** Cap crida al SDK escampada per 13 funcionalitats. Cap dependència de proveïdor. Un sol fitxer per canviar.

La meva app ja parla amb dos backends seguint el mateix patró: Supabase per a autenticació i emmagatzematge, l'API de contingut raw de GitHub per a dades del portafoli. Mateixa estructura Axios, mateixa estratègia d'interceptors, mateixa gestió d'errors. El SDK convertiria un d'aquests backends en un cas especial.

## Interceptor de petició: tokens des de l'enclavament segur

Cada petició autenticada necessita un token Bearer. L'interceptor el llegeix de l'**enclavament segur recolzat per hardware** del dispositiu (iOS Keychain / Android Keystore) i l'adjunta automàticament:

```typescript
this.axiosInstance.interceptors.request.use(async config => {
  const accessToken = await SecureStore.get(SecureStoreKey.ACCESS_TOKEN);
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});
```

No AsyncStorage. No l'adaptador d'emmagatzematge del SDK. El [Keychain](/blog/tiered-secure-storage-react-native/). El mateix lloc on les apps bancàries del teu mòbil emmagatzemen els seus tokens.

El SDK ignoraria tot això. Gestiona el seu propi emmagatzematge de tokens, i a React Native vol dir que els teus tokens d'accés queden en text pla al costat de la teva preferència de tema. Per a una app de portafoli que ha de demostrar pràctiques de seguretat de producció, no és acceptable.

## Interceptor de resposta: la condició de carrera de la qual ningú parla

Quan un token d'accés expira, Supabase retorna un 401. Renoves el token i reintentes la petició. Senzill.

Fins que **cinc peticions es disparen al mateix temps** i totes reben 401. Sense coordinació, cadascuna dispara la seva pròpia renovació. Cinc crides de renovació. La primera funciona. La segona falla perquè el refresh token ja s'ha fet servir. Els tokens se sobreescriuen. La sessió es trenca. L'usuari es desconnecta sense motiu.

El SDK ho gestiona internament. Mai ho veus. Tampoc veus quan falla, i mai aprens a arreglar-ho.

El meu client fa servir **una cua de subscriptors**:

```typescript
private isRefreshing = false;
private refreshSubscribers: Array<(token: string) => void> = [];
```

La primera petició que detecta un 401 inicia la renovació. Cada 401 posterior **s'afegeix a la cua i espera.** Quan la renovació acaba, totes les peticions en espera reben el nou token i reintenten simultàniament.

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

Tres mecanismes treballant junts: el **flag `_retry`** prevé bucles infinits, la **porta `isRefreshing`** assegura que només una renovació s'executa a la vegada, i l'**array `refreshSubscribers`** és la cua. Si la renovació falla, els tokens s'esborren i l'usuari es desconnecta. Cap estat a mitges. Cap error silenciós.

Quan un client obre aquest fitxer i veu la cua de subscriptors, sap que he tractat amb autenticació concurrent en producció. Això no s'aprèn d'un SDK.

## Cada resposta es valida

El SDK confia en tot el que Supabase retorna. El meu client, no.

```typescript
async signIn(request: SupabaseSignInRequest): Promise<SupabaseSignInResponse> {
  const { data } = await this.axiosInstance.post(
    '/auth/v1/token?grant_type=password', request
  );
  return validateResponse(SupabaseSignInResponseSchema, data, 'signIn');
}
```

Cada resposta de l'API passa per un esquema Zod abans d'entrar a l'app. Si Supabase canvia el format de resposta, la meva app ho detecta a la capa de validació amb un error clar, en lloc de petar tres capes més avall amb `Cannot read property 'email' of undefined`.

## Errors sobre els quals l'app pot actuar

El SDK llança objectes d'error amb una cadena de text. El meu client mapeja cada codi d'error de Supabase a un `AuthError` amb un **missatge per a l'usuari** i un **codi llegible per la màquina**:

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

La UI mostra el missatge. El store de Redux fa switch sobre el codi per decidir quina pantalla mostrar. **Cap detall intern de Supabase arriba a l'app.** La capa de gestió d'errors és la frontera. Tot el que queda per sobre parla el llenguatge de l'app, no el de Supabase.

## Les pujades es reintenten automàticament

El client d'emmagatzematge segueix el mateix patró Axios, amb una addició: **backoff exponencial** per a pujades. Les xarxes mòbils cauen. Hi ha túnels. Una sola pujada fallida no hauria de significar que l'usuari perd la seva foto de perfil.

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

Reintent en errors de xarxa i errors del servidor. Falla immediatament en errors del client. El SDK no et dona aquest control. O ho reintenta tot o res.

## I el certificate pinning?

El client Axios funciona amb **certificate pinning** a les dues plataformes (pins SHA-256 sobre el domini de Supabase al `network_security_config.xml` d'Android i al TrustKit d'iOS). Cada crida HTTP passa per la connexió fixada. Els atacs MITM no poden interceptar el tràfic ni en xarxes compromeses.

El SDK fa les seves pròpies crides HTTP internament. Aquestes crides no passarien per la connexió fixada tret que el SDK ho suporti explícitament. No ho fa. **El certificate pinning només funciona quan controles la capa HTTP.**

El mateix aplica per a l'**observabilitat en producció**. Tinc interceptors d'Axios que registren breadcrumbs de peticions a Sentry, amb totes les dades sensibles (tokens, correus, contrasenyes) emmascarades automàticament per un logger personalitzat. Les crides internes del SDK no farien servir les meves regles d'emmascarament de PII.

## Tests E2E sense xarxa

Els meus [tests E2E amb Detox](/blog/detox-cucumber-bdd-react-native-e2e-testing/) s'executen sense connexió de xarxa. Tota la capa d'API es canvia per fixtures locals en temps de build. Això només funciona perquè controlo el client HTTP. Cada mètode d'autenticació té un camí amb dades simulades que retorna fixtures quan el flag E2E està actiu.

Amb el SDK, les crides de xarxa estan enterrades dins del codi de Supabase. No les puc intercanviar a nivell de Metro. El SDK necessitaria la seva pròpia estratègia de simulació, afegint complexitat per a alguna cosa que la meva arquitectura ja resol.

## "Per què no React Query?"

La meva app fa servir **Redux Toolkit com a única font de veritat.** Estat d'autenticació, perfil d'usuari, configuració, experiència laboral. Les crides a l'API passen per thunks de Redux, que criden el client Axios, que emmagatzema els resultats al store de Redux. Un sol sistema d'estat, un sol model mental.

Vaig avaluar RTK Query com a migració:

| | Axios + thunks | RTK Query |
|---|---|---|
| **Boilerplate** | ~160 línies per funcionalitat | ~3 línies per endpoint |
| **Cache** | Manual | Automàtic amb TTL |
| **Simulació E2E** | Simple, per funció | Custom baseQuery, més complex |
| **Cost de migració** | Cap | 18+ fitxers de tests per reescriure |

Per a una app de portafoli amb cinc endpoints i dades majoritàriament estàtiques, **l'esforç de migració supera els beneficis.** RTK Query i React Query guanyen el seu lloc en apps amb desenes d'endpoints, refetching freqüent i dashboards en temps real. Afegir un segon sistema d'estat per a dades que es carreguen un cop a l'inici no val la complexitat.

## On el SDK encara guanya

Hi ha una cosa que l'API REST no pot fer: **subscripcions en temps real.** Supabase Realtime fa servir WebSockets. No ho pots replicar amb Axios.

Quan la meva app tingui la funcionalitat de xat, incorporaré el SDK de Supabase per a *només aquesta funcionalitat*. El client d'autenticació es queda amb Axios. El client d'emmagatzematge es queda amb Axios. **Un sol import del SDK, contingut a una sola funcionalitat.** No escampat per tota l'app.

## El compromís

Saltar-se el SDK vol dir mantenir la lògica d'autenticació jo mateix. Si Supabase canvia un endpoint, actualitzo el meu client. Si afegeixen un nou flux d'autenticació, l'implemento. Això és feina real.

Però l'alternativa és pitjor: una app que sembla qualsevol altre projecte de tutorial amb SDK. Quan un client tria entre contractistes, el que té un portafoli que mostra patrons de producció (certificate pinning, cues de renovació de tokens, emmagatzematge per nivells, validació en temps d'execució) **guanya al que ha instal·lat un SDK i ho ha donat per acabat.**

El SDK és una drecera. Les dreceres van bé quan saps què es deixen. El problema és quan la persona que avalua el teu codi *també* sap què es deixen.

La implementació completa és a [github.com/warrendeleon/rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), dins de `src/httpClients/`.

---
title: "Construir una integració de Supabase a React Native sense el SDK"
description: "Introducció a la sèrie: per què vaig construir una integració personalitzada de Supabase a React Native sense el SDK. Auth, renovació de tokens, storage, pinning, emmascarament i RLS."
draft: true
tags: ["react-native", "architecture", "http", "authentication", "supabase"]
locale: ca
heroImage: "/images/blog/supabase-rest-client.webp"
heroAlt: "Construir una integració de Supabase a React Native sense el SDK"
campaign: "supabase-rest-client"
relatedPosts: ["token-refresh-race-condition-react-native", "tiered-secure-storage-react-native", "feature-first-project-structure-react-native"]
---

Si vols entendre què fa realment un SDK, el millor exercici és no fer-lo servir.

Aquest és l'assaig d'obertura d'una sèrie sobre construir una integració personalitzada de Supabase a React Native sense el SDK. La sèrie cobreix auth, condicions de carrera en la renovació de tokens, pujades a storage amb reintent, certificate pinning, interceptors d'emmascarament de PII i enduriment del backend amb RLS. Sis tutorials i aquest assaig sobre el *perquè*.

El SDK de Supabase et dona auth funcional en tres línies. Un client personalitzat en demana unes 600. Tots dos funcionen. La diferència és si pots veure què fa la capa d'auth quan alguna cosa ha de canviar.

## Què fa el SDK per tu (i què t'amaga)

El SDK de Supabase gestiona autenticació, storage, consultes a base de dades i subscripcions en temps real. L'instal·les, li passes la URL del projecte i la clau anon, i ja funciona. Tres línies per fer login, dues per pujar un fitxer, una per a una consulta.

El SDK exposa punts d'enganxament per a algunes de les preocupacions transversals: pots passar un adaptador de storage personalitzat amb `auth: { storage }` i sobreescriure `global.fetch` a `createClient`. La flexibilitat és real. Els punts d'integració segueixen sent incòmodes:

- **Storage de tokens.** El valor per defecte a React Native és AsyncStorage, en text pla. El pots canviar per un adaptador recolzat pel Keychain escrivint el teu propi shim de `getItem`/`setItem`/`removeItem`, però el SDK crida l'adaptador en moments que no pots veure, i continues operant dins del model de sessió del SDK. Auditar què s'emmagatzema de debò, quan i en quin camí de codi vol dir traçar el codi font del SDK.
- **Renovació de tokens.** El SDK renova els tokens expirats internament. La lògica de renovació, el mecanisme de reintent i què passa quan cinc peticions es disparen simultàniament amb el mateix token expirat queden tots per sota de la teva línia de visibilitat.
- **Formes dels errors.** El SDK llança els seus propis tipus d'error. Reps una cadena de text amb el missatge i un nom de classe; mapejar això a un estat amigable per a la UI amb un codi llegible per la màquina que sobrevisqui a les actualitzacions del SDK és problema teu.
- **Capa HTTP.** El SDK accepta una sobreescriptura de `global.fetch`, així que pots embolcallar les crides. Però els patrons de crida *interns* del SDK continuen sent opacs: quines URLs es disparen, en quin ordre, amb quin comportament de reintent. Posar certificate pinning, observabilitat i una cua de renovació a sobre del bucle HTTP d'un altre és més difícil que ser-ne tu el propietari.

Per a un prototip, res d'això importa. Per a una app que ha de funcionar en producció, amb rotació de tokens, xarxes intermitents, requisits d'observabilitat i una postura de seguretat real, tot importa.

El SDK és una drecera, i les dreceres van bé quan saps què es deixen. La part interessant de construir això des de zero és descobrir exactament quines són aquestes peces que es deixen.

## Per què aquest codi és obert a clients i ocupadors

Mantinc el repo del meu portafoli de React Native a GitHub com a registre de com penso sobre la plataforma. Quan apareix un exercici de codi o una prova tècnica, el treball resultant va al mateix repo, al costat de la resta del codi. Clients per als quals he treballat, i ocupadors amb qui he fet entrevistes, l'han llegit tots com a part de l'avaluació de la meva feina.

Això converteix el repo en un artefacte viu, no en un projecte de tutorial. La integració de Supabase és la part on les decisions de producció són més visibles. Les crides al SDK mostren que algú ha llegit la documentació. Un client REST personalitzat amb interceptors tipats, una cua de subscriptors per a la renovació de tokens, certificate pinning, validació en temps d'execució i storage segur per nivells mostra que algú ha pensat com funcionen de debò les apps mòbils en producció.

Aquesta visibilitat és la raó de la reconstrucció. Les raons tècniques se'n deriven.

## Què cobreix aquesta sèrie

Sis tutorials, cadascun sobre una peça de l'stack:

1. **Construir un client d'auth de Supabase basat en Axios.** El client base, l'interceptor de petició per adjuntar el token, sign-in/up/out, mapeig d'errors tipat amb `AuthError`, handlers de test amb MSW.
2. **Condicions de carrera en la renovació de tokens.** Què passa quan cinc peticions reben un 401 simultàniament, i el patró de cua de subscriptors que evita múltiples crides de renovació. Amb un test que demostra que la cua funciona.
3. **Construir un client de storage de Supabase amb reintent.** Pujades de fitxers amb backoff exponencial, gestió del content-type, patrons de pujada i esborrat d'imatges, tests de reintent.
4. **Certificate pinning a React Native.** TrustKit a iOS, `network_security_config.xml` a Android, extracció de pins, estratègia de rotació sense deixar fora els usuaris en binaris ja desplegats.
5. **Interceptors d'emmascarament de PII.** Registre de breadcrumbs a Sentry que no filtra tokens, correus ni números de telèfon. Patrons regex i un logger personalitzat.
6. **Assegurar el backend de Supabase amb RLS.** Polítiques de Row Level Security que aguanten sota pressió, seguretat a nivell de funció, limitació de freqüència i la superfície d'atac d'OWASP-mobile que la majoria de contingut de "tutorial de Supabase" deixa de banda.

Cada post funciona pel seu compte. Llegeix els que encaixin amb el que estàs construint. L'ordre de la sèrie és l'ordre en què jo els construiria.

## Què es queda al SDK

Hi ha una cosa que l'API REST no pot fer: **subscripcions en temps real.** Supabase Realtime fa servir WebSockets, que no pots gestionar des d'Axios.

Quan la funcionalitat de xat arribi a la meva app, el SDK de Supabase entrarà per a *només aquesta funcionalitat*. El client d'auth es queda amb Axios. El client de storage es queda amb Axios. Un sol import del SDK, contingut a una sola funcionalitat, amb un abast clar. No escampat per tota l'app tocant cada capa.

## El compromís

Saltar-se el SDK vol dir mantenir la lògica d'auth contra l'API REST de Supabase directament. Si Supabase canvia un endpoint, el client s'actualitza. Si apareix un nou flux d'auth, s'implementa. Això és feina real, i el SDK ho fa de franc.

El que el SDK no fa de franc és *ensenyar-te* els patrons de producció de sota. El client d'auth d'aquest codi és el fitxer més llegit del repo, perquè és on el pensament de producció està més concentrat. Storage de tokens per nivells. Una cua de subscriptors per a renovacions concurrents. Tipus d'error mapejats sobre els quals la UI pot actuar de debò. HTTP fixat. Emmascarament de PII de camí cap a Sentry. Validació en temps d'execució contra la deriva de l'esquema.

Si estàs construint alguna cosa que ha de durar més enllà del prototip, la resta d'aquesta sèrie desgrana cadascuna d'aquestes peces al seu torn.

La implementació completa és a [github.com/warrendeleon/rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), dins de `src/httpClients/`. Cada post d'aquesta sèrie queda arxivat sota [l'etiqueta supabase a warrendeleon.com](https://warrendeleon.com/blog/tag/supabase/) a mesura que es publica.

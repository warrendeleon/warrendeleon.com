---
title: "Pagbuo ng Supabase integration sa React Native nang walang SDK"
description: "Series intro: bakit gumawa ako ng custom Supabase integration sa React Native nang walang SDK. Auth, token refresh, storage, pinning, masking, RLS."
draft: true
tags: ["react-native", "architecture", "http", "authentication", "supabase"]
locale: tl
heroImage: "/images/blog/supabase-rest-client.webp"
heroAlt: "Pagbuo ng Supabase integration sa React Native nang walang SDK"
campaign: "supabase-rest-client"
relatedPosts: ["token-refresh-race-condition-react-native", "tiered-secure-storage-react-native", "feature-first-project-structure-react-native"]
---

Kung gusto mong maintindihan kung ano talaga ang ginagawa ng isang SDK, ang pinakamagandang ehersisyo ay ang hindi ito gamitin.

Ito ang opening essay sa isang series tungkol sa pagbuo ng custom Supabase integration sa React Native nang walang SDK. Sinasaklaw ng series ang auth, token refresh race conditions, storage uploads na may retry, certificate pinning, PII-masking interceptors, at backend hardening gamit ang RLS. Anim na tutorial at ang essay na ito tungkol sa *bakit*.

Binibigay sa iyo ng Supabase SDK ang gumaganang auth sa tatlong linya. Ang custom client ay umaabot sa mga 600. Parehong gumagana. Ang pagkakaiba ay kung kaya mong makita kung ano ang ginagawa ng auth layer kapag may kailangang baguhin.

## Ano ang ginagawa ng SDK para sa iyo (at ano ang itinatago nito sa iyo)

Hina-handle ng Supabase SDK ang authentication, storage, database queries, at real-time subscriptions. I-install ito, ipasa ang iyong project URL at anon key, at tumatakbo ka na. Tatlong linya para sa login, dalawa para sa file upload, isa para sa query.

Naglalantad ang SDK ng mga hook para sa ilan sa mga cross-cutting concern: maaari kang magpasa ng custom storage adapter sa pamamagitan ng `auth: { storage }` at i-override ang `global.fetch` sa `createClient`. Totoo ang flexibility. Pero awkward pa rin ang mga integration point:

- **Token storage.** Ang default sa React Native ay AsyncStorage, plain text. Maaari mo itong palitan ng Keychain-backed adapter sa pamamagitan ng pagsulat ng sarili mong `getItem`/`setItem`/`removeItem` shim, pero tinatawag ng SDK ang adapter sa mga sandaling hindi mo nakikita, at nasa loob ka pa rin ng session model ng SDK. Ang pag-audit kung ano talaga ang naka-store, kailan, at sa aling code path ay nangangahulugang i-step through mo ang SDK source.
- **Token refresh.** Nire-refresh ng SDK ang expired na tokens internally. Ang refresh logic, ang retry mechanism, at kung ano ang nangyayari kapag limang requests ang nag-fire nang sabay-sabay gamit ang parehong expired token, lahat ay nasa ibaba ng iyong visibility line.
- **Error shapes.** Nagtha-throw ang SDK ng sarili nitong error types. Nakukuha mo ang isang message string at isang class name; ang pag-map niyan sa isang UI-friendly na state na may machine-readable na code na nakakaligtas sa mga SDK upgrade ay problema mo.
- **HTTP layer.** Tumatanggap ang SDK ng `global.fetch` override, kaya maaari mong balutin ang mga call. Pero ang *internal* na call patterns ng SDK ay opaque pa rin: aling mga URL ang nag-fire, sa anong order, at may anong retry behaviour. Ang paglalagay ng certificate pinning, observability, at refresh queue sa ibabaw ng HTTP loop ng iba ay mas mahirap kaysa sa pag-aari mo mismo ng loop.

Para sa isang prototype, wala namang halaga ang alinman doon. Para sa isang app na kailangang umandar sa production, na may token rotation, intermittent na networks, mga observability requirement, at totoong security posture, lahat niyan ay mahalaga.

Ang SDK ay isang shortcut, at okay ang mga shortcut kapag alam mo kung ano ang nilalaktawan nila. Ang interesanteng bahagi ng pagbuo nito mula sa simula ay ang pagtuklas kung ano nga ba ang mga nilaktawang piraso na iyon.

## Bakit bukas ang codebase na ito sa mga client at employer

Itinatago ko ang aking React Native portfolio repo sa GitHub bilang record kung paano ako mag-isip tungkol sa platform. Kapag may dumating na coding exercise o tech test, ang resultang trabaho ay napupunta sa parehong repo, kasama ng iba pang bahagi ng codebase. Ang mga client na pinagtrabahuhan ko bilang contractor, at ang mga employer na ininterview ako, lahat ay nagbasa nito bilang bahagi ng pag-evaluate sa aking trabaho.

Ginagawa niyan ang repo na isang buhay na artefact, hindi isang tutorial project. Ang Supabase integration ang bahagi nito kung saan pinaka-nakikita ang mga production decision. Ang mga SDK call ay nagpapakita na may nagbasa ng docs. Ang custom REST client na may typed interceptors, token-refresh subscriber queue, certificate pinning, runtime validation, at tiered secure storage ay nagpapakita na may nag-isip kung paano talaga umaandar ang mga mobile app sa production.

Ang visibility na iyon ang dahilan ng rebuild. Ang mga teknikal na dahilan ay sumusunod mula doon.

## Ano ang sinasaklaw ng series na ito

Anim na tutorial, bawat isa ay tungkol sa isang piraso ng stack:

1. **Pagbuo ng Axios-based Supabase auth client.** Ang base client, request interceptor para sa token attachment, sign-in/up/out, typed error mapping gamit ang `AuthError`, MSW test handlers.
2. **Token refresh race conditions.** Kung ano ang nangyayari kapag limang requests ang nakakuha ng 401 nang sabay-sabay, at ang subscriber queue pattern na pumipigil sa maramihang refresh calls. May test na nagpapatunay na gumagana ang queue.
3. **Pagbuo ng Supabase storage client na may retry.** File uploads na may exponential backoff, content-type handling, image upload + delete patterns, retry tests.
4. **Certificate pinning sa React Native.** TrustKit sa iOS, `network_security_config.xml` sa Android, pin extraction, rotation strategy nang hindi nila-lock out ang mga user sa mga naka-deploy na binary.
5. **PII-masking interceptors.** Sentry breadcrumb logging na hindi nagle-leak ng tokens, emails, o phone numbers. Regex patterns at custom logger.
6. **Pag-secure ng iyong Supabase backend gamit ang RLS.** Row Level Security policies na kayang tumagal sa ilalim ng presyon, function-level security, rate limiting, at ang OWASP-mobile attack surface na karaniwang hindi na inaabot ng karamihan sa "Supabase tutorial" content.

Bawat post ay tumatayo nang mag-isa. Basahin ang mga tumutugma sa iyong binubuo. Ang order ng series ay ang order kung paano ko ito bubuuin.

## Ano ang nananatili sa SDK

May isang bagay na hindi kaya ng REST API: **real-time subscriptions.** Gumagamit ang Supabase Realtime ng WebSockets, na hindi mo kayang patakbuhin mula sa Axios.

Kapag dumating ang chat feature sa app ko, papasok ang Supabase SDK para *sa isang feature lang na iyon*. Mananatiling Axios ang auth client. Mananatiling Axios ang storage client. Isang SDK import, contained sa isang feature, na may malinaw na scope. Hindi nakakalat sa buong app na humahawak sa bawat layer.

## Ang trade-off

Ang pag-skip sa SDK ay nangangahulugang ima-maintain ang auth logic laban sa REST API ng Supabase nang direkta. Kung baguhin ng Supabase ang isang endpoint, ina-update ang client. Kung may lumitaw na bagong auth flow, ini-implement ito. Totoong trabaho iyan, at ginagawa ito ng SDK nang libre.

Ang hindi ginagawa ng SDK nang libre ay ang *ipakita* sa iyo ang mga production pattern sa ilalim. Ang auth client sa codebase na ito ang pinaka-binabasang file sa repo, dahil dito pinaka-nakatuon ang production thinking. Tiered token storage. Subscriber queue para sa concurrent refreshes. Mapped error types na kayang pag-aksyunan ng UI. Pinned HTTP. PII masking papunta sa Sentry. Runtime validation laban sa schema drift.

Kung may binubuo kang kailangang tumagal lampas sa prototype, binubuksan ng natitirang bahagi ng series na ito ang bawat isa sa mga pirasong iyon nang paisa-isa.

Ang buong implementation ay nasa [github.com/warrendeleon/rn-warrendeleon](https://github.com/warrendeleon/rn-warrendeleon), sa `src/httpClients/`. Bawat post sa series na ito ay naka-file sa ilalim ng [supabase tag sa warrendeleon.com](https://warrendeleon.com/blog/tags/supabase/) habang nila-lalabas ito.

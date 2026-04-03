---
title: "Paano pumasa sa React Native tech test"
description: "Mga practical na advice mula sa taong nagrereview ng take-home tech test submissions. Ano ang talagang mahalaga, ano ang hindi, at ang mga pagkakamaling nagko-cost ng trabaho sa mga kandidato."
publishDate: 2026-04-07
tags: ["react-native", "pagkuha-ng-empleyado", "career-advice"]
locale: tl
heroImage: "/images/blog/react-native-tech-test-tips.jpg"
heroAlt: "Paano pumasa sa React Native tech test"
hiringUrl: "/hiring/"
hiringText: "We're looking for React Native engineers to join the Mobile Platform team at Hargreaves Lansdown."
---

## Ito ay mula sa kabilang panig ng mesa

Nagrereview ako ng React Native tech test submissions. Nakita ko na kung ano ang nagpapa-hire sa mga tao at kung ano ang nagpapa-reject. Karamihan ng mga rejection ay hindi dahil hindi marunong mag-code ang kandidato. Dahil hindi nila ipinakita ang tamang mga bagay.

Ang post na ito ang advice na ibibigay ko sa isang kaibigan bago mag-submit ng take-home test. Hindi ito theory. Mga specific at practical na bagay na magdadala sa iyo mula sa "baka" patungo sa "oo."

*Sumulat ako tungkol sa kung bakit ko ni-redesign ang isang tech test mula sa perspektibo ng hiring manager sa [ibang post](/tl/blog/why-i-redesigned-our-react-native-tech-test-in-my-first-week/). Ito naman ang kabilang panig: paano pumasa sa isa.*

## Basahin ang brief nang dalawang beses. Tapos basahin mo ulit.

Mukhang obvious. Ito ang pinakakaraniwang pagkakamali.

Kung sinabi ng brief na "gumawa ng tatlong screens na may navigation," huwag kang gumawa ng dalawa lang. Kung sinabi nito na "gamitin ang TypeScript," huwag kang gagamit ng JavaScript. Kung sinabi nito na "mag-manage ng list na hanggang 6 items," siguraduhing ang pag-add ng ika-7 ay naha-handle nang maayos.

**Tini-check ng mga reviewer ang requirements parang checklist.** Bawat nawawalang requirement ay nawawalang puntos. Hindi dahil picky kami, kundi dahil ang pagsunod sa spec ay bahagi ng trabaho. Kung namimiss mo ang requirements sa isang tech test na may malinaw na brief, ano pa kaya sa isang malabong Jira ticket?

Basahin ang brief bago ka mag-start. Basahin ulit sa kalahati. Basahin ng isang huling beses bago mo i-submit.

## Mas importante ang project structure kaysa sa akala mo

Ang unang ginagawa ko kapag binuksan ko ang isang submission ay tignan ang folder structure. Bago ko basahin kahit isang linya ng code, sinasabi na sa akin ng structure kung paano ka mag-isip.

**Type-first structure** (screens/, components/, hooks/, services/):
```
src/
  components/
  hooks/
  screens/
  services/
  types/
```

**Feature-first structure** (bawat feature ay self-contained):
```
src/
  features/
    product-list/
    product-detail/
    favourites/
  shared/
    components/
    hooks/
```

Wala namang mali sa kahit alin. Pero ang feature-first ay nagpapakita na nag-isip ka kung paano mag-scale ang app. Kung tatanungin kita ng "ano ang mangyayari kapag 5 teams ang nagta-trabaho sa codebase na ito?" at sinasagot na ng structure mo ang tanong na iyon, nangunguna ka na.

> 🚩 **Red flag:** Lahat ng files nasa isang flat na `src/` folder na walang organisasyon. Nagsu-suggest ito na nagsimula ang coding bago naplano ang architecture.

## Hindi optional ang TypeScript

Kahit sabihin ng brief na "TypeScript preferred," ituturing mo itong required. Ang pag-submit ng plain JavaScript sa 2026 ay automatic na downgrade.

Pero hindi sapat ang paggamit lang ng TypeScript. Gamitin mo ito nang *maayos*:

- **I-type ang props mo.** Bawat component ay dapat may typed props interface.
- **I-type ang API responses mo.** Huwag gumamit ng `any` para sa data na bumabalik mula sa server.
- **I-type ang navigation params mo.** May excellent na TypeScript support ang React Navigation. Gamitin mo.

Ang isang `any` na patatawarin ko: mga complex na third-party library types na aabutin ng isang oras para malaman. Aminin mo ito sa isang comment. *"// TODO: i-type ito nang maayos — naubusan ng oras"* ay mas maganda kaysa magkunwaring wala itong problema.

> 🚩 **Red flag:** `any` na nakakalat sa buong codebase na walang acknowledgment.

## State management: pumili ka at panindigan mo

Hindi ko pakialam kung gagamit ka ng Redux Toolkit, Zustand, React Context, o Jotai. Ang mahalaga ay pinili mo ito nang sinadya at kaya mong i-explain kung bakit.

- **Context** para sa three-screen app? Perfectly reasonable. Magaan, walang dependencies.
- **Redux Toolkit** para sa three-screen app? Okay lang, pero tatanungin kita kung bakit. Kung sasabihin mo "kasi yun ang pinaka-alam ko," matapat na sagot iyon. Kung sasabihin mo "kasi yun ang pinakamainam," mas mahinang sagot iyon.
- **Zustand** na may malinis na store? Nagpapakita na updated ka sa ecosystem.

Kung pipiliin mo ang Redux, **gamitin mo ang Redux Toolkit**. Hindi yung lumang `switch/case` reducer pattern. Kung makita kong `createStore` sa halip na `configureStore`, o manual na action type constants sa halip na `createSlice`, nagsu-suggest ito na ang Redux knowledge ay maaaring kailangan ng pag-refresh.

**Ihiwalay ang concerns mo.** Kung gumagamit ka ng Redux Toolkit, hatiin ito sa `actions.ts`, `reducers.ts`, at `selectors.ts`. Magsulat ng tests para sa bawat isa. Ang selectors ay pure functions. Trivial silang i-test at hindi sila nag-flake. Ang reducer tests ay nagpapatunay na gumagana ang business logic mo. Ito ang mga highest-value tests na pwede mong isulat.

**Huwag mag-dispatch ng fetch tuwing magmo-mount ang screen.** Kung nag-navigate ako sa detail screen, bumalik, at nag-navigate sa parehong detail screen, hindi ko dapat makitang loading spinner ulit. I-cache ang data. I-check kung nandoon na bago mag-dispatch. Isang simpleng `if (!data[id])` check bago ang `dispatch(fetchDetails(id))` mo ay sapat na.

**Ang talagang mahalaga:** ang state logic ba ay hiwalay sa UI? Makikita ko ba ang state management code mo nang hindi naghahanap? Predictable ba ang mga updates mo?

> 🚩 **Red flag:** Business logic na nakatira sa loob ng mga components. State na nakakalat sa mga `useState` calls na walang malinaw na pattern.

## Tests: quality over coverage

Hindi mo kailangan ng 90% coverage. Kailangan mo ng *meaningful* tests. Tatlong magagandang tests ay panalo laban sa dalawampung snapshot tests.

Ang gusto kong makita:

- **I-test ang business logic mo.** Kung may rule (max 6 sa list, walang duplicates), i-test ito. I-test ang reducers mo, i-test ang selectors mo. Ito ang highest-value tests dahil pinapatunayan nila na gumagana ang core logic at hindi sila nag-flake.
- **I-test ang user interactions gamit ang React Native Testing Library.** Mag-render ng component, pindutin ang button, i-check ang result. Gamitin ang `render`, `screen`, `fireEvent`, at `waitFor` mula sa `@testing-library/react-native`. Hindi Enzyme. Hindi lang snapshot tests.
- **I-test ang edge cases.** Ano ang mangyayari kapag nag-try kang mag-add ng duplicate? Ano ang mangyayari kapag walang laman ang list? Ano ang mangyayari sa pagination boundary? I-test ang mga sad paths, hindi lang ang happy ones.
- **Siguraduhing pumapasa ang lahat ng tests bago mo i-submit.** I-run sila. Kung nag-fail ang isang test, ayusin o tanggalin. Mga nag-fail na tests o naka-comment na test code ay hudyat ng hindi tapos na trabaho.

Ang ayaw kong makita:

- **Snapshot tests sa lahat ng dako.** Nasisira sa bawat UI change at walang pinapatunayan tungkol sa behaviour.
- **Tests na mino-mock ang lahat.** Kung nimo-mock ng test mo ang function na tini-test nito, tini-test nito ang mock, hindi ang code.
- **Walang tests.** Mahirap mag-recover dito sa walkthrough.

> 💡 **Tip:** 5-10 focused tests na nagco-cover ng critical paths. Reducers, selectors, key interactions.

## I-handle ang loading, errors, at empty states

Dito nag-sta-stand out ang mga kandidato. Kahit sino ay kaya mag-build ng happy path. Ang tanong ay: ano ang mangyayari kapag may nagkamali?

**Loading states:** magpakita ng spinner o skeleton sa unang load. Magpakita ng subtle indicator kapag naglo-load ng dagdag na data (pagination). Huwag mag-flash ng full-screen spinner sa loob ng 100ms.

**Error states:** kung nag-fail ang API, sabihin sa user. Ang retry button ay mas maganda kaysa sa wala. Ang informative na message ay mas maganda kaysa sa "May nangyaring mali."

**Empty states:** kung walang laman ang list o walang naka-save na items, magpakita ng useful na bagay. Hindi isang blangkong screen.

> 🚩 **Red flag:** Nag-crash ang app sa mabagal na network. Walang loading state, walang error handling. Binuksan ng reviewer ang DevTools, ni-throttle ang network, at bumagsak ang app.

## Mahalaga ang API call

**GraphQL vs REST:** kung pareho ang ini-offer ng brief, mas malakas na option ang GraphQL. Nagpapakita ito na kaya mong magtrabaho sa modern API patterns. Pero ang well-implemented na REST client ay nananalo laban sa magulo na GraphQL setup.

**Caching:** kung nag-fetch ka ng detail screen, bumalik, at nag-fetch ulit, sayang na trabaho iyon. Gamitin ang React Query, ang cache ng Apollo, o kahit simpleng in-memory cache. *Mapapansin* ng reviewer kung bawat navigation ay nagti-trigger ng refetch.

**Pagination:** kung sinusuportahan ng API, gamitin mo. Huwag mag-fetch ng 1000 items sa unang load. Ang infinite scroll o paginated fetching ay nagpapakita na iniisip mo ang performance.

**Gamitin ang FlatList o FlashList. Huwag kailanman ScrollView para sa mga lista.** Ito ay isang malakas na red flag. Nire-render ng `ScrollView` ang lahat ng items nang sabay-sabay. Sa mahigit 100 items, makikita mo ang frame drops, memory spikes, at eventual crashes. Vine-virtualise ng `FlatList` ang list, nire-render lang ang nasa screen. Kung hindi mo alam ang pagkakaiba, aralin mo bago ang tech test mo. Kung makita kong may `ScrollView` na nagba-wrap ng `.map()` para sa isang data list, nagsu-suggest ito ng gap sa pag-unawa ng rendering model ng React Native.

**I-wrap ang app mo sa ErrorBoundary.** Maliit na bagay ito na nagbibigay ng bonus points. Ang top-level na `ErrorBoundary` component ay nag-catch ng JavaScript errors at nagpapakita ng fallback sa halip na puting screen. Karamihan ng mga kandidato ay hindi gumagawa nito. Kung gagawin mo, nagpapahiwatig ito na iniisip mo ang production resilience.

## Sa edge cases ka mag-sta-stand out

Ang happy path ang minimum. Ang naghihiwalay ng Software Engineer submission mula sa Senior ay ang edge case handling:

- **Puno na ang list?** Ano ang mangyayari kapag may nag-try mag-add ng ika-7 na item? Isang toast, disabled button, modal. Kahit ano maliban sa tahimik na pag-fail.
- **Walang laman ang list?** Magpakita ng meaningful na empty state, hindi blangkong screen.
- **Mabilis na taps?** Ang pagpindot ng "add" nang limang beses nang mabilis ba ay nagdudulot ng duplicates o crashes?
- **Back navigation?** Kapag bumalik ako mula sa detail papuntang list, naka-preserve ba ang scroll position ko? Kung hindi, notable na UX issue iyon.
- **Dulo ng list?** Humihinto ba nang maayos ang pagination kapag wala nang data? O patuloy na nagfi-fire ng requests?

Hindi mo kailangang i-handle lahat ng ito. Pero ang pag-handle ng *ilan* sa mga ito ay nagpapakita na iniisip mo ang totoong users, hindi lang ang pagpasa ng requirements.

## Ang README ay bahagi ng test

Sumulat ng README. Hindi novel. Isang maikling document na naglalaman ng:

1. **Paano i-run.** `yarn install`, `yarn ios`, tapos na. Kung may mga extra steps, i-document.
2. **Ano ang ginawa mo.** Isang paragraph na summary.
3. **Mga desisyong ginawa mo.** Bakit itong state management? Bakit itong folder structure? Dalawang pangungusap bawat isa.
4. **Ano ang pagbubutihin mo.** Ito ang pinakamahalagang section. Nagpapakita ng self-awareness.

**Ang "ano ang pagbubutihin ko" section ay isang cheat code.** Pinapayagan ka nitong aminin ang mga shortcut na ginawa mo nang hindi nadidiskubre ng reviewer bilang mga depekto. *"Kung may mas maraming oras, magdadagdag ako ng E2E tests gamit ang Detox at mag-iimplement ng proper caching"* ay nagko-convert ng nawawalang feature sa isang demonstrasyon ng judgement.

## Ang walkthrough: dito nananalo ang mga trabaho

Kung may walkthrough call ang test, mag-prepare. Ang code ang nagpasok sa iyo sa kwarto. Ang walkthrough ang magbibigay sa iyo ng offer.

**Kilalanin ang code mo.** Kung sasabihin ko "ipakita mo kung saan mo hina-handle ang API response," dapat makapunta ka doon sa loob ng 5 segundo. Kung mag-hesitate ka, pwede itong mag-raise ng tanong tungkol sa kung gaano mo kakilala ang code.

**I-explain ang trade-offs mo.** Huwag kang maghintay na magtanong ako. Kapag nagpapakita ka ng section ng code, sabihin mo *"Pinili ko itong approach dahil X, pero alam ko na ang trade-off ay Y."* Iyan ang sagot na hinahanap ko bago pa man ako magtanong.

**Maging honest tungkol sa mga shortcut.** *"Ginamit ko ang Context dito kasi mas mabilis, pero sa production app ililipat ko ito sa Zustand kapag naging mas complex ang state."* Malakas na sagot iyan. *"Sa tingin ko Context ang pinakamagandang approach"* ay mas mahina.

**Magkaroon ng listahan ng improvements.** Kapag tinanong kita "ano ang babaguhin mo kung may dagdag na oras?" ang pinakamasamang sagot ay "wala, okay na ako dito." Ang pinakamagandang sagot ay isang prioritised na listahan: *"Una, magdadagdag ako ng caching, tapos E2E tests, tapos i-refactor ko sa feature-first folders."*

**Magtanong pabalik.** Ang mga pinakamahusay na walkthrough ay mga usapan, hindi presentasyon. Magtanong tungkol sa architecture ng team, ang testing approach nila, ang deployment process nila. Nagpapakita ito na ine-evaluate mo rin ang role, hindi ka lang umaasang pumasa.

## Stretch goals: gawin mo, pero gawin mong maayos

Kung may binabanggit ang brief na mga optional extras (search, persistence, animations, dark mode, accessibility), pumili ng isa o dalawa na kaya mong gawin nang *maayos*. Huwag mong subukang gawin lahat nang pangit.

**Mga pinakamainam na stretch goals na piliin:**
- **Search/filter** sa list. Mabilis i-implement, agad nakikita, nagpapakita na iniisip mo ang UX.
- **Accessibility.** Labels, roles, contrast. Karamihan ng mga kandidato ay nilalampasan ito. Kahit basic na accessibility lang ay nakapagpa-stand out na sa iyo.
- **Error/offline handling.** Isang retry button kapag nag-fail ang network. Nagpapakita na iniisip mo ang real-world conditions.

**Mga stretch goals na iwasan maliban kung kaya mong gawin nang maayos:**
- **Animations.** Ang half-finished na animations ay mas pangit kaysa sa walang animations.
- **Dark mode.** Kung hindi consistent sa lahat ng screen, problema iyan.

Isang well-executed na stretch goal ay mas mahalaga kaysa sa tatlong hindi tapos.

## Ang mga pagkakamali na talagang nagko-cost ng trabaho sa mga tao

Hindi ito tungkol sa code quality. Tungkol ito sa mga signal.

**Hindi binasa nang maayos ang brief.** Naka-miss ng core requirement. Gumawa ng dalawang screen samantalang tatlo ang sinabi ng brief.

**Walang tests.** Kahit dalawa o tatlong tests ay nagpapakita na may pakialam ka sa quality. Zero tests ay nagpapadala ng malakas na negative signal.

**AI-generated code na hindi mo ma-explain.** Okay lang gumamit ng AI para makatulong. Ang mag-submit ng code na hindi mo naiintindihan ay hindi okay. Nagiging malinaw ito sa walkthrough.

**Overengineering.** Hindi kailangan ng tech test ang design system, component library, at micro-frontend architecture. Gawin mo ang hinihingi ng brief, nang maayos. I-save mo ang architecture astronautics para sa system design interview.

**Mag-submit nang late nang walang communication.** Kung kailangan mo ng dagdag na oras, humingi. Karamihan ng mga kumpanya ay magbibigay ng isa o dalawang dagdag na araw. Ang mawala at mag-submit tatlong araw late na walang paliwanag ay isang red flag.

## Ang isang bagay na pinakamahalaga

**Ipakita mong nag-iisip ka.** Hindi lang na nagko-code ka.

Kahit sino ay kaya mag-build ng screens. Ang mga kandidatong nahi-hire ay iyong mga nagde-demonstrate ng judgement: bakit pinili nila itong approach, ano ang gagawin nilang iba, saan mababasag ang code kapag nag-scale, anong tests ang talagang mahalaga.

Ang tech test ay hindi nagsu-subok kung kaya mong magsulat ng React Native. Sinusubok nito kung kaya mong gumawa ng magagandang desisyon at i-communicate ang mga ito nang malinaw.

> Gumawa ng malinis na bagay, i-test ang mga mahalagang parte, i-document ang iyong pag-iisip, at maging handa na pag-usapan ito nang matapat. Iyon lang. Iyon ang buong sikreto.

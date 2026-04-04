---
title: "Paano pumasa sa React Native tech test"
description: "Mga practical na advice mula sa taong nagrereview ng take-home tech test submissions. Ano ang talagang mahalaga, ano ang hindi, at ang mga pagkakamaling nagko-cost ng trabaho sa mga kandidato."
publishDate: 2026-04-06
tags: ["react-native", "pagkuha-ng-empleyado", "career-advice"]
locale: tl
heroImage: "/images/blog/react-native-tech-test-tips.jpg"
heroAlt: "Paano pumasa sa React Native tech test"
hiringUrl: "/hiring/"
hiringText: "We're looking for React Native engineers to join the Mobile Platform team at Hargreaves Lansdown."
campaign: "pass-rn-tech-test"
---

## Ito ay mula sa kabilang panig ng mesa

Nagrereview ako ng React Native tech test submissions. Nakita ko na kung ano ang nagpapa-hire sa mga tao at kung ano ang nagpapa-reject. Karamihan ng mga rejection ay hindi dahil hindi marunong mag-code ang kandidato. Dahil hindi nila ipinakita ang tamang mga bagay.

Ang post na ito ang advice na ibibigay ko sa isang kaibigan bago mag-submit ng take-home test. Hindi ito theory. Mga specific at practical na bagay na magdadala sa iyo mula sa "baka" patungo sa "oo."

*Sumulat ako tungkol sa kung bakit ko ni-redesign ang isang tech test mula sa perspektibo ng hiring manager sa [ibang post](/tl/blog/why-i-redesigned-our-react-native-tech-test-in-my-first-week/). Ito naman ang kabilang panig: paano pumasa sa isa.*

## Basahin ang brief nang dalawang beses. Tapos basahin mo ulit.

Mukhang obvious. Ito ang pinakakaraniwang pagkakamali.

Kung sinabi ng brief na "gumawa ng tatlong screens na may navigation," huwag kang gumawa ng dalawa lang. Kung sinabi na "gamitin ang TypeScript," huwag kang gagamit ng JavaScript. Kung sinabi na "mag-manage ng list na hanggang 6 items," siguraduhing ang pag-add ng ika-7 ay naha-handle nang maayos.

**Tini-check ng mga reviewer ang requirements parang checklist.** Bawat nawawalang requirement ay nawawalang puntos. Hindi dahil picky kami, kundi dahil ang pagsunod sa spec ay bahagi ng trabaho. Kung namimiss mo ang requirements sa isang tech test na may malinaw na brief, ano pa kaya sa isang malabong Jira ticket?

> 💡 **Tip:** Basahin ang brief bago ka mag-start. Basahin ulit sa kalahati. Basahin ng isang huling beses bago mo i-submit.

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

> 🚩 **Red flag:** Lahat ng files nasa isang flat na `src/` folder na walang organisasyon. Nagsu-suggest na nagsimula ang coding bago naplano ang architecture.

## Hindi optional ang TypeScript

Kahit sabihin ng brief na "TypeScript preferred," ituturing mo itong required. Ang pag-submit ng plain JavaScript sa 2026 ay automatic na downgrade.

Pero hindi sapat ang paggamit lang ng TypeScript. Gamitin mo ito nang *maayos*:

| Gawin ito | Bakit mahalaga |
|---|---|
| I-type ang props mo | Bawat component ay dapat may typed props interface |
| I-type ang API responses mo | Huwag gumamit ng `any` para sa data na bumabalik mula sa server |
| I-type ang navigation params mo | May excellent na TypeScript support ang React Navigation |

Ang isang `any` na patatawarin ko: mga complex na third-party library types na aabutin ng isang oras para malaman. Aminin mo ito sa isang comment. *"// TODO: i-type ito nang maayos — naubusan ng oras"* ay mas maganda kaysa magkunwaring wala itong problema.

> 🚩 **Red flag:** `any` na nakakalat sa buong codebase na walang acknowledgment.

## State management: pumili ka at panindigan mo

Hindi ko pakialam kung gagamit ka ng Redux Toolkit, Zustand, React Context, o Jotai. Ang mahalaga ay pinili mo ito nang sinadya at kaya mong i-explain kung bakit.

| Pinili | Anong signal nito |
|---|---|
| **Context** para sa three-screen app | Perfectly reasonable. Magaan, walang dependencies. |
| **Redux Toolkit** para sa three-screen app | Okay lang, pero tatanungin kita kung bakit. "Kasi yun ang pinaka-alam ko" ay matapat na sagot. |
| **Zustand** na may malinis na store | Nagpapakita na updated ka sa ecosystem. |

Kung pipiliin mo ang Redux, **gamitin mo ang Redux Toolkit**. Hindi yung lumang `switch/case` reducer pattern. Kung makita kong `createStore` sa halip na `configureStore`, o manual na action type constants sa halip na `createSlice`, nagsu-suggest na ang Redux knowledge ay maaaring kailangan ng pag-refresh.

**Ang talagang mahalaga:**

- ✅ State logic na hiwalay sa UI
- ✅ Actions, reducers, at selectors sa sarili nilang files
- ✅ Business rules (tulad ng max party size) na enforced sa state layer
- ✅ Predictable ang mga updates
- ❌ Business logic na nakatira sa loob ng mga components
- ❌ State na nakakalat sa mga `useState` calls na walang malinaw na pattern

**Huwag mag-dispatch ng fetch tuwing magmo-mount ang screen.** Kung nag-navigate ako sa detail screen, bumalik, at nag-navigate sa parehong detail screen, hindi ko dapat makitang loading spinner ulit. Isang simpleng `if (!data[id])` check bago ang `dispatch(fetchDetails(id))` mo ay sapat na.

## Tests: quality over coverage

Hindi mo kailangan ng 90% coverage. Kailangan mo ng *meaningful* tests. Tatlong magagandang tests ay panalo laban sa dalawampung snapshot tests.

**Ang gusto kong makita:**

| Uri ng test | Halimbawa |
|---|---|
| Business logic | Kung may rule (max 6 sa list, walang duplicates), i-test ito. Ang reducers at selectors ang highest-value tests. |
| User interactions | Mag-render ng component gamit RNTL, pindutin ang button, i-check ang result. Gamitin ang `render`, `fireEvent`, `waitFor`. |
| Edge cases | Ano ang mangyayari kapag mag-add ka ng duplicate? Kapag walang laman ang list? Sa pagination boundary? |
| Pumapasang tests | I-run bago i-submit. Mga nag-fail na tests ay hudyat ng hindi tapos na trabaho. |

**Ang ayaw kong makita:**

- ❌ **Snapshot tests sa lahat ng dako.** Nasisira sa bawat UI change at walang pinapatunayan tungkol sa behaviour.
- ❌ **Tests na mino-mock ang lahat.** Kung nimo-mock ng test mo ang function na tini-test nito, tini-test nito ang mock.
- ❌ **Walang tests.** Mahirap mag-recover dito sa walkthrough.

> 💡 **Tip:** 5-10 focused tests na nagco-cover ng critical paths. Reducers, selectors, key interactions. Sapat na iyon.

## I-handle ang loading, errors, at empty states

Dito nag-sta-stand out ang mga kandidato. Kahit sino ay kaya mag-build ng happy path. Ang tanong ay: ano ang mangyayari kapag may nagkamali?

| State | Ano ang gagawin |
|---|---|
| **Loading** | Magpakita ng spinner o skeleton sa unang load. Magpakita ng subtle indicator sa pagination. Huwag mag-flash ng full-screen spinner sa loob ng 100ms. |
| **Error** | Kung nag-fail ang API, sabihin sa user. Ang retry button ay mas maganda kaysa sa wala. Ang informative na message ay mas maganda kaysa sa "May nangyaring mali." |
| **Empty** | Kung walang laman ang list o walang naka-save na items, magpakita ng useful na bagay. Hindi blangkong screen. |

> 🚩 **Red flag:** Nag-crash ang app sa mabagal na network. Walang loading state, walang error handling. Binuksan ng reviewer ang DevTools, ni-throttle ang network, at bumagsak ang app.

## Mahalaga ang API call

**GraphQL vs REST:** kung pareho ang ini-offer ng brief, mas malakas na option ang GraphQL. Nagpapakita na kaya mong magtrabaho sa modern API patterns. Pero ang well-implemented na REST client ay nananalo laban sa magulo na GraphQL setup.

**Gamitin ang FlatList o FlashList. Huwag kailanman ScrollView para sa mga lista.** Nire-render ng `ScrollView` ang lahat ng items nang sabay-sabay. Sa mahigit 100 items, makikita mo ang frame drops, memory spikes, at eventual crashes. Vine-virtualise ng `FlatList` ang list, nire-render lang ang nasa screen. Kung makita kong may `ScrollView` na nagba-wrap ng `.map()` para sa isang data list, nagsu-suggest ng gap sa pag-unawa ng rendering model ng React Native.

**Ibang mga bagay na napapansin:**

- ✅ Caching: huwag mag-refetch ng data na meron ka na
- ✅ Pagination: huwag mag-fetch ng 1000 items sa unang load
- ✅ ErrorBoundary: nag-catch ng JavaScript errors at nagpapakita ng fallback sa halip na puting screen

## Sa edge cases ka mag-sta-stand out

Ang happy path ang minimum. Ang naghihiwalay ng Software Engineer submission mula sa Senior ay ang edge case handling:

- **Puno na ang list?** Ano ang mangyayari kapag may nag-try mag-add ng ika-7 na item? Isang toast, disabled button, modal. Kahit ano maliban sa tahimik na pag-fail.
- **Walang laman ang list?** Magpakita ng meaningful na empty state, hindi blangkong screen.
- **Mabilis na taps?** Ang pagpindot ng "add" nang limang beses nang mabilis ba ay nagdudulot ng duplicates o crashes?
- **Back navigation?** Kapag bumalik ako mula sa detail papuntang list, naka-preserve ba ang scroll position ko?
- **Dulo ng list?** Humihinto ba nang maayos ang pagination kapag wala nang data?

Hindi mo kailangang i-handle lahat ng ito. Pero ang pag-handle ng *ilan* sa mga ito ay nagpapakita na iniisip mo ang totoong users, hindi lang ang pagpasa ng requirements.

## Ang README ay bahagi ng test

Sumulat ng README. Hindi novel. Isang maikling document na naglalaman ng:

| Section | Ano ang isusulat |
|---|---|
| **Paano i-run** | `yarn install`, `yarn ios`, tapos na. Mga extra steps naka-document. |
| **Ano ang ginawa mo** | Isang paragraph na summary. |
| **Mga desisyong ginawa mo** | Bakit itong state management? Bakit itong folder structure? Dalawang pangungusap bawat isa. |
| **Ano ang pagbubutihin mo** | Ito ang pinakamahalagang section. Nagpapakita ng self-awareness. |

> 💡 **Ang "ano ang pagbubutihin ko" section ay isang cheat code.** Pinapayagan ka nitong aminin ang mga shortcut na ginawa mo nang hindi nadidiskubre ng reviewer bilang mga depekto. *"Kung may mas maraming oras, magdadagdag ako ng E2E tests gamit ang Detox at mag-iimplement ng proper caching"* ay nagko-convert ng nawawalang feature sa isang demonstrasyon ng judgement.

## Ang walkthrough: dito nananalo ang mga trabaho

Kung may walkthrough call ang test, mag-prepare. Ang code ang nagpasok sa iyo sa kwarto. Ang walkthrough ang magbibigay sa iyo ng offer.

**Kilalanin ang code mo.** Kung sasabihin ko "ipakita mo kung saan mo hina-handle ang API response," dapat makapunta ka doon sa loob ng 5 segundo. Kung mag-hesitate ka, pwede itong mag-raise ng tanong tungkol sa kung gaano mo kakilala ang code.

**I-explain ang trade-offs mo.** Huwag kang maghintay na magtanong ako. Kapag nagpapakita ka ng section ng code, sabihin mo *"Pinili ko itong approach dahil X, pero alam ko na ang trade-off ay Y."* Iyan ang sagot na hinahanap ko bago pa man ako magtanong.

**Maging honest tungkol sa mga shortcut.** *"Ginamit ko ang Context dito kasi mas mabilis, pero sa production app ililipat ko ito sa Zustand kapag naging mas complex ang state."* Malakas na sagot iyan. *"Sa tingin ko Context ang pinakamagandang approach"* ay mas mahina.

**Magkaroon ng listahan ng improvements.** Kapag tinanong kita "ano ang babaguhin mo kung may dagdag na oras?" ang pinakamasamang sagot ay "wala, okay na ako dito." Ang pinakamagandang sagot ay isang prioritised na listahan: *"Una, magdadagdag ako ng caching, tapos E2E tests, tapos i-refactor ko sa feature-first folders."*

**Magtanong pabalik.** Ang mga pinakamahusay na walkthrough ay mga usapan, hindi presentasyon. Magtanong tungkol sa architecture ng team, ang testing approach nila, ang deployment process nila. Nagpapakita na ine-evaluate mo rin ang role, hindi ka lang umaasang pumasa.

## Stretch goals: gawin mo, pero gawin mong maayos

Kung may binabanggit ang brief na mga optional extras, pumili ng isa o dalawa na kaya mong gawin nang *maayos*. Huwag mong subukang gawin lahat nang pangit.

| Worth piliin | Bakit |
|---|---|
| **Search/filter** | Mabilis i-implement, agad nakikita, nagpapakita na iniisip mo ang UX. |
| **Accessibility** | Labels, roles, contrast. Karamihan ng mga kandidato ay nilalampasan ito. Kahit basic lang, nakapagpa-stand out na. |
| **Error/offline handling** | Isang retry button kapag nag-fail ang network. Nagpapakita na iniisip mo ang real-world conditions. |

| Iwasan maliban kung kaya mong gawin nang maayos | Bakit |
|---|---|
| **Animations** | Ang half-finished na animations ay mas pangit kaysa sa walang animations. |
| **Dark mode** | Kung hindi consistent sa lahat ng screen, problema iyan. |

> 💡 **Isang well-executed na stretch goal ay mas mahalaga kaysa sa tatlong hindi tapos.**

## Ang mga pagkakamali na talagang nagko-cost ng trabaho sa mga tao

Hindi ito tungkol sa code quality. Tungkol ito sa mga signal.

| Pagkakamali | Bakit nakakasakit |
|---|---|
| **Hindi binasa nang maayos ang brief** | Naka-miss ng core requirement. Gumawa ng dalawang screen samantalang tatlo ang sinabi ng brief. |
| **Walang tests** | Kahit dalawa o tatlong tests ay nagpapakita na may pakialam ka sa quality. Zero ay malakas na negative signal. |
| **AI-generated code na hindi mo ma-explain** | Okay lang gumamit ng AI para makatulong. Ang mag-submit ng code na hindi mo naiintindihan ay hindi okay. Nagiging malinaw ito sa walkthrough. |
| **Overengineering** | Hindi kailangan ng tech test ang design system at micro-frontend architecture. Gawin ang hinihingi ng brief, nang maayos. |
| **Mag-submit nang late nang walang communication** | Kung kailangan mo ng dagdag na oras, humingi. Mawala at mag-submit tatlong araw late ay red flag. |

## Ang isang bagay na pinakamahalaga

**Ipakita mong nag-iisip ka.** Hindi lang na nagko-code ka.

Kahit sino ay kaya mag-build ng screens. Ang mga kandidatong nahi-hire ay iyong mga nagde-demonstrate ng judgement: bakit pinili nila itong approach, ano ang gagawin nilang iba, saan mababasag ang code kapag nag-scale, anong tests ang talagang mahalaga.

Ang tech test ay hindi sinusubok kung kaya mong magsulat ng React Native. Sinusubok nito kung kaya mong gumawa ng magagandang desisyon at i-communicate ang mga ito nang malinaw.

> Gumawa ng malinis na bagay, i-test ang mga mahalagang parte, i-document ang iyong pag-iisip, at maging handa na pag-usapan ito nang matapat. Iyon lang. Iyon ang buong sikreto.

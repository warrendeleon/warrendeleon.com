---
title: "Paano magsulat ng take-home tech test na gusto talagang gawin ng mga kandidato"
description: "Karamihan ng take-home tests, hindi gumana dahil sa setup friction, hindi malinaw na brief, o hindi nire-respeto ang oras ng tao. Ganito ko dinesign ang isa na pinasasalamatan kami ng mga kandidato."
publishDate: 2026-04-20
tags: ["engineering-management", "pagkuha-ng-empleyado", "react-native"]
locale: tl
heroImage: "/images/blog/take-home-tech-test-design.jpg"
heroAlt: "Pagdidisenyo ng take-home tech test para sa mga software engineer"
hiringUrl: "/hiring/"
hiringText: "We're looking for React Native engineers to join the Mobile Platform team at Hargreaves Lansdown."
---

## Ang test na walang natatapos

Karamihan ng take-home tech tests, fail na bago pa man lang magsulat ng isang linya ng code ang kandidato.

Kino-clone nila ang repo. Niru-run nila ang `npm install`. May nasisira.

**45 minutos later**, nagde-debug na sila ng Ruby version mismatch, missing na CocoaPod, o Node version na hindi gumagana sa bundler. Pag-run na ng app, ubos na ang pasensya nila at kalahati na ng gabi nila.

Ang pinakamahuhusay na kandidato, yung mga gusto mo talagang i-hire, sila pa ang pinaka-likely na umalis. May options sila. Pipiliin nila yung company na nire-respeto ang oras nila.

> 🚩 **Nangyari sa amin 'to.** Ang unang kandidato namin, dalawang oras na nakipag-laban sa Ruby version issues bago nagsulat ng kahit isang linya ng application code. Masyadong luma ang system Ruby niya. Nag-upgrade siya sa Ruby 4, nasira ang bundler. Nag-downgrade siya sa 3.3, pero incompatible ang vendored bundler. Bawat step ay back-and-forth na message. Dalawang oras. Zero na linya ng application code.

Binago ng experience na yun ang tingin ko sa test. Okay naman ang mga tanong. **Ang developer experience ang problema.**

## I-treat mo ang test na parang product

Ito ang naging guiding principle ko. Ang tech test ang unang totoong interaction ng kandidato sa engineering culture mo. Lahat ng na-experience niya, may sinasabi tungkol sa iyo.

Kung sira ang setup → iisipin nilang sira ang codebase mo.
Kung vague ang brief → iisipin nilang vague ang specs mo.
Kung unrealistic ang timeline → iisipin nilang unrealistic ang deadlines mo.

Sinimulan kong i-treat ang test na katulad ng pag-treat ko sa product:

| Product thinking | Applied sa tech test |
|---|---|
| User research | Ano ang nakaka-frustrate sa mga kandidato sa tech tests? |
| Malinaw na requirements | Detalyadong brief na may wireframes at rules |
| Developer experience | Starter project, setup script, path aliases |
| Documentation | Naka-link na guides para sa bawat tanong na pwedeng lumabas |
| Continuous improvement | I-update pagkatapos ng bawat round base sa kung ano ang nagkamali |

Pagkatapos ng Ruby incident, nag-add ako ng setup script, ni-pin ko ang Ruby version, nag-commit ng Gemfile.lock na may modern bundler, at nagdagdag ng troubleshooting section sa README.

**Ang susunod na kandidato, nagco-code na sa loob ng dalawang minuto.**

## Ang setup script

Ang pinaka-malaking improvement: isang `setup.sh` na nag-hahandle ng lahat.

```bash
./setup.sh
```

Isang command lang. Ginagawa nito:

- ✅ Chine-check ang Node version (ini-install via nvm kung kailangan)
- ✅ Chine-check ang Ruby version (suportado ang rbenv, rvm at asdf)
- ✅ Chine-check ang Xcode CLI tools at CocoaPods
- ✅ Niru-run ang `yarn install`
- ✅ Niru-run ang `bundle install` at `pod install`
- ✅ Sinasabi sa iyo kung ano exactly ang kailangang i-fix kung may mali

Ang key design choice: **nagta-tanong muna ang script bago mag-install ng kahit ano**. Dine-detect nito kung ano ang meron na ang kandidato at doon nagta-trabaho. Kung gumagamit ng rbenv ang kandidato, rbenv ang binibigay. Kung gumagamit ng rvm, rvm. Nire-respeto ang environment nila, hindi o-overwrite.

> 💡 **Tip:** I-pin mo ang versions sa repo: `.ruby-version`, `.nvmrc`, `Gemfile.lock` na may modern bundler. Tapos gumawa ka ng setup script na nagba-basa sa kanila. Bawat minutong ginugol ng kandidato sa setup, isang minuto na hindi niya ginugugol sa code.

## Ang starter project

Nagbibigay ako ng fully configured project sa mga kandidato. Hindi blank na repo. Isang gumaganang app.

| Kasama | Bakit |
|---|---|
| TypeScript sa strict mode | Walang ambiguity sa language expectations |
| React Navigation v7 na may typed params | Ang navigation ay boilerplate, hindi test ng skill |
| Jest + React Native Testing Library | Configured na may native module mocks, ready na magsulat ng tests |
| ESLint + Prettier | Consistent code style mula sa unang linya |
| Path aliases (`@app/*`) | Wala nang `../../../` import chains |
| Custom test render wrapper | Kasama na ang NavigationContainer, mag-render at mag-assert lang |
| Tatlong placeholder screens | "Replace me": malinaw na starting point |
| Isang passing smoke test | Proof na gumagana ang setup bago sila mag-bago ng kahit ano |

**Lahat nag-co-compile. Lahat gumagana. Pumapasa ang smoke test.**

Hindi ko tine-test kung kaya ng isang tao i-configure ang bundler o mag-debug ng TypeScript path alias. Tine-test ko kung kaya nilang **mag-build ng application code**. Ang starter project ang nag-aalis ng bawat obstacle sa pagitan ng "na-clone ko na ang repo" at "nagsusulat na ako ng unang component ko."

May mga kandidato na nagsa-start from scratch kahit na meron ang starter. Okay lang yun. Optional ang starter. Pero karamihan ginagamit ito, at pareho lang ang resulta: sa halip na gugulin ang unang oras sa paglaban sa config, ginugugol nila sa pag-gawa ng architectural decisions.

## Ang brief: malinaw sa kung ano, hindi sa kung paano

May mga tech test na ini-specify ang exactly kung paano gawin ang mga bagay: kung anong state management library, kung anong folder structure, kung anong API client. Gumagana ang approach na yun kapag gusto mo ng consistency. Pero para sa amin, yung mga decision na yun ang pinaka-interesting na parte ng submission.

Ibang approach ang brief namin. Ine-explain nito nang detalyado ang **kung ano** ang dapat gawin ng app, at walang sinasabi tungkol sa **kung paano**.

- **Screen wireframes** na nagpapakita ng data at interactions (ASCII layouts, hindi pixel designs)
- **Requirements table** na nag-sspell out ng rules (max 6 items, add from detail, remove from list)
- **Technical requirements table** na nagli-list ng non-negotiables (React Native, TypeScript, React Navigation)

Ang deliberately missing: architecture prescriptions. Ang kandidato ang pumipili ng state management, folder structure, API client, testing strategy.

Isang kandidato na pumili ng Redux Toolkit, iba ang sinasabi sa akin kumpara sa pumili ng Zustand. Wala namang mali sa dalawa. *Pareho silang interesting.* At ang reasoning sa likod ng choice ang basehan ng walkthrough conversation.

> 💡 **Tip:** Kung ang brief mo ay nags-specify ng architecture, compliance ang tine-test mo, hindi engineering. Ang pinakamahuhusay na briefs ay nagde-describe ng *ano* nang detalyado at iniiwang bukas nang buo ang *paano*.

## Pag-respeto sa oras ng tao

**7 araw ang ibinibigay sa mga kandidato. Ang trabaho ay dapat tumagal ng 4 hanggang 6 na oras.**

Sinasabi namin ito nang explicit. Sa brief at sa submission guide. Dalawang beses, kasi minsan hindi napapansin ng tao sa unang basa.

7 araw ang nagbibigay ng flexibility. May mga taong nagta-trabaho sa weekend. May mga gumagawa ng isang oras bawat gabi. May nagba-block ng Saturday morning. Nire-respeto ng timeline na may trabaho, pamilya, at buhay ang mga kandidato sa labas ng pag-iinterview.

Honest ang 4 hanggang 6 na oras na estimate. Ginawa ko mismo ang test para i-verify. Kaya ng isang competent na React Native developer na i-build ang lahat ng tatlong screens na may state management, API integration, basic tests, at README sa oras na yun. May mga pumipili na mag-invest ng mas marami. Choice nila yun, hindi expectation namin.

Kung kailangan ng kandidato ng mas maraming oras, binibigay namin. Walang tanong.

> ℹ️ Iba ang signal ng pagiging tahimik at mag-submit tatlong araw late na walang explanation kumpara sa pagse-send ng message na "kailangan ko ng konting dagdag na oras." Importante ang communication.

## Sabihin mo kung ano ang hinahanap mo

Noong una, sinabi sa amin ng isang kandidato na isang oras siyang nag-style ng buttons kasi akala niya mahalaga sa amin ang UI polish. Hindi pala. Architecture at testing ang tinitingnan namin. Na-waste ang oras na yun kasi hindi namin sinabi kung ano ang importante.

Ngayon, explicit na kami:

```
✅ Paano mo iniisip ang architecture at code organisation
✅ Paano mo bine-break down ang problema sa components at data flows
✅ Paano ka gumagawa at nagju-justify ng technical decisions
✅ Paano mo hina-handle ang edge cases at error states
✅ Gaano mo kakilala ang sarili mong code

❌ HINDI namin hina-judge ang visual design o pixel-perfect UI
❌ HINDI namin ine-expect ang production-ready app sa take-home
```

Kapag alam ng mga kandidato na mas mahalaga sa amin ang architecture at trade-offs kaysa sa styling, doon nila naa-allocate nang tama ang oras nila. **Mas magandang signal para sa amin. Mas magandang experience para sa kanila.**

Sinasabi rin namin sa kanila upfront na pwedeng gumamit kami ng AI tooling bilang pre-check, pero bawat submission ay manually reviewed at scored ng hiring panel. Ang transparency ay nagbu-build ng trust.

## Ang walkthrough, hindi interrogation

Ang walkthrough ay conversation. Ang kandidato ang nangunguna sa unang 10 minuto:

1. **I-demo ang app**: i-walk through ang lahat ng screens, ipakita na gumagana ang features
2. **I-run ang tests**: ipakita na pumapasa sila live
3. **I-walk through ang code**: i-explain ang structure at mga decisions

Pagkatapos ng presentation, nagta-tanong kami. Pero ang framing ang mahalaga. Sinasabi namin:

> *"Huwag kang mag-alala kung may hindi gumana nang expected sa demo. Nangyayari yun. Kung nangyari, i-explain mo na lang sa akin kung ano sa tingin mo ang nagkamali at paano mo i-fi-fix. Mas marami akong natutuhan doon kaysa sa perfect demo."*

Hindi ito basta pagiging nice lang. Ang panonood sa isang tao na nagda-diagnose ng bug sa sarili niyang code ang isa sa pinakamalakas na signals na pwede mong makuha. Isang kandidato na nagsabing *"Ah, parang mali yata ang useEffect dependency array dito"* ay nagpapakita sa iyo kung paano talaga siya nagta-trabaho.

Ang perfect demo, wala kang natutuhan kundi na nag-rehearse siya.

## Ang documentation bilang first-class feature

Ang test ay may kasamang maayos na documentation. Hindi lang README. Isang set ng naka-link na markdown files:

| Document | Ano ang covered |
|---|---|
| **Assessment Brief** | Requirements, screen wireframes, party rules, technical requirements |
| **API Guide** | Endpoints, GraphQL vs REST options, client recommendations |
| **Starter Project** | Ano ang kasama, project structure, available commands, testing setup |
| **Submission & Walkthrough** | Paano mag-submit, ano ang mangyayari sa walkthrough, tips |
| **Stretch Goals** | Optional extras at ano ang dine-demonstrate ng bawat isa |

Bawat tanong na pwedeng maisip ng kandidato, nasagot na bago pa niya kailanganin itanong. Hindi lang ito tungkol sa pagiging helpful. Ito ay tungkol sa **pag-alis ng ambiguity bilang variable**. Ayaw kong i-evaluate kung gaano kahusay mag-interpret ng vague brief ang isang tao. Gusto kong i-evaluate kung paano sila nagbu-build ng software kapag malinaw ang requirements.

## Ano ang babaguhin ko sa susunod

Hindi perpekto ang test. Ito ang nasa listahan ko:

- **Video walkthrough ng starter project.** Isang 3-minute Loom na nagpapakita ng folder structure, paano i-run, at kung saan magsisimula. May mga tao na mas natututo sa video kaysa sa docs.
- **Isang `.env.example` file.** Kahit na gumagamit ang test ng public API na walang keys, tama na itong pattern na i-set.
- **I-test ang setup sa clean machine.** Ginawa ko ang test sa sarili kong laptop na may taon-taon nang mga naka-install na tools. Bawat assumption na "lahat may ganito" ay mali. Pinatunayan ng unang kandidato.

Pero tama naman ang structure. Setup script. Starter project. Malinaw na brief. Honest na timeline. Maayos na documentation. Transparent na evaluation criteria.

Kung nagde-design ka ng tech test at patuloy na nag-drop out ang mga kandidato, huwag mo munang tingnan ang mga tanong. Tingnan mo ang developer experience. **Ang pinakamahusay na tech test ay yung ginugugol ng kandidato ang 100% ng oras niya sa bagay na tine-test mo talaga, at 0% sa lahat ng iba pa.**

*Ito ang huling post sa isang serye tungkol sa pagbuo ng hiring process mula sa simula. Ang mga naunang post ay tungkol sa [bakit ko ni-redesign ang test](/tl/blog/why-i-redesigned-our-react-native-tech-test-in-my-first-week/), [mga payo para sa mga kandidatong kukuha nito](/tl/blog/how-to-pass-a-react-native-tech-test/), at [paano gumagana ang scoring](/tl/blog/how-i-designed-a-tech-test-scorecard-that-works-from-graduate-to-senior/).*

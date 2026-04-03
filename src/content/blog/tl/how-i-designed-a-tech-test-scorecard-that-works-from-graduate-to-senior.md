---
title: "Paano ko dinisenyuhan ang tech test scorecard na gumagana mula Graduate hanggang Senior"
description: "Paano ginawa ng checklist-based scorecard na gumana ang React Native take-home test namin para sa lahat ng level, mula Graduate hanggang Senior. Isang practical na guide sa pagdidisenyo ng fair na hiring process."
publishDate: 2026-04-13
tags: ["engineering-management", "pagkuha-ng-empleyado", "react-native"]
locale: tl
heroImage: "/images/blog/tech-test-scorecard.jpg"
heroAlt: "Pagdidisenyo ng tech test scorecard para sa React Native hiring"


---

## Ang problema sa "3 ba 'to o 4?"

Noong sinimulan kong buuin ang hiring process para sa squad ko, alam kong gusto ko ng structured scorecard mula sa simula. Isinulat ko ang tungkol sa mismong tech test sa [isang naunang post](/blog/why-i-redesigned-our-react-native-tech-test-in-my-first-week/). Gumana ang test. Ang scoring, hindi. Hindi naman sa totally hindi, pero hindi sa paraan na ginawa ko noong una.

Ang unang scorecard ko ay gumagamit ng 1 to 5 scale para sa bawat criterion. "TypeScript usage: score 1 to 5." "State management: score 1 to 5." Bawat criterion may rubric na nagde-describe kung ano ang ibig sabihin ng bawat score. Mukha siyang maganda sa papel.

Tapos ginamit ko na.

Dalawang tao ang nag-review ng parehong submission. Ang isa nag-score ng 3 sa TypeScript ("andyan naman ang types pero hindi strict"). Yung isa naman nag-score ng 4 ("malinis na types sa buong code, magandang gamit ng typed hooks"). Parehong code ang tinitingnan nila. Iba lang ang pagka-interpret nila sa rubric.

> 💡 **Tip:** Kung dalawang reasonable na tao ay pwedeng mag-disagree sa score, hindi sapat ang specificity ng rubric. Hindi ang mga reviewer ang problema. Ang tool.


## Checklists kaysa rubrics

Sobrang simple pala ng fix: palitan ang bawat subjective score ng **yes/no checklist**.

Ganito ang hitsura ng isang criterion bago at pagkatapos. TypeScript usage ito:

### Dati: subjective rubric

| Score | Description |
|---|---|
| 5 | Strong typing sa buong code, strict mode, generics kung saan angkop |
| 4 | Malinis na types, minimal na `any`, naka-type ang props at navigation |
| 3 | May types para sa main structures, may nakalusot na `any`, gumagana pero hindi strict |
| 2 | Pangit ang gamit ng TypeScript, madalas ang `any`, konting safety lang ang nadagdag |
| 1 | `any` sa lahat ng dako, basically JavaScript na may `.tsx` extensions |

Ang problema: "malinis na types" at "types para sa main structures" ay parehong reasonable na description ng parehong code. Ang isang reviewer nakakita ng 3, ang isa naman 4. Tama silang dalawa.

### Ngayon: observable checklist

```
✅ Ang source files ay gumagamit ng .ts/.tsx extensions
✅ May interfaces o types para sa API data, state shape, at component props
✅ Naka-type ang navigation params
✅ Zero any sa production code
☐  Gumagamit ng typed hooks (useAppSelector, useAppDispatch)
☐  Naka-enable ang strict TypeScript
☐  Zod o Yup schemas para sa validation
```

Parehong criterion. Pitong checks. Bawat isa ay fact na ma-verify mo sa pagtingin sa code. Dalawang reviewer ang magchi-check ng parehong boxes kasi wala nang i-interpret.

Ang unang apat na checks ang baseline (makukuha ng kahit sinong competent na candidate sa 4 to 6 hours na submission). Ang huling tatlo ay signals ng mas malalim na experience. **Ang pagkakaayos mismo ang gumagawa ng levelling para sa'yo.**

Ginawa ko ito sa bawat criterion sa apat na sections:

- **Core Functionality** — gumagana ba ang app?
- **Data Layer at API** — paano nito kinu-kuha at mina-manage ang data?
- **Code Quality** — maganda ba ang pagkakasulat at pagkaka-organisa ng code?
- **Testing** — naka-test ba, at paano?

**100 checks. 100 points. Isang point bawat isa.**


## Iisang test, ibang ceiling

Ito ang part na pinaka-exciting para sa akin. Ang checks ay nakaayos ayon sa kung gaano karaming investment ang kailangan.

Ang mga unang checks sa bawat criterion ay mga bagay na makukuha ng kahit sinong competent na candidate sa **4 to 6 hours**:

- Nagre-render ba ng items ang FlatList?
- Gumagana ba ang pagination?
- May empty state ba ang party screen?
- May types ba para sa main data structures?
- May kahit isang test file ba?

Iyan ang baseline. Kung ginawa mo ang hinihingi ng brief, papasa ka dito.

Ang mga checks sa ibaba ay nangangailangan ng mas maraming oras, mas malalim na experience, o pareho:

- GraphQL sa halip na REST
- Runtime response validation gamit ang Zod
- MSW para sa HTTP mocking sa tests
- Feature-first project structure
- BDD gamit ang Cucumber
- Mga coverage threshold na enforced

Hindi mo gagawin ang mga ito sa isang weekend. Mga pattern itong natutunan mo sa pag-build ng totoong production apps.

> 💡 **Key insight:** Ang candidate na nag-invest ng 4 to 6 hours ay mag-score sa 50 to 65 range. Ang candidate na nag-invest ng buong linggo na may taon-taong experience ay pwedeng mag-score ng 85 to 95. **Iisa lang ang brief. Ang expectations ang nag-e-scale kasama ng score.**


## Paano nag-ma-map ang levels

Ang total score ay dire-diretso ang mapping sa level:

| Level | Code review score |
|---|---|
| **Graduate** | 20–45 |
| **Associate** | 46–64 |
| **Software Engineer** | 65–88 |
| **Senior** | 89–100 |

Hindi kumpleto ang picture sa code review score lang. Ang walkthrough call ay nagdadagdag ng dagdag na signal. Pero ang code review ang pundasyon.


## Pag-respeto sa time constraint

Ang tech test ay **hindi production app**. May mga trabaho ang candidates, pamilya, buhay. Binibigay nila sa'yo ang gabi nila o ang weekend nila. Ang pagpe-penalise sa isang tao dahil hindi nag-implement ng caching layer o hindi nag-co-locate ng styles ay parang pagbabawas ng score sa isang timed essay dahil walang footnotes.

Kaya mahalaga ang baseline checks. Pag nakuha mong lahat ng tama, around **50 to 60 out of 100** ang score mo. Associate to Software Engineer territory iyan. Sa lumang rubric ko, ang "3 out of 5" ay *parang* consolation prize pakinggan. 55 out of 100 sa checklist ay positive result na may malinaw na path papunta sa next level.


## Ano ang hitsura ng "above baseline"

Ang mga checks sa ibaba ang nagdi-differentiate sa mga candidate. Hindi mga requirement ang mga ito. **Signals** ang mga ito.

Ang candidate na nagdagdag ng **Detox E2E tests** na may extracted helpers ay nagsasabi sa akin ng tungkol sa testing culture nila.

Ang candidate na nag-implement ng **GraphQL gamit ang Apollo** ay nagsasabi sa akin ng tungkol sa API thinking nila.

Ang candidate na nag-setup ng **MSW na may multiple handler sets** (success, error, 401, timeout, offline) ay nagsasabi sa akin na na-debug na nila ang production API failures dati.

Wala sa mga ito ang required. **Lahat ng mga ito ay napapansin.**

Ang stretch goals ay naka-stack sa ibabaw ng 100 points bilang bonuses: search, dark mode, accessibility, i18n, feature-first structure, Storybook, ErrorBoundary. Mga marka ito ng taong may oras at pinili nilang gamitin nang tama.


## Binabago ng walkthrough ang lahat

Ang code review ay nagbibigay sa akin ng number. Ang walkthrough ay nagbibigay sa akin ng **context**.

Ang candidate na may 65 sa code review ay pwedeng tumalon sa 85 pagkatapos ng walkthrough kung kaya nilang i-articulate ang bawat trade-off, i-explain kung ano ang babaguhin nila kung may mas maraming oras, at i-navigate ang codebase nila mula sa memory. Ang number ay sumusukat ng kung ano ang ginawa nila. Ang conversation ay sumusukat ng kung paano sila mag-isip.

Dinisenyuhan ko ang walkthrough bilang isang set ng **question tables**. Bawat tanong ay may limang signal description, mula "hindi mahanap ang code" hanggang "ine-explain mula sa memory kasama ng edge cases." Ang interviewer ay nagchi-check ng isang row per tanong. Wala nang "3 ba o 4 yung walkthrough na yun?"

Para sa Senior candidates, may dagdag na **system design section** sa parehong call. Walang separate interview. Ang huling 15 to 20 minutos ay lumilipat mula sa "ipakita mo sa akin ang code mo" papunta sa "paano mo idi-design ito para sa team na may 20 engineers?" Parehong question tables, parehong check-one-row format.


## Ano ang natutunan ko sa pagbuo nito

Ang paggawa ng scorecard na ito ay nagturo sa akin ng mas marami tungkol sa hiring design kaysa sa kahit ano ang nabasa ko tungkol dito. Ito ang nag-stick:

**Mag-start sa checklists, hindi rubrics.** Sa tuwing nagsusulat ako ng rubric ("5 = excellent, 3 = good, 1 = poor"), nagiging debate kung ano ang ibig sabihin ng "good". Tinatanggal ng checklists ang debate. Nandoon sa code ang bagay o wala.

**I-order ang checks ayon sa investment, hindi importance.** Ang mga unang checks ay hindi mas importante kaysa sa mga huli. Mas achievable lang sila sa 4 to 6 hours. Ang Senior candidate na nag-skip ng check 3 pero nag-nail ng check 7 ay hindi napepena-penalise sa skip kasi ang total ay nagre-reflect pa rin ng level nila.

**I-separate ang nakikita mo sa kailangan mong itanong.** Ang code review scorecard ay 100% observable mula sa code. Walang "maganda ba ang architecture?" na tanong. Ang walkthrough ay 100% conversational. Walang pagbabasa ng code habang naka-call. Isang trabaho lang ang bawat document.

**I-respeto ang time constraint.** Kung ang isang check ay mangangailangan ng mahigit 6 na oras ng trabaho mula sa isang competent na Software Engineer, nasa upper half siya ng checklist, hindi sa baseline. Nahuli ko ang sarili ko ng ilang beses na nagsusulat ng baseline checks na talagang Senior expectations pala. Ang tanong na palagi kong ginagamit: *"Aasahan ko ba ito mula sa isang taong ginagawa ang test na ito pagkatapos ng trabaho isang Miyerkules ng gabi?"* Kung hindi, pataas.


## Nag-e-evolve pa rin

Ginamit ko ang scorecard na ito para sa unang round ng React Native hiring namin. Ni-review ito ng kapwa ko na EM at in-adopt niya rin para sa mga hire ng squad niya. Iyan ang test ng magandang system: **kaya itong kunin ng iba at gamitin nang wala ka sa kwarto.**

Hindi ko sinasabing perpekto ito. Pwedeng kailanganin ng recalibration ang levels pagkatapos dumaan ng mas maraming candidates. Baka lumabas na masyadong madali o masyadong mahirap ang ibang checks. Baka kailanganin ng rebalancing ang stretch goals.

Tama ang structure:

- ✅ Checklists, hindi rubrics
- ✅ Observable facts, hindi opinions
- ✅ Nakaayos ayon sa investment
- ✅ Iisang test para sa lahat
- ✅ Ibang ceiling para sa ibang levels

Kung gumagawa ka ng hiring process at palaging hindi nagkaka-agree ang mga interviewer mo sa scores, subukan mong palitan ang rubric mo ng checklist. Magugulat ka sa dami ng agreement na makukuha mo kapag tumigil ka sa pagtatanong ng *"gaano kaganda ito?"* at nagsimula kang magtanong ng *"nandito ba ito?"*

> Ang pinakamahusay na scoring systems ay hindi sumusukat ng nararamdaman mo tungkol sa code. Sinusukat nila ang nasa code.

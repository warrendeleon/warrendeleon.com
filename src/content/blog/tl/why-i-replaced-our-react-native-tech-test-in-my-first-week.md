---
title: "Bakit ko pinalitan ang React Native tech test namin sa unang linggo ko"
description: "Pumasok ako bilang Engineering Manager at agad kong binago ang hiring process. Ito ang kwento kung bakit hindi na gumagana ang lumang test at kung ano ang ginawa ko kapalit."
publishDate: 2026-03-29
tags: ["engineering-management", "pagkuha-ng-empleyado", "react-native"]
locale: tl
heroImage: "/images/blog/redesigning-react-native-tech-test.jpg"
heroAlt: "Pagre-redesign ng tech test para sa React Native hiring"


---

## Isang test na gawa para sa ibang panahon

Apat na araw bago ako opisyal na mag-start, pumunta ako sa office para sa passport check. Habang nandoon ako, sinabi ng manager ko na mag-hire ako ng team. Ang unang tanong ko: pwede ko bang baguhin ang interview process? Sabi niya oo. *Hindi pa nga ako nag-uumpisa.* Pagdating ng day one ko noong ika-23, ginagawa ko na ang bagong test.

Ako ang bagong Engineering Manager ng **Mobile Platform** squad. Nire-rebuild namin ang mobile app sa React Native, isang brownfield migration mula sa existing native iOS at Android apps. Kailangan ko ng mga engineer na kaya magtrabaho sa platform level.

Hindi ko na kailangang humingi pa na makita ang tech test. Pinagdaanan ko rin ito ilang linggo lang ang nakalipas. Ganoon ako na-hire: isang live coding exercise kung saan mag-build ka ng maliit na app sa loob ng isang oras habang nanonood ang interviewer, tapos may mga technical questions mula sa isang questionnaire. Mga 90 minutos ang buong interview.

May sense ang test sa original context nito. Noong mas maliit pa ang team at iba ang mga role na hinahanap, reasonable na paraan ito para mag-screen ng candidates nang mabilis. Pero nagbago na ang mga kailangan namin. Hindi na kami naghahanap ng taong gagawa ng simpleng screens. Nagha-hire na kami ng **platform engineers** na mag-o-own ng architecture na gagamitin ng lahat ng ibang mobile team.

Kailangan kong masagot ng test ang ibang mga tanong:

- Kaya ba nilang i-structure ang isang **multi-screen app** na may navigation na hindi magfa-fall apart?
- Kaya ba nilang mag-call sa **totoong API** at i-handle kung ano ang mangyayari kapag bumagsak ang network?
- Nagsusulat ba sila ng **tests** kasi may pakialam sila sa gumaganang software, o kasi sinabihan lang sila?
- Kaya ba nilang umupo sa harap ko at i-explain *bakit* nila ginawa ng ganoon?

Hindi designed ang existing test para sagutin ang mga ito. Kaya gumawa ako ng bago.

## Sira ang live coding

Ganito ang live coding: hindi nito tine-test ang engineering ability. **Tine-test nito ang performance anxiety.**

Naranasan ko sa dalawang panig. Kamakailan lang noong Enero ngayong taon, na-bomb ko ang isang live coding exercise para sa role na sobrang qualified ako. Simple ang problem. Alam ko kung paano solusyunan. Pero dahil may nanonood sa bawat keystroke ko, nag-blangko ang utak ko. *Hindi ako pumasa.*

Bilang interviewer, nakita ko ring nangyari ang ganoon sa mga candidate. Mga magagaling na engineer na nag-freeze sa mga problem na kayang-kaya nilang i-solve sa limang minuto kung walang nakatitig sa kanila. Ang format na ito, pumipili ng mga taong magaling mag-perform sa ilalim ng artipisyal na pressure, hindi ng mga taong magaling sumulat ng software.

Para sa isang platform engineering role, kung saan ang trabaho ay architecture decisions, design system components, at CI/CD pipelines, mas lalo pang walang sense ang live coding. Hindi ko kailangan ng taong mabilis mag-type sa ilalim ng pressure. **Kailangan ko ng taong malinaw mag-isip kapag may oras at context.**

## Pagpapakita vs. pagsasabi

Kasama rin sa dating process ang isang technical questionnaire. Pipili ang interviewer ng mga tanong mula sa isang reference sheet na nag-cover ng React Native architecture, state management, testing strategies, at platform differences, tapos iko-compare ang mga sagot sa mga expected responses. Minsan, nata-tackle na ng mga candidate ang mga topic habang nag-live coding, kaya issi-skip na lang ng interviewer ang mga tanong na yun.

Lahat valid na topic 'yan. *Exactly* ang mga bagay na gusto kong maintindihan ng mga engineer ko. Pero ang paghingi sa isang tao na i-explain ang isang concept sa interview, sinasabi lang nito sa'yo kung kaya nilang **ma-recall at ma-articulate** ang knowledge. Hindi nito sinasabi kung kaya nilang **i-apply** sa totoong kondisyon.

Ang bagong process, tine-test ang parehong mga topic sa pamamagitan ng code ng candidate mismo. Hindi ko kailangan itanong ang *"paano mo i-structure ang navigation sa isang complex na app?"* kung mabubuksan ko ang submission nila at makikita kung paano nila talagang ginawa. Hindi ko kailangang itanong ang testing approach nila kung kaya kong i-run ang test suite nila. Ang walkthrough conversation, nag-co-cover pa rin ng architecture, trade-offs, at technical depth, pero naka-ground sa isang bagay na *ginawa* ng candidate, hindi sa isang bagay na *in-ensayo* nila.

## Ang ginawa ko kapalit

Nag-design ako ng take-home assessment. Isang maliit pero totoong app: multiple screens, public API, navigation, state management na may totoong business rules, TypeScript sa lahat. Hindi laruan. Hindi rin weekend project. Isang bagay na nangangailangan ng **tunay na architectural thinking**.

Apat na prinsipyo ang gumabay sa design:

**I-mirror ang totoong trabaho.** Ang test dapat ma-feel na parang totoong trabaho. Kung kaya ng candidate i-build ang app na ito, kaya nilang mag-contribute sa codebase namin sa day one. Kung hindi nila kaya, useful din ang information na 'yon.

**Alisin ang boilerplate tax.** Binibigyan ko ang mga candidate ng fully configured starter project. TypeScript, ESLint, Prettier, Jest, React Native Testing Library, path aliases. *Handa na lahat.* Wala akong pakialam kung marunong mag-configure ng bundler ang isang tao. Ang pakialam ko ay kung marunong silang magsulat ng application code.

**Maging malinaw sa kung ano, hindi sa kung paano.** Ini-explain ng brief kung ano ang dapat gawin ng app. Hindi nito sinasabi kung aling state management library ang gagamitin, paano i-structure ang mga folder, o aling API client ang pipiliin. Ang mga desisyon na 'yon ang pinaka-revealing na parte ng submission. Ang candidate na pumili ng Redux Toolkit para sa isang three-screen app, ibang-iba ang sinasabi sa'yo kumpara sa pumili ng Zustand o React Context. Walang mali sa dalawa. *Parehong interesting.*

**Respetuhin ang oras ng mga tao.** Isang linggo ang bigay sa mga candidate. Ang trabaho dapat tumagal ng 4 hanggang 6 na oras. May mga trabaho ang mga tao, pamilya, buhay. Walang dapat mag-file ng leave para sa tech test ng company na baka hindi naman sila i-hire.

## Ang walkthrough ang pinakamagandang parte

Ang take-home code ay kalahati lang ng evaluation. Ang kalahati pa ay isang walkthrough call: ang candidate **nag-de-demo ng app**, nire-run ang tests nila nang live, at nagwa-walk through ng code.

Dito mo napaghi-hiwalay ang mga taong *nagsulat* ng code sa mga taong *nag-assemble* lang. At sa panahon ng AI-generated code, mas mahalaga 'yang distinction na 'yan kailanman.

Tatlong bagay ang hinahanap ko:

**Ownership.** *"Navigate ka sa file kung saan hina-handle mo ang API response."* Kung sila ang sumulat, diretso sila doon. Kung in-assemble lang nila mula sa generated snippets, magka-kalat sila. Malalaman mo sa loob ng animnapung segundo.

**Trade-off thinking.** Tinatanong ko ang bawat significant na desisyon. *"Bakit ganyang state management approach?"* Ang sagot na gusto ko ay hindi "kasi 'yon ang pinakamahusay." Ang sagot na gusto ko ay *"kasi kasya sa scope na ito, pero ito ang punto kung saan masisira, at ito ang lilipatan ko."* Mas magagaling ang mga engineer na nag-iisip sa trade-offs kaysa sa mga nag-iisip sa absolutes.

**Self-awareness.** *"Ano ang babaguhin mo kung may mas maraming oras ka?"* Ang mga malakas na candidate, nagla-light up sa tanong na 'to. May listahan sila. Alam nila kung saan sila nag-cut corners. Alam nila kung ano ang marupok. Nag-iisip na sila ng improvements mula nang mag-submit sila. Ang mga mahihinang candidate, sasabihin lang *"okay naman ako dito"* at move on.

## Structured na scoring

Isang bagay na gusto ko agad mula day one ay isang **structured scorecard**. Kapag nag-i-scale ka ng team at maraming tao ang kasali sa hiring, lahat kailangan mag-evaluate ng parehong bagay sa parehong paraan. Kung wala 'yon, dalawang interviewer ang pwedeng mag-review ng parehong candidate at magkaiba ang conclusion kasi magkaiba ang tina-timbang nila.

Gumawa ako ng scorecard na hinahati ang evaluation sa mga weighted sections: gumagana ba ang app, matino ba ang data layer, maayos ba ang pagkakastruktura ng code, may tests ba, at kaya ba ng candidate i-explain ang lahat sa walkthrough. Bawat section may specific criteria sa isang consistent scale. **Bawat interviewer, parehong mga bagay ang ine-evaluate sa parehong pagkakasunod-sunod.**

Ang scorecard, nima-map din ng scores sa levels. Isang number ang nagsasabi sa'yo kung graduate, junior, mid, o senior level ang isang tao. Tinatanggal nito ang ambiguity sa levelling conversation. Ang rubric ang nag-iisip. Ang mga tao ang nagve-verify.

## Ang mga senior candidate may mas mahirap na round

Para sa mga senior hires, may dagdag na **system design** conversation. Walang whiteboard. Walang *"i-design mo ang Twitter sa 45 minuto."* Nag-uusap kami tungkol sa totoong scenarios na relevant sa platform na binubuo namin. Ano ang nagbabago kapag 20 teams ang nag-bu-build sa iisang mobile platform? Paano mo hina-handle ang shared dependencies? Ano ang approach mo sa backwards compatibility?

Usapan ito ng dalawang engineer, hindi performance para sa audience. Ang mga pinakamahusay na candidate, **nagpu-push back** sa assumptions ko at nagtatanong para mag-clarify. Exactly 'yan ang behaviour na gusto ko sa isang senior sa team.

## Mga resulta ng unang linggo

Wala pa akong isang linggo sa role. Naka-hire na ako ng isang Senior Engineer sa pamamagitan ng existing process (nangyari 'yon sa day two, bago pa matapos ang bagong test). Pero mula ngayon, ang bagong process na ang standard para sa lahat ng React Native hiring sa buong organisasyon. Ang kapwa ko na EM, na nagpapatakbo ng ibang squad, ni-review ang test at scorecard at pumayag na gamitin din para sa mga hire ng kanyang team. 'Yan ang advantage ng well-documented system: **nag-i-scale lampas sa squad ng isang manager.**

Mag-hire na ako ng dalawang Software Engineers gamit ang bagong process. Bawat candidate, parehong test, parehong starter project, parehong evaluation criteria, at parehong scoring rubric ang matatanggap nila. Kumakaliit ang bias surface area kapag nag-standardize ka.

## Ang aral

Kung papasok ka sa bagong team bilang engineering manager, **tignan mo agad ang hiring process**. Huwag kang maghintay hanggang "natutunan mo na ang codebase" o "naintindihan mo na ang culture." Ang hiring ay isa sa mga pinaka-high-leverage na activities mo. Bawat tao na dala mo, hinuhubog ang team sa mga darating na taon.

At kung ang tech test mo ay hindi na tugma sa hinahanap mo, palitan mo. Huwag mong hayaang ang inertia ang magpanatili ng isang process dahil lang pamilyar ito.

Mag-design ng test na sumasalamin sa totoong trabaho. Bigyan ang mga candidate ng starter project para *engineering* ang tine-test mo, hindi *configuration*. Gawing malinaw ang mga requirements pero hayaan silang gumawa ng sarili nilang desisyon. Tapos umupo ka sa harap nila at itanong mo ***bakit***.

> Ang combination ng maalalahanin na take-home code at structured walkthrough, mas maraming signal ang nakukuha mo sa dalawang oras kaysa sa kahit anong live coding exercise sa dalawang araw.

---
title: "Per què vaig canviar la nostra prova tècnica de React Native la meva primera setmana"
description: "Vaig entrar a Hargreaves Lansdown com a Engineering Manager i vaig canviar el procés de contractació immediatament. Aquí explico per què la prova anterior no funcionava i què vaig construir al seu lloc."
publishDate: 2026-03-29
tags: ["gestió-d-enginyeria", "contractació", "react-native"]
locale: ca
heroImage: "/images/blog/redesigning-react-native-tech-test.jpg"
heroAlt: "Redissenyant una prova tècnica per a contractació en React Native"
hiringUrl: "https://www.linkedin.com/jobs/view/4391097156/"
hiringText: "We're looking for React Native engineers to join the Mobile Platform team at Hargreaves Lansdown."
---

## Una prova pensada per a un altre moment

Quatre dies abans de començar oficialment a Hargreaves Lansdown, vaig anar a l'oficina per una verificació de passaport. Mentre hi era, el meu cap em va comentar que hauria de muntar un equip. La meva primera pregunta va ser si podia canviar el procés d'entrevistes. Va dir que sí. *Ni tan sols havia tingut el meu primer dia.* Quan vaig començar el dia 23, ja estava construint la nova prova.

Sóc el nou Engineering Manager de l'squad de **Mobile Platform**. Estem reconstruint l'app mòbil d'HL en React Native, una migració brownfield des de les apps natives d'iOS i Android. Necessito enginyers que puguin treballar a nivell de plataforma.

No vaig haver de demanar veure la prova tècnica. L'havia fet jo mateix setmanes enrere. Així és com HL em va contractar *a mi*: un exercici de live coding on construeixes una app petita en una hora amb l'entrevistador mirant, seguit de preguntes tècniques d'un qüestionari. Tota l'entrevista durava uns 90 minuts.

La prova tenia sentit en el seu context original. Quan l'equip era més petit i es contractava per a altres rols, era una manera raonable de filtrar candidats ràpidament. Però les nostres necessitats havien canviat. Ja no buscàvem algú per muntar pantalles senzilles. Estàvem contractant **enginyers de plataforma** que serien els propietaris de l'arquitectura sobre la qual tots els altres equips mòbils d'HL construirien.

Necessitava que la prova respongués preguntes diferents:

- Poden estructurar una **app amb múltiples pantalles** i navegació que no s'ensorri?
- Poden cridar una **API real** i gestionar què passa quan la xarxa falla?
- Escriuen **tests** perquè els importa que el software funcioni, o perquè algú els ho ha dit?
- Poden seure davant meu i explicar *per què* ho van construir així?

La prova existent no estava dissenyada per respondre això. Així que en vaig construir una de nova.

## El live coding està trencat

La veritat sobre el live coding: no avalua capacitat d'enginyeria. **Avalua ansietat escènica.**

He estat als dos costats. Tan recentment com el gener d'aquest any, vaig fer un desastre en un exercici de live coding per a un lloc per al qual estava perfectament qualificat. El problema era senzill. Sabia com resoldre'l. Però amb algú observant cada tecla que premia, el meu cap es va quedar en blanc. *No vaig passar.*

Com a entrevistador, he vist el mateix passar-li a candidats. Enginyers brillants que es bloquegen en problemes que resoldrien en cinc minuts si ningú els estigués mirant. El format selecciona gent que rendeix bé sota pressió artificial, no gent que escriu bon software.

Per a un rol d'enginyeria de plataforma, on la feina són decisions d'arquitectura, components de design system i pipelines de CI/CD, el live coding té encara menys sentit. No necessito algú que tecleji ràpid sota pressió. **Necessito algú que pensi amb claredat quan té temps i context.**

## Mostrar vs. explicar

El procés anterior també incloïa un qüestionari tècnic. L'entrevistador triava preguntes d'un full de referència que cobria arquitectura React Native, state management, estratègies de testing i diferències de plataforma, i després comparava les respostes amb les esperades. De vegades els candidats cobrien els temes de manera natural durant el live coding, i l'entrevistador se saltava aquelles preguntes.

Tots són temes vàlids. Són *exactament* les coses que vull que els meus enginyers entenguin. Però demanar a algú que expliqui un concepte en una entrevista et diu si poden **recordar i articular** coneixement. No et diu si poden **aplicar-lo** en condicions reals.

El nou procés avalua els mateixos temes a través del codi del candidat. No necessito preguntar *"com estructuraries la navegació en una app complexa?"* quan puc obrir la seva entrega i veure com la van estructurar realment. No necessito preguntar pel seu enfocament de testing quan puc executar la seva suite de tests. La conversa de walkthrough segueix cobrint arquitectura, trade-offs i profunditat tècnica, però està ancorada en quelcom que el candidat *va construir*, no en quelcom que *va assajar*.

## Què vaig construir al seu lloc

Vaig dissenyar un take-home assessment. Una app petita però real: múltiples pantalles, una API pública, navegació, state management amb regles de negoci reals, TypeScript a tot arreu. No una joguina. Tampoc un projecte de cap de setmana. Quelcom que requereix **pensament arquitectònic genuí**.

Quatre principis van guiar el disseny:

**Reflectir la feina real.** La prova ha de sentir-se com la feina. Si un candidat pot construir aquesta app, pot contribuir al nostre codebase des del primer dia. Si no pot, això també és informació útil.

**Eliminar l'impost del boilerplate.** Dono als candidats un starter project completament configurat. TypeScript, ESLint, Prettier, Jest, React Native Testing Library, path aliases. *Tot preparat.* No m'importa si algú sap configurar un bundler. M'importa si sap escriure codi d'aplicació.

**Ser clar en el què, no en el com.** El brief explica què ha de fer l'app. Mai diu quina llibreria de state management fer servir, com estructurar les carpetes ni quin client d'API triar. Aquestes decisions són la part més reveladora de l'entrega. Un candidat que tria Redux Toolkit per a una app de tres pantalles em diu quelcom diferent d'un que tria Zustand o React Context. Cap dels dos s'equivoca. *Tots dos són interessants.*

**Respectar el temps de la gent.** Els candidats tenen una setmana. La feina hauria de portar de 4 a 6 hores. La gent té feines, famílies, vides. Ningú hauria de demanar un dia lliure per fer una prova tècnica d'una empresa que potser no els contractarà.

## El walkthrough és on passa la màgia

El codi del take-home és la meitat de l'avaluació. L'altra meitat és una trucada de walkthrough: el candidat **fa demo de l'app**, executa els seus tests en directe i recorre el codi.

Aquí és on separes la gent que *va escriure* el codi de la gent que el *va muntar*. I en l'era del codi generat per IA, aquesta distinció importa més que mai.

Tres coses que busco:

**Ownership.** *"Navega al fitxer on gestiones la resposta de l'API."* Si el van escriure, hi aniran directament. Si el van muntar a partir de snippets generats, dubtaran. T'adones en seixanta segons.

**Pensament en trade-offs.** Pregunto per cada decisió significativa. *"Per què aquest enfocament de state management?"* La resposta que vull no és "perquè és el millor." La resposta que vull és *"perquè s'ajusta a aquest abast, però aquí és on es trencaria, i aquí és cap a on migraria."* Els enginyers que pensen en trade-offs construeixen millors sistemes que els que pensen en absoluts.

**Autoconsciència.** *"Què canviaries si tinguessis més temps?"* Els candidats forts s'il·luminen amb aquesta pregunta. Tenen una llista. Saben on van tallar cantonades. Saben què és fràgil. Han estat pensant en millores des que van entregar. Els candidats més febles diuen *"n'estic content"* i segueixen endavant.

## Avaluació estructurada

Una cosa que vaig voler des del primer dia va ser un **scorecard estructurat**. Quan estàs escalant un equip i múltiples persones participen en la contractació, tothom necessita avaluar les mateixes coses de la mateixa manera. Sense això, dos entrevistadors poden revisar el mateix candidat i arribar a conclusions diferents perquè estan ponderant coses diferents.

Vaig construir un scorecard que divideix l'avaluació en seccions ponderades: l'app funciona, la capa de dades és sòlida, el codi està ben estructurat, hi ha tests i el candidat pot explicar-ho tot al walkthrough. Cada secció té criteris específics en una escala consistent. **Cada entrevistador avalua les mateixes coses en el mateix ordre.**

El scorecard també mapeja puntuacions a nivells. Un número et diu si algú està a nivell graduate, junior, mid o senior. Això elimina l'ambigüitat de la conversa de nivell·lació. La rúbrica fa la feina de pensar. Els humans la verifiquen.

## Els candidats senior tenen una ronda més difícil

Per a contractacions senior, hi ha una conversa addicional de **system design**. Sense pissarra. Sense *"dissenya Twitter en 45 minuts."* Parlem d'escenaris reals rellevants a la plataforma que estem construint. Què canvia quan 20 equips construeixen sobre la mateixa plataforma mòbil? Com gestiones dependències compartides? Quin és el teu enfocament per a backwards compatibility?

És una conversa entre dos enginyers, no una actuació per a un públic. Els millors candidats **qüestionen** els meus supòsits i fan preguntes de clarificació. Aquest és exactament el comportament que vull d'un senior a l'equip.

## Resultats de la primera setmana

Porto menys d'una setmana a HL. Ja he contractat un Senior Engineer a través del procés existent (això va passar el segon dia, abans que la nova prova estigués llesta). Però d'ara endavant, el nou procés és l'estàndard per a tota contractació de React Native a la tribu UCX-Core. El meu company EM, que lidera un altre squad, va revisar la prova i el scorecard i va acceptar adoptar-lo per a les contractacions del seu equip també. Aquest és l'avantatge d'un sistema ben documentat: **escala més enllà de l'squad d'un sol manager.**

Estic a punt de contractar dos Software Engineers amb el nou procés. Cada candidat rebrà la mateixa prova, el mateix starter project, els mateixos criteris d'avaluació i la mateixa rúbrica de puntuació. La superfície de biaix es redueix quan estandarditzes.

## La lliçó

Si t'estàs incorporant a un equip nou com a engineering manager, **mira el procés de contractació aviat**. No esperis fins que hagis "après el codebase" o "entès la cultura." La contractació és una de les activitats de més palanquejament que tens. Cada persona que incorpores dona forma a l'equip durant anys.

I si la teva prova tècnica ja no reflecteix el que estàs buscant, canvia-la. No deixis que la inèrcia mantingui un procés només perquè és familiar.

Dissenya una prova que reflecteixi la feina real. Dona als candidats un starter project perquè estiguis avaluant *enginyeria*, no *configuració*. Fes els requisits clars però deixa'ls prendre les seves pròpies decisions. Després seu davant d'ells i pregunta ***per què***.

> La combinació de codi take-home ben pensat i un walkthrough estructurat et dona més senyal en dues hores que qualsevol exercici de live coding en dos dies.

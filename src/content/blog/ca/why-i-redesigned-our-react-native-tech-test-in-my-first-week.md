---
title: "Per què vaig redissenyar la nostra prova tècnica de React Native la meva primera setmana"
description: "Vaig entrar a Hargreaves Lansdown com a Engineering Manager i un dels meus primers projectes va ser repensar el procés de contractació per a rols de plataforma. Aquí explico què vaig aprendre i què vaig construir."
publishDate: 2026-03-29
tags: ["gestió-d-enginyeria", "contractació", "react-native"]
locale: ca
heroImage: "/images/blog/redesigning-react-native-tech-test.jpg"
heroAlt: "Redissenyant una prova tècnica per a contractació en React Native"
hiringUrl: "/hiring/"
hiringText: "We're looking for React Native engineers to join the Mobile Platform team at Hargreaves Lansdown."
campaign: "rn-tech-test-redesign"
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

La prova existent estava dissenyada per a preguntes diferents. Necessitava construir alguna cosa al voltant de les nostres.

## Els límits del live coding

El live coding et diu si algú programa còmodament mentre l'observen. Per a alguns rols, això importa. Per al nostre, necessitava veure una altra cosa.

He estat als dos costats. Tan recentment com el gener d'aquest any, vaig fer un desastre en un exercici de live coding per a un lloc per al qual estava perfectament qualificat. El problema era senzill. Sabia com resoldre'l. Però amb algú observant cada tecla que premia, el meu cap es va quedar en blanc. *No vaig passar.*

Com a entrevistador, he vist el mateix passar-li a candidats. Enginyers capaços que es bloquegen en problemes que resoldrien en cinc minuts asseguts al seu escriptori. El live coding mesura la compostura sota observació. És un senyal vàlid per a alguns rols, però no era el senyal que jo necessitava.

Per a un rol d'enginyeria de plataforma, on la feina són decisions d'arquitectura, components de design system i pipelines de CI/CD, volia veure com els candidats aborden els problemes amb temps i context. **El tipus de pensament que la feina realment requereix.**

## Mostrar vs. explicar

El procés anterior també incloïa un qüestionari tècnic. L'entrevistador triava preguntes d'un full de referència que cobria arquitectura React Native, state management, estratègies de testing i diferències de plataforma, i després comparava les respostes amb les esperades. De vegades els candidats cobrien els temes de manera natural durant el live coding, i l'entrevistador se saltava aquelles preguntes.

Tots són temes vàlids. Són *exactament* les coses que vull que els meus enginyers entenguin. Demanar a algú que expliqui un concepte et diu si entén la teoria. Veure com l'aplica en el seu propi codi et dóna un senyal diferent.

El nou procés avalua els mateixos temes a través del codi del candidat. En lloc de preguntar *"com estructuraries la navegació en una app complexa?"*, puc obrir la seva entrega i veure com la van abordar, i després tenir una conversa més rica sobre les decisions que van prendre. El walkthrough segueix cobrint arquitectura, trade-offs i profunditat tècnica, però està ancorat en quelcom que el candidat *va construir*.

## Què vaig construir al seu lloc

Vaig dissenyar un take-home assessment. Una app petita però real: múltiples pantalles, una API pública, navegació, state management amb regles de negoci reals, TypeScript a tot arreu. No una joguina. Tampoc un projecte de cap de setmana. Quelcom que requereix **pensament arquitectònic genuí**.

Quatre principis van guiar el disseny:

**Reflectir la feina real.** La prova ha de sentir-se com la feina. Si un candidat pot construir aquesta app, pot contribuir al nostre codebase des del primer dia. Si no pot, això també és informació útil.

**Eliminar l'impost del boilerplate.** Dono als candidats un starter project completament configurat. TypeScript, ESLint, Prettier, Jest, React Native Testing Library, path aliases. *Tot preparat.* No m'importa si algú sap configurar un bundler. M'importa si sap escriure codi d'aplicació.

**Ser clar en el què, no en el com.** El brief explica què ha de fer l'app. Mai diu quina llibreria de state management fer servir, com estructurar les carpetes ni quin client d'API triar. Aquestes decisions són la part més reveladora de l'entrega. Un candidat que tria Redux Toolkit per a una app de tres pantalles em diu quelcom diferent d'un que tria Zustand o React Context. Cap dels dos s'equivoca. *Tots dos són interessants.*

**Respectar el temps de la gent.** Els candidats tenen una setmana. La feina hauria de portar de 4 a 6 hores. La gent té feines, famílies, vides. Ningú hauria de demanar un dia lliure per fer una prova tècnica d'una empresa que potser no els contractarà.

## El walkthrough és on passa la màgia

El codi del take-home és la meitat de l'avaluació. L'altra meitat és una trucada de walkthrough: el candidat **fa demo de l'app**, executa els seus tests en directe i recorre el codi.

Aquí és on aprens com de profundament algú entén el que va construir. En l'era del desenvolupament assistit per IA, aquesta comprensió importa més que mai.

Tres coses que busco:

**Ownership.** *"Navega al fitxer on gestiones la resposta de l'API."* Si el van escriure, hi aniran directament. Si no se senten del tot còmodes amb el codi, això es nota ràpidament.

**Pensament en trade-offs.** Pregunto per cada decisió significativa. *"Per què aquest enfocament de state management?"* La resposta que vull no és "perquè és el millor." La resposta que vull és *"perquè s'ajusta a aquest abast, però aquí és on es trencaria, i aquí és cap a on migraria."* Els enginyers que pensen en trade-offs construeixen millors sistemes que els que pensen en absoluts.

**Autoconsciència.** *"Què canviaries si tinguessis més temps?"* Els candidats forts s'il·luminen amb aquesta pregunta. Tenen una llista. Saben on van tallar cantonades. Saben què és fràgil. Han estat pensant en millores des que van entregar. Els candidats amb menys experiència solen dir *"n'estic content"* i segueixen endavant.

## Avaluació estructurada

Una cosa que vaig voler des del primer dia va ser un **scorecard estructurat**. Quan estàs escalant un equip i múltiples persones participen en la contractació, tothom necessita avaluar les mateixes coses de la mateixa manera. Sense això, dos entrevistadors poden revisar el mateix candidat i arribar a conclusions diferents perquè estan ponderant coses diferents.

Vaig construir un scorecard que divideix l'avaluació en seccions ponderades: l'app funciona, la capa de dades és sòlida, el codi està ben estructurat, hi ha tests i el candidat pot explicar-ho tot al walkthrough. Cada secció té criteris específics en una escala consistent. **Cada entrevistador avalua les mateixes coses en el mateix ordre.**

El scorecard també mapeja puntuacions a nivells. Un número et diu si algú està a nivell Graduate, Associate, Software Engineer o Senior. Això elimina l'ambigüitat de la conversa de nivell·lació. La rúbrica fa la feina de pensar. Els humans la verifiquen.

## Els candidats senior tenen una ronda més difícil

Per a contractacions senior, hi ha una conversa addicional de **system design**. Sense pissarra. Sense *"dissenya Twitter en 45 minuts."* Parlem d'escenaris reals rellevants a la plataforma que estem construint. Què canvia quan 20 equips construeixen sobre la mateixa plataforma mòbil? Com gestiones dependències compartides? Quin és el teu enfocament per a backwards compatibility?

És una conversa entre dos enginyers, no una actuació per a un públic. Els millors candidats **qüestionen** els meus supòsits i fan preguntes de clarificació. Aquest és exactament el comportament que vull d'un senior a l'equip.

## Primers dies

En la meva primera setmana a HL, vaig contractar un Senior Engineer a través del procés existent (això va passar el segon dia, abans que la nova prova estigués llesta). D'ara endavant, el nou procés és l'estàndard per a tota contractació de React Native a la tribu UCX-Core. El meu company EM, que lidera un altre squad, va revisar la prova i el scorecard i va acceptar adoptar-lo per a les contractacions del seu equip també. Aquest és l'avantatge d'un sistema ben documentat: **escala més enllà de l'squad d'un sol manager.**

Estic a punt de contractar dos Software Engineers amb el nou procés. Cada candidat rebrà la mateixa prova, el mateix starter project, els mateixos criteris d'avaluació i la mateixa rúbrica de puntuació. La superfície de biaix es redueix quan estandarditzes.

## La lliçó

Si t'estàs incorporant a un equip nou com a engineering manager, **mira el procés de contractació aviat**. No esperis fins que hagis "après el codebase" o "entès la cultura." La contractació és una de les activitats de més palanquejament que tens. Cada persona que incorpores dona forma a l'equip durant anys.

I si la teva prova tècnica ja no reflecteix el que estàs buscant, val la pena revisar-la. Els millors processos de contractació evolucionen al costat de les necessitats de l'equip.

Dissenya una prova que reflecteixi la feina real. Dona als candidats un starter project perquè estiguis avaluant *enginyeria*, no *configuració*. Fes els requisits clars però deixa'ls prendre les seves pròpies decisions. Després seu davant d'ells i pregunta ***per què***.

> La combinació de codi take-home ben pensat i un walkthrough estructurat et dona més senyal en dues hores que qualsevol exercici de live coding en dos dies.

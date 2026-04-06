---
title: "Com vaig dissenyar un scorecard de prova tècnica que funciona de Graduate a Senior"
description: "Com un scorecard basat en checklists va fer que la nostra prova de React Native funcionés per a tots els nivells, de Graduate a Senior. Una guia pràctica per dissenyar un procés de contractació just."
publishDate: 2026-04-13
tags: ["gestió-d-enginyeria", "contractació", "react-native"]
locale: ca
heroImage: "/images/blog/tech-test-scorecard.jpg"
heroAlt: "Dissenyant un scorecard de prova tècnica per a contractació en React Native"


campaign: "tech-test-scorecard"
relatedPosts: ["why-i-redesigned-our-react-native-tech-test-in-my-first-week", "how-to-pass-a-react-native-tech-test", "how-to-write-a-take-home-tech-test-that-candidates-actually-want-to-do"]
---

## El problema del "això és un 3 o un 4?"

Quan vaig començar a construir el procés de contractació per al meu squad, sabia que volia un scorecard estructurat des del primer dia. Vaig escriure sobre la prova tècnica en si en [un post anterior](/blog/why-i-redesigned-our-react-native-tech-test-in-my-first-week/). La prova funcionava. La puntuació, no. Almenys, no com la vaig dissenyar al principi.

El meu primer scorecard feia servir una escala de l'1 al 5 per a cada criteri. "Ús de TypeScript: puntuació 1 a 5." "Gestió d'estat: puntuació 1 a 5." Cada criteri tenia una rúbrica descrivint què significava cada puntuació. Sobre el paper semblava complet.

Després vaig intentar fer-lo servir.

Dues persones van revisar la mateixa entrega. Un va puntuar el TypeScript amb un 3 ("hi ha tipus però no són estrictes"). L'altre va posar un 4 ("tipus nets arreu del codi, bon ús de hooks tipats"). Estaven mirant el mateix codi. Simplement van interpretar la rúbrica de manera diferent.

> 💡 **Consell:** Si dues persones raonables poden no estar d'acord en la puntuació, la rúbrica no és prou específica. El problema no són els revisors. És l'eina.


## Checklists en comptes de rúbriques

La solució era vergonyosament simple: substituir cada puntuació subjectiva per un **checklist de sí/no**.

Així es veia un sol criteri abans i després. Aquest és l'ús de TypeScript:

### Abans: rúbrica subjectiva

| Puntuació | Descripció |
|---|---|
| 5 | Tipat fort arreu del codi, mode estricte, genèrics on correspon |
| 4 | Tipus nets, mínim `any`, props i navegació tipats |
| 3 | Tipus per a les estructures principals, una mica d'`any` solt, funciona però no és estricte |
| 2 | TypeScript mal utilitzat, `any` freqüent, aporta poca seguretat |
| 1 | `any` a tot arreu, bàsicament JavaScript amb extensions `.tsx` |

El problema: "tipus nets" i "tipus per a les estructures principals" són descripcions raonables del mateix codi. Un revisor hi veu un 3, l'altre hi veu un 4. Tots dos tenen raó.

### Després: checklist observable

```
✅ Els fitxers font utilitzen extensions .ts/.tsx
✅ Existeixen interfaces o types per a dades d'API, forma de l'estat i props de components
✅ Els paràmetres de navegació estan tipats
✅ Zero any en codi de producció
☐  Hooks tipats utilitzats (useAppSelector, useAppDispatch)
☐  TypeScript estricte habilitat
☐  Schemas de Zod o Yup per a validació
```

Mateix criteri. Set checks. Cadascun és un fet que pots verificar mirant el codi. Dos revisors marcaran les mateixes caselles perquè no hi ha res a interpretar.

Els quatre primers checks són la línia base (qualsevol candidat competent els tindrà en una entrega de 4 a 6 hores). Els tres últims són senyals d'experiència més profunda. **L'ordre fa el nivellament per tu.**

Vaig fer això per a cada criteri en quatre seccions:

- **Funcionalitat Core**: funciona l'app?
- **Capa de Dades i API**: com obté i gestiona les dades?
- **Qualitat de Codi**: el codi està ben escrit i ben organitzat?
- **Testing**: està provat, i com?

**100 checks. 100 punts. Un punt cadascun.**


## Mateixa prova, diferent sostre

Aquesta és la part que més m'entusiasma. Els checks estan ordenats per quanta inversió representen.

Els primers checks de cada criteri són coses que qualsevol candidat competent aconseguirà en **4 a 6 hores**:

- El FlatList renderitza items?
- Funciona la paginació?
- La pantalla de party té un estat buit?
- Hi ha tipus per a les estructures de dades principals?
- Hi ha almenys un fitxer de test?

Això és la línia base. Si vas construir el que demanava el brief, passes aquests checks.

Els checks de més avall requereixen més temps, més experiència, o totes dues coses:

- GraphQL en comptes de REST
- Validació de respostes en runtime amb Zod
- MSW per fer mock d'HTTP en tests
- Estructura de projecte feature-first
- BDD amb Cucumber
- Llindars de cobertura enforçats

Aquestes no són coses que fas en un cap de setmana. Són patrons que has après construint apps de producció reals.

> 💡 **Idea clau:** Un candidat que inverteix 4 a 6 hores treu entre 50 i 65. Un candidat que inverteix una setmana sencera amb anys d'experiència pot treure 85 a 95. **El brief és el mateix. Les expectatives escalen amb la puntuació.**


## Com es mapegen els nivells

La puntuació total es mapeja directament a un nivell:

| Nivell | Puntuació de code review |
|---|---|
| **Graduate** | 20–45 |
| **Associate** | 46–64 |
| **Software Engineer** | 65–88 |
| **Senior** | 89–100 |

La puntuació del code review no és tot el panorama. La trucada de walkthrough afegeix més senyal. Però el code review és la base.


## Respectar la limitació de temps

Una prova tècnica **no és una app de producció**. Els candidats tenen feines, famílies, vides. T'estan donant el seu vespre o el seu cap de setmana. Penalitzar algú per no implementar una capa de caché o per no co-localitzar els seus estils seria com treure punts a un assaig amb temps per no tenir notes a peu de pàgina.

Per això importen els checks de línia base. Tenir-los tots bé et dona al voltant de **50 a 60 de 100**. Això és territori d'Associate a Software Engineer. A la meva antiga rúbrica, un "3 de 5" *sonava* com a premi de consolació. 55 de 100 al checklist és un resultat positiu amb un camí clar cap al següent nivell.


## Com es veu "per sobre de la línia base"

Els checks de més avall són on els candidats es diferencien. No són requisits. Són **senyals**.

Un candidat que afegeix **tests E2E amb Detox** amb helpers extrets em diu alguna cosa sobre la seva cultura de testing.

Un candidat que implementa **GraphQL amb Apollo** em diu alguna cosa sobre com pensa les APIs.

Un candidat que configura **MSW amb múltiples conjunts de handlers** (èxit, error, 401, timeout, offline) em diu que ja ha depurat fallades d'API en producció.

Res d'això és obligatori. **Tot es nota.**

Els stretch goals se sumen als 100 punts com a bonificacions: cerca, mode fosc, accessibilitat, i18n, estructura feature-first, Storybook, ErrorBoundary. Són les marques d'algú que va tenir temps i va triar invertir-lo bé.


## El walkthrough ho canvia tot

El code review em dona un número. El walkthrough em dona **context**.

Un candidat que treu 65 al code review podria pujar a 85 després del walkthrough si pot articular cada trade-off, explicar què canviaria amb més temps i navegar el seu codebase de memòria. El número mesura el que van construir. La conversa mesura com pensen.

Vaig dissenyar el walkthrough com un conjunt de **taules de preguntes**. Cada pregunta té cinc descripcions de senyal, des de "no troba el codi" fins a "ho explica de memòria amb edge cases." L'entrevistador marca una fila per pregunta. S'ha acabat el "aquell walkthrough va ser un 3 o un 4?"

Per a candidats Senior, hi ha una secció addicional de **disseny de sistemes** a la mateixa trucada. Sense entrevista separada. Els últims 15 a 20 minuts passen de "ensenya'm el teu codi" a "com dissenyaries això per a un equip de 20 enginyers?" Les mateixes taules de preguntes, el mateix format de marcar una fila.


## Què vaig aprendre construint això

Construir aquest scorecard em va ensenyar més sobre disseny de processos de contractació que qualsevol cosa que hagi llegit sobre el tema. Això és el que em va quedar:

**Comença amb checklists, no amb rúbriques.** Cada cop que escrivia una rúbrica ("5 = excel·lent, 3 = bé, 1 = malament"), es convertia en un debat sobre què vol dir "bé". Els checklists acaben el debat. El criteri existeix al codi o no existeix.

**Ordena els checks per inversió, no per importància.** Els primers checks no són més importants que els últims. Només són més assolibles en 4 a 6 hores. Un candidat Senior que se salta el check 3 però clava el check 7 no és penalitzat pel salt perquè el total segueix reflectint el seu nivell.

**Separa el que pots veure del que necessites preguntar.** El scorecard del code review és 100% observable des del codi. Res de "l'arquitectura està neta?" El walkthrough és 100% conversacional. Res de llegir codi durant la trucada. Cada document té una sola feina.

**Respecta la limitació de temps.** Si un check requeriria més de 6 hores de feina d'un Software Engineer competent, pertany a la meitat superior del checklist, no a la línia base. Em vaig enxampar diverses vegades escrivint checks de línia base que en realitat eren expectatives de Senior. La pregunta que em feia tot el temps: *"Esperaria això d'algú fent aquesta prova després de la feina un dimecres al vespre?"* Si la resposta era no, pujava.


## Segueix evolucionant

He fet servir aquest scorecard per a la nostra primera ronda de contractació de React Native. El meu company EM el va revisar i el va adoptar per a les contractacions del seu squad també. Aquesta és la prova d'un bon sistema: **algú altre pot agafar-lo i fer-lo servir sense que tu siguis a la sala.**

No pretenc que sigui perfecte. Els nivells podrien necessitar recalibració després que passin més candidats. Alguns checks podrien resultar massa fàcils o massa difícils. Els stretch goals podrien necessitar reequilibri.

L'estructura és correcta, això sí:

- ✅ Checklists, no rúbriques
- ✅ Fets observables, no opinions
- ✅ Ordenats per inversió
- ✅ La mateixa prova per a tothom
- ✅ Diferent sostre per a diferents nivells

Si estàs muntant un procés de contractació i els teus entrevistadors segueixen sense posar-se d'acord en les puntuacions, prova de substituir la teva rúbrica per un checklist. Et sorprendrà quant d'acord aconsegueixes quan deixes de preguntar *"com de bo és això?"* i comences a preguntar *"això hi és?"*

> Els millors sistemes de puntuació no mesuren el que sents sobre el codi. Mesuren el que hi ha al codi.

*Si vols veure la perspectiva del candidat sobre el que avalua aquest scorecard, vaig escriure un post complementari: [Com aprovar una prova tècnica de React Native](/blog/how-to-pass-a-react-native-tech-test/).*

---
title: "Com escriure una prova tècnica per fer a casa que els candidats realment vulguin fer"
description: "La majoria de proves tècniques fallen per fricció en el setup, enunciats poc clars o per no respectar el temps de la gent. Així és com en vaig dissenyar una per la qual els candidats ens donen les gràcies."
publishDate: 2026-04-20
tags: ["gestió-d-enginyeria", "contractació", "react-native"]
locale: ca
heroImage: "/images/blog/take-home-tech-test-design.jpg"
heroAlt: "Dissenyant una prova tècnica per fer a casa per a enginyers de software"


campaign: "take-home-tech-test"
---

## La prova que ningú acaba

La majoria de proves tècniques fallen abans que el candidat escrigui una sola línia de codi.

Clonen el repo. Fan `npm install`. Alguna cosa peta.

**45 minuts després**, estan depurant un mismatch de versió de Ruby, un CocoaPod que falta o una versió de Node que no funciona amb el bundler. Quan l'app per fi arrenca, ja han cremat la paciència i mig vespre.

Els millors candidats, els que realment vols contractar, són els que més probabilitats tenen de marxar. Tenen opcions. Triaran l'empresa que respecti el seu temps.

> 🚩 **Ens va passar.** El nostre primer candidat va passar dues hores lluitant amb problemes de versió de Ruby abans d'escriure una línia de codi d'aplicació. El seu Ruby del sistema era massa vell. Va actualitzar a Ruby 4, que va trencar el bundler. Va baixar a 3.3, però el bundler vendoritzat era incompatible. Cada pas va ser un intercanvi de missatges. Dues hores. Zero línies de codi d'aplicació.

Aquella experiència va canviar com pensava sobre la prova. Les preguntes estaven bé. **L'experiència de desenvolupament era el problema.**

## Tracta la prova com un producte

Això es va convertir en el meu principi rector. La prova tècnica és la primera interacció real que un candidat té amb la teva cultura d'enginyeria. Tot el que experimenta li diu alguna cosa sobre tu.

Si el setup està trencat → pensen que el teu codebase està trencat.
Si l'enunciat és vague → pensen que les teves specs són vagues.
Si el timeline és irreal → pensen que els teus deadlines són irreals.

Vaig començar a tractar la prova de la mateixa manera que tractaria un producte:

| Pensament de producte | Aplicat a la prova tècnica |
|---|---|
| Recerca d'usuaris | Què frustra els candidats de les proves tècniques? |
| Requisits clars | Un brief detallat amb wireframes i regles |
| Experiència de desenvolupament | Projecte starter, script de setup, path aliases |
| Documentació | Guies enllaçades per a cada pregunta que puguin tenir |
| Millora contínua | Actualitzar després de cada ronda segons el que va anar malament |

Després de l'incident amb Ruby, vaig afegir un script de setup, vaig fixar la versió de Ruby, vaig fer commit d'un Gemfile.lock amb un bundler modern i vaig afegir una secció de troubleshooting al README.

**El candidat següent estava codejant en menys de dos minuts.**

## L'script de setup

La millora més gran: un `setup.sh` que s'encarrega de tot.

```bash
./setup.sh
```

Una sola comanda. El que fa:

- ✅ Comprova la versió de Node (instal·la via nvm si cal)
- ✅ Comprova la versió de Ruby (suporta rbenv, rvm i asdf)
- ✅ Comprova les Xcode CLI tools i CocoaPods
- ✅ Executa `yarn install`
- ✅ Executa `bundle install` i `pod install`
- ✅ Et diu exactament què has d'arreglar si alguna cosa va malament

La decisió de disseny clau: l'script **pregunta abans d'instal·lar res**. Detecta el que el candidat ja té i treballa amb allò. Un candidat que fa servir rbenv rep rbenv. Un candidat que fa servir rvm rep rvm. El seu entorn es respecta, no se sobreescriu.

> 💡 **Tip:** Fixa les versions al repo: `.ruby-version`, `.nvmrc`, `Gemfile.lock` amb un bundler modern. Després escriu un script de setup que les llegeixi. Cada minut que un candidat passa en el setup és un minut que no està escrivint codi.

## El projecte starter

Dono als candidats un projecte completament configurat. No un repo buit. Una app que funciona.

| Inclòs | Per què |
|---|---|
| TypeScript en mode estricte | Cap ambigüitat sobre les expectatives del llenguatge |
| React Navigation v7 amb params tipats | La navegació és boilerplate, no una prova d'habilitat |
| Jest + React Native Testing Library | Configurat amb mocks de mòduls natius, a punt per escriure tests |
| ESLint + Prettier | Estil de codi consistent des de la primera línia |
| Path aliases (`@app/*`) | Res de cadenes d'imports `../../../` |
| Wrapper de render custom per a tests | NavigationContainer inclòs, només renderitza i fes assert |
| Tres pantalles placeholder | "Replace me": punt de partida clar |
| Un smoke test que passa | Prova que el setup funciona abans que canviïn res |

**Tot compila. Tot funciona. El smoke test passa.**

No estic avaluant si algú pot configurar un bundler o depurar un path alias de TypeScript. Estic avaluant si poden **construir codi d'aplicació**. El projecte starter elimina cada obstacle entre "he clonat el repo" i "estic escrivint el meu primer component."

Alguns candidats comencen des de zero igualment. Cap problema. L'starter és opcional. Però la majoria el fan servir, i el resultat és el mateix: en comptes de passar la primera hora lluitant amb configuració, la passen prenent decisions d'arquitectura.

## El brief: clar en el què, no en el com

Algunes proves tècniques especifiquen exactament com construir les coses: quina llibreria de state management, quina estructura de carpetes, quin client d'API. Aquest enfocament funciona quan vols consistència. Però per a nosaltres, aquestes decisions són la part més interessant de l'entrega.

El nostre brief pren un enfocament diferent. Explica en detall **què** ha de fer l'app, i no diu res sobre el **com**.

- **Wireframes de pantalles** mostren les dades i les interaccions (layouts ASCII, no dissenys pixel-perfect)
- **Una taula de requisits** detalla les regles (màxim 6 elements, afegir des del detall, eliminar des de la llista)
- **Una taula de requisits tècnics** llista els no negociables (React Native, TypeScript, React Navigation)

El que falta deliberadament: prescripcions d'arquitectura. El candidat tria el state management, l'estructura de carpetes, el client d'API, l'estratègia de testing.

Un candidat que tria Redux Toolkit em diu alguna cosa diferent d'un que tria Zustand. Cap dels dos s'equivoca. *Tots dos són interessants.* I el raonament darrere de la tria és sobre el que es construeix la conversa del walkthrough.

> 💡 **Tip:** Si el teu brief especifica l'arquitectura, estàs avaluant compliment, no enginyeria. Els millors briefs descriuen el *què* en detall i deixen el *com* completament obert.

## Respectar el temps de la gent

**Els candidats tenen 7 dies. La feina hauria de portar de 4 a 6 hores.**

Ho diem explícitament. Al brief i a la guia d'entrega. Dues vegades, perquè la gent s'ho perd la primera.

7 dies donen flexibilitat. Alguns treballen durant un cap de setmana. Alguns fan una hora cada vespre. Alguns bloquegen un dissabte al matí. El timeline respecta que els candidats tenen feines, famílies i una vida fora del procés d'entrevistes.

L'estimació de 4 a 6 hores és honesta. Jo mateix vaig fer la prova per verificar-ho. Un desenvolupador competent de React Native pot construir les tres pantalles amb state management, integració d'API, tests bàsics i un README en aquest temps. Alguns trien invertir-hi més. És la seva elecció, no la nostra expectativa.

Si un candidat necessita més temps, li donem. Sense preguntes.

> ℹ️ Quedar-se callat i entregar tres dies tard sense explicació és un senyal diferent d'enviar un missatge dient "necessito un parell de dies més." La comunicació importa.

## Digues-los què busques

Al principi, un candidat ens va dir que havia passat una hora estilitzant botons perquè va assumir que el polit visual ens importava. No era així. Estàvem mirant arquitectura i testing. Aquella hora es va malgastar perquè no li havíem dit què comptava.

Ara som explícits:

```
✅ Com penses l'arquitectura i l'organització del codi
✅ Com descomposes un problema en components i fluxos de dades
✅ Com prens i justifiques decisions tècniques
✅ Com gestiones casos límit i estats d'error
✅ Com de bé coneixes el teu propi codi

❌ NO estem avaluant disseny visual ni UI pixel-perfect
❌ NO esperem una app production-ready en una prova per fer a casa
```

Quan els candidats saben que ens importa més l'arquitectura i els trade-offs que l'styling, distribueixen el seu temps en conseqüència. **Millor senyal per a nosaltres. Millor experiència per a ells.**

També els expliquem d'entrada que podem fer servir eines d'IA com a pre-check, però que cada entrega és revisada i puntuada manualment pel panel de contractació. La transparència genera confiança.

## El walkthrough no és un interrogatori

El walkthrough és una conversa. El candidat lidera els primers 10 minuts:

1. **Demo de l'app**: recórrer totes les pantalles, mostrar les features funcionant
2. **Executar els tests**: mostrar-los passant en directe
3. **Recórrer el codi**: explicar l'estructura i les decisions

Després de la presentació, fem preguntes. Però l'enquadrament importa. Diem:

> *"No et preocupis si alguna cosa no funciona com esperaves durant la demo. Passa. Si passa, explica'm què creus que ha fallat i com ho arreglaries. Això em diu més que una demo perfecta."*

No és només ser amable. Veure algú diagnosticar un bug al seu propi codi és un dels senyals més forts que pots obtenir. Un candidat que diu *"Ah, crec que el dependency array del useEffect està malament aquí"* t'està mostrant exactament com treballa.

Una demo perfecta no et mostra res excepte que ha assajat.

## La documentació com a feature de primera classe

La prova ve amb documentació de veritat. No només un README. Un conjunt d'arxius markdown enllaçats:

| Document | Què cobreix |
|---|---|
| **Brief de la prova** | Requisits, wireframes de pantalles, regles de l'exercici, requisits tècnics |
| **Guia d'API** | Endpoints, opcions de GraphQL vs REST, recomanacions de clients |
| **Projecte Starter** | Què inclou, estructura del projecte, comandes disponibles, setup de testing |
| **Entrega i Walkthrough** | Com entregar, què passa al walkthrough, tips |
| **Stretch Goals** | Extras opcionals i què demostra cadascun |

Cada pregunta que un candidat pugui tenir està resposta abans que necessiti fer-la. No es tracta només de ser útil. Es tracta d'**eliminar l'ambigüitat com a variable**. No vull avaluar com de bé algú interpreta un brief vague. Vull avaluar com construeixen software quan els requisits són clars.

## Què canviaria la propera vegada

La prova no és perfecta. Això és el que tinc a la meva llista:

- **Un vídeo walkthrough del projecte starter.** Un Loom de 3 minuts mostrant l'estructura de carpetes, com executar-lo i per on començar. Algunes persones aprenen millor amb vídeo que amb docs.
- **Un arxiu `.env.example`.** Tot i que la prova fa servir una API pública sense keys, estableix el patró correcte.
- **Provar el setup en una màquina neta.** Vaig construir la prova al meu propi portàtil amb anys d'eines instal·lades. Cada suposició sobre "tothom té això instal·lat" era incorrecta. El primer candidat ho va demostrar.

L'estructura està bé igualment. Script de setup. Projecte starter. Brief clar. Timeline honest. Documentació de veritat. Criteris d'avaluació transparents.

Si estàs dissenyant una prova tècnica i els candidats segueixen abandonant, no miris les preguntes primer. Mira l'experiència de desenvolupament. **La millor prova tècnica és una on el candidat passa el 100% del seu temps en allò que realment estàs avaluant, i el 0% en tot el resta.**

*Aquest és l'últim post d'una sèrie sobre construir un procés de contractació des de zero. Els posts anteriors cobreixen [per què vaig redissenyar la prova](/ca/blog/why-i-redesigned-our-react-native-tech-test-in-my-first-week/), [consells per a candidats que la fan](/ca/blog/how-to-pass-a-react-native-tech-test/) i [com funciona la puntuació](/ca/blog/how-i-designed-a-tech-test-scorecard-that-works-from-graduate-to-senior/).*

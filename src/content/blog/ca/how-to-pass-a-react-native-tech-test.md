---
title: "Com aprovar una prova tècnica de React Native"
description: "Consells pràctics d'algú que revisa entregues de proves tècniques take-home. Què importa de debò, què no, i els errors que costen el lloc als candidats."
publishDate: 2026-04-06
tags: ["react-native", "hiring", "career-advice", "tech-interviews"]
locale: ca
heroImage: "/images/blog/react-native-tech-test-tips.jpg"
heroAlt: "Com aprovar una prova tècnica de React Native"


campaign: "pass-rn-tech-test"
relatedPosts: ["why-i-redesigned-our-react-native-tech-test-in-my-first-week", "how-i-designed-a-tech-test-scorecard-that-works-from-graduate-to-senior", "how-to-write-a-take-home-tech-test-that-candidates-actually-want-to-do"]
---

## Això és des de l'altre costat de la taula

Reviso entregues de proves tècniques de React Native. He vist què fa que contractin algú i què fa que el rebutgin. La majoria dels rebutjos no són perquè el candidat no sàpiga programar. Són perquè no va mostrar les coses correctes.

Aquest post és el consell que donaria a un amic abans d'entregar una prova tècnica per fer a casa. No és teoria. Són coses específiques i pràctiques que et porten de "potser" a "sí."

*Vaig escriure sobre per què vaig redissenyar una prova tècnica des de la perspectiva del hiring manager en [un altre post](/ca/blog/why-i-redesigned-our-react-native-tech-test-in-my-first-week/). Aquest és l'altre costat: com aprovar-ne una.*

## Llegeix el brief dues vegades. Després torna'l a llegir.

Sembla obvi. És l'error més comú.

Si el brief diu "construeix tres pantalles amb navegació," no en construeixis dues. Si diu "fes servir TypeScript," no facis servir JavaScript. Si diu "gestiona una llista de fins a 6 items," assegura't que afegir-ne un 7è es gestioni amb gràcia.

**Els revisors verifiquen els requisits com una checklist.** Cada requisit que falta són punts perduts. No perquè siguem pedants, sinó perquè seguir una especificació és part de la feina. Si et saltes requisits en una prova tècnica amb un brief clar, què passa amb un ticket de Jira ambigu?

> 💡 **Tip:** Llegeix el brief abans de començar. Torna'l a llegir a la meitat. Llegeix-lo un últim cop abans d'entregar.

## L'estructura del projecte importa més del que et penses

La primera cosa que faig quan obro una entrega és mirar l'estructura de carpetes. Abans de llegir una sola línia de codi, l'estructura em diu com penses.

**Estructura per tipus** (screens/, components/, hooks/, services/):
```
src/
  components/
  hooks/
  screens/
  services/
  types/
```

**Estructura per feature** (cada feature és autocontingut):
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

Cap de les dues és incorrecta. Però l'estructura per feature mostra que has pensat en com escala l'app. Si pregunto "què passa quan 5 equips treballen en aquest codebase?" i la teva estructura ja respon aquesta pregunta, vas al davant.

> 🚩 **Red flag:** Tot en una carpeta plana `src/` sense organització. Suggereix que el codi va començar abans de planificar l'arquitectura.

## TypeScript no és opcional

Encara que el brief digui "TypeScript preferit," tracta-ho com a obligatori. Entregar JavaScript pur el 2026 és un downgrade automàtic.

Però no n'hi ha prou amb fer servir TypeScript. Fes-lo servir *bé*:

| Fes això | Per què importa |
|---|---|
| Tipa les teves props | Cada component hauria de tenir una interfície de props tipada |
| Tipa les respostes de l'API | No facis servir `any` per les dades que tornen del servidor |
| Tipa els params de navegació | React Navigation té un suport de TypeScript excel·lent |

L'únic `any` que perdonaré: tipus complexos de llibreries de tercers que portarien una hora a resoldre. Reconeix-ho en un comentari. *"// TODO: tipar això bé — em vaig quedar sense temps"* és millor que fer veure que no existeix.

> 🚩 **Red flag:** `any` escampat per tot el codebase sense cap reconeixement.

## State management: tria'n un i fes-te'n responsable

No m'importa si fas servir Redux Toolkit, Zustand, React Context o Jotai. M'importa que ho hagis triat deliberadament i puguis explicar per què.

| Elecció | Quin senyal dona |
|---|---|
| **Context** per a una app de tres pantalles | Perfectament raonable. Lleuger, sense dependències. |
| **Redux Toolkit** per a una app de tres pantalles | Bé, però et preguntaré per què. "És el que millor conec" és una resposta honesta. |
| **Zustand** amb un store net | Mostra que estàs al dia amb l'ecosistema. |

Si tries Redux, **fes servir Redux Toolkit**. No el vell patró de reducer amb `switch/case`. Si veig `createStore` en lloc de `configureStore`, o constants manuals d'action types en lloc de `createSlice`, suggereix que el coneixement de Redux podria necessitar una actualització.

**El que realment importa:**

- ✅ Lògica d'estat separada de la UI
- ✅ Actions, reducers i selectors en els seus propis fitxers
- ✅ Regles de negoci (com la mida màxima del grup) aplicades a la capa d'estat
- ✅ Actualitzacions predictibles
- ❌ Lògica de negoci vivint dins dels components
- ❌ Estat escampat entre crides a `useState` sense cap patró clar

**No facis dispatch d'un fetch cada vegada que es munta una pantalla.** Si navego a una pantalla de detall, torno enrere, i navego a la mateixa pantalla de detall, no hauria de veure un spinner de càrrega una altra vegada. Un simple `if (!data[id])` abans del teu `dispatch(fetchDetails(id))` és suficient.

## Tests: qualitat per sobre de cobertura

No necessites un 90% de cobertura. Necessites tests *significatius*. Tres bons tests guanyen a vint snapshot tests.

**El que vull veure:**

| Tipus de test | Exemple |
|---|---|
| Lògica de negoci | Si hi ha una regla (màxim 6 a la llista, sense duplicats), prova-la. Els reducers i selectors són els tests de més valor. |
| Interaccions d'usuari | Renderitza un component amb RNTL, prem un botó, comprova el resultat. Fes servir `render`, `fireEvent`, `waitFor`. |
| Edge cases | Què passa quan intentes afegir un duplicat? Quan la llista és buida? Al límit de paginació? |
| Tests que passin | Executa'ls abans d'entregar. Tests que fallen són senyal de feina inacabada. |

**El que no vull veure:**

- ❌ **Snapshot tests a tot arreu.** Es trenquen amb cada canvi de UI i no demostren res sobre el comportament.
- ❌ **Tests que ho simulen tot.** Si el teu test simula la funció que està provant, està provant el mock.
- ❌ **Cap test.** És difícil recuperar-se d'això al walkthrough.

> 💡 **Tip:** 5-10 tests enfocats que cobreixin els camins crítics. Reducers, selectors, interaccions clau. Amb això n'hi ha prou.

## Gestiona els estats de càrrega, error i buit

Aquí és on els candidats destaquen. Qualsevol pot construir el camí feliç. La pregunta és: què passa quan les coses van malament?

| Estat | Què fer |
|---|---|
| **Càrrega** | Mostra un spinner o skeleton a la primera càrrega. Mostra un indicador subtil durant la paginació. No mostris un spinner de pantalla completa per 100ms. |
| **Error** | Si l'API falla, digues-ho a l'usuari. Un botó de reintentar és millor que res. Un missatge informatiu és millor que "Alguna cosa ha anat malament." |
| **Buit** | Si la llista és buida o no hi ha items desats, mostra alguna cosa útil. No una pantalla en blanc. |

> 🚩 **Red flag:** L'app peta amb una xarxa lenta. Sense estat de càrrega, sense gestió d'errors. El revisor obre DevTools, limita la xarxa, i l'app s'ensorra.

## La crida a l'API importa

**GraphQL vs REST:** si el brief ofereix tots dos, GraphQL és l'opció més forta. Mostra que pots treballar amb patrons d'API moderns. Però un client REST ben implementat guanya a un setup de GraphQL desordenat.

**Fes servir FlatList o FlashList. Mai ScrollView per a llistes.** `ScrollView` renderitza cada item de cop. Amb més de 100 items, veuràs caigudes de frames, pics de memòria i crashes eventuals. `FlatList` virtualitza la llista, renderitzant només el que és a la pantalla. Si veig un `ScrollView` embolcallant un `.map()` per a una llista de dades, suggereix una bretxa en la comprensió del model de renderitzat de React Native.

**Altres coses que es noten:**

- ✅ Caching: no tornis a fer fetch de dades que ja tens
- ✅ Paginació: no facis fetch de 1000 items a la primera càrrega
- ✅ ErrorBoundary: captura errors de JavaScript i mostra un fallback en lloc d'una pantalla blanca

## Els edge cases són on destaquis

El camí feliç és el mínim. El que separa una entrega de nivell Software Engineer d'una de Senior és la gestió d'edge cases:

- **Llista plena?** Què passa quan algú intenta afegir un 7è item? Un toast, un botó deshabilitat, un modal. Qualsevol cosa excepte fallar silenciosament.
- **Llista buida?** Mostra un estat buit amb sentit, no una pantalla en blanc.
- **Taps ràpids?** Prémer "afegir" cinc vegades ràpid causa duplicats o crashes?
- **Navegació enrere?** Quan torno del detall a la llista, es preserva la meva posició de scroll?
- **Final de la llista?** La paginació s'atura netament quan no hi ha més dades?

No necessites gestionar tots aquests. Però gestionar-ne *alguns* mostra que penses en usuaris reals, no només en complir requisits.

## El README és part de la prova

Escriu un README. No una novel·la. Un document curt que cobreixi:

| Secció | Què escriure |
|---|---|
| **Com executar-ho** | `yarn install`, `yarn ios`, fet. Passos extra documentats. |
| **Què has construït** | Un paràgraf de resum. |
| **Decisions que has pres** | Per què aquest state management? Per què aquesta estructura de carpetes? Dues frases cadascuna. |
| **Què milloraries** | Aquesta és la secció més important. Mostra autoconsciència. |

> 💡 **La secció de "què milloraria" és un truc.** Et permet reconèixer les dreceres que has pres sense que el revisor les descobreixi com a defectes. *"Amb més temps, afegiria tests E2E amb Detox i implementaria caching adequat"* converteix una feature que falta en una demostració de criteri.

## El walkthrough: aquí és on es guanyen els llocs

Si la prova té una trucada de walkthrough, prepara't. El codi t'ha ficat a la sala. El walkthrough et dóna l'oferta.

**Coneix el teu codi.** Si dic "mostra'm on gestioneu la resposta de l'API," hauries de navegar-hi en menys de 5 segons. Si dubtes, pot generar preguntes sobre com de bé coneixes el codi.

**Explica els teus trade-offs.** No esperis que pregunti. Quan mostres una secció de codi, digues *"He triat aquest enfocament perquè X, però sé que el trade-off és Y."* Aquesta és la resposta que busco abans ni tan sols de fer la pregunta.

**Sigues honest sobre les dreceres.** *"He fet servir Context aquí perquè era més ràpid, però en una app de producció ho mouria a Zustand un cop l'estat es tornés més complex."* Això és una resposta forta. *"Crec que Context és el millor enfocament"* és una de més feble.

**Tingues una llista de millores.** Quan pregunti "què canviaries amb més temps?" la pitjor resposta és "res, n'estic content." La millor resposta és una llista prioritzada: *"Primer afegiria caching, després tests E2E, després refactoritzaria a carpetes per feature."*

**Fes preguntes de tornada.** Els millors walkthroughs són converses, no presentacions. Pregunta sobre l'arquitectura de l'equip, el seu enfocament de testing, el seu procés de deploy. Mostra que tu també estàs avaluant el lloc, no només esperant aprovar.

## Stretch goals: fes-los, però fes-los bé

Si el brief menciona extras opcionals, tria'n un o dos que puguis fer *bé*. No intentis fer-los tots malament.

| Val la pena triar | Per què |
|---|---|
| **Cerca/filtre** | Ràpid d'implementar, immediatament visible, mostra que penses en UX. |
| **Accessibilitat** | Labels, roles, contrast. La majoria dels candidats se la salten. Fer fins i tot accessibilitat bàsica et fa destacar. |
| **Gestió d'errors/offline** | Un botó de reintentar quan falla la xarxa. Mostra que penses en condicions del món real. |

| Evitar tret que ho puguis fer bé | Per què |
|---|---|
| **Animacions** | Les animacions a mig fer es veuen pitjor que no tenir animacions. |
| **Dark mode** | Si no és consistent a totes les pantalles, és un problema. |

> 💡 **Un stretch goal ben executat val més que tres a mig fer.**

## Els errors que realment costen el lloc a la gent

No són sobre qualitat de codi. Són sobre senyals.

| Error | Per què fa mal |
|---|---|
| **No llegir el brief bé** | Saltar-se un requisit central. Construir dues pantalles quan el brief en diu tres. |
| **Cap test** | Fins i tot dos o tres tests mostren que et preocupa la qualitat. Zero és un senyal negatiu fort. |
| **Codi generat per IA que no pots explicar** | Fer servir IA per ajudar-te està bé. Entregar codi que no entens, no. Es fa evident al walkthrough. |
| **Sobreenginyeria** | Una prova tècnica no necessita un design system i una arquitectura de micro-frontends. Construeix el que demana el brief, bé. |
| **Entregar tard sense comunicar** | Si necessites més temps, demana'l. Desaparèixer i entregar tres dies tard és un red flag. |

## El que més importa de tot

**Mostra que penses.** No només que programes.

Qualsevol pot construir pantalles. Els candidats que són contractats són els que demostren criteri: per què van triar aquest enfocament, què farien diferent, on es trencaria el codi a escala, quins tests realment importen.

La prova tècnica no està avaluant si pots escriure React Native. Està avaluant si pots prendre bones decisions i comunicar-les amb claredat.

> Construeix alguna cosa neta, prova les parts importants, documenta el teu raonament, i prepara't per parlar-ne amb honestedat. Això és tot. Aquest és tot el secret.

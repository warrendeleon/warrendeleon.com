---
title: "He construït una app que el comitè de contractació no obrirà mai"
description: "De Notion a markdown i a una app de React per a entrevistes tècniques estructurades. Tres intents per trobar el format que funcionés a la trucada i al comitè."
tags: ["engineering-management", "hiring", "react", "internal-tools"]
locale: ca
heroImage: "/images/blog/interview-kit.webp"
heroAlt: "Interview Kit executant-se en un portàtil durant una entrevista tècnica"
campaign: "interview-kit"
relatedPosts: ["how-i-designed-a-tech-test-scorecard-that-works-from-graduate-to-senior", "why-i-redesigned-our-react-native-tech-test-in-my-first-week", "how-to-write-a-take-home-tech-test-that-candidates-actually-want-to-do"]
---

## El que veu el comitè, i el que no veu

Un PDF de 7 pàgines adjunt a un correu. Aquesta és tota la superfície que el comitè de contractació arriba a tocar. Ni l'assistent, ni els temporitzadors, ni l'autoguardat, ni les dreceres de teclat, ni les puntuacions amb codi de colors. L'app existeix per a una sola persona: l'entrevistador, durant la trucada.

El PDF és el que porta la feina: puntuacions, notes, fortaleses i àrees de millora, la decisió de contractar o no, i quatre apèndixs d'evidències. Tot el que el comitè necessita per fer una oferta o passar al següent.

La majoria de comitès no es posaran a treballar amb una eina de revisió de codi, i seria estrany demanar-los-ho. La seva feina és la decisió, no la introducció de dades. La feina de l'app és que les dades que arriben a la pàgina valguin la seva atenció.

Arribar fins aquí em va portar tres intents i un bug que va estar a punt de costar a un candidat la seva puntuació.

## El problema del format

Vaig dissenyar els scorecards per al nostre procés de contractació en React Native [a principis d'aquest any](/ca/blog/how-i-designed-a-tech-test-scorecard-that-works-from-graduate-to-senior/). Tres avaluacions: una revisió de codi de 100 checks, una entrevista de walkthrough puntuada d'1 a 5, i una entrevista conductual mapejada als nostres cinc valors. La puntuació funcionava. El format que estava utilitzant per capturar aquestes puntuacions durant una trucada en directe no.

L'entrevista de walkthrough és la part més difícil. Un candidat comparteix la seva pantalla, et mostra [la prova tècnica que ha construït](/ca/blog/how-to-write-a-take-home-tech-test-that-candidates-actually-want-to-do/), explica les seves decisions. Jo he de llegir una pregunta del guió, escoltar, puntuar-la d'1 a 5, escriure notes, mirar el rellotge i passar a la següent. Tot mantenint el contacte visual i que la conversa flueixi amb naturalitat.

Prova-ho en una taula de markdown dins de VS Code. El cursor cau a la cel·la equivocada. La posició de scroll es desplaça. El candidat sent que escrius i va més a poc a poc.

## Tres intents

Notion va ser la meva primera idea. L'utilitzo per a tot el personal. Però no és una eina que fem servir a la feina, i construir sobre una plataforma que seria només per a mi semblava un carreró sense sortida. Vaig descartar la idea abans de començar.

Després van venir els fitxers markdown. Un `.md` per scorecard, taules per a les puntuacions, espai per a notes. La revisió de codi funcionava bé així. 100 checks de sí o no que completes *després* de l'entrevista al teu propi ritme. Els scorecards de walkthrough i conductual havien de funcionar *durant* la trucada, i el markdown s'hi posava pel mig. Trobar la fila correcta, escriure un número, fer scroll a la següent secció. Precís, però lent. Prestava més atenció al document que a la persona.

Després de l'entrevista era pitjor. Tres fitxers markdown separats, amb tres formats diferents, cosits a mà en un únic document coherent per a l'equip de selecció. Cada vegada trigava més del que volia.

El tercer intent va ser una app de React en localhost. Sense backend, sense base de dades, sense desplegament. Només `npm run dev` i una pestanya del navegador. Tot es persisteix a `localStorage`. L'app mor quan tanco la pestanya i torna quan l'obro de nou.

## Estar present durant la trucada

L'objectiu era deixar de barallar-me amb l'eina durant l'entrevista. Tres coses van marcar la diferència.

**Una pregunta per pantalla.** El walkthrough és un assistent pas a pas. Cada pas mostra el guió per llegir en veu alta (en un blockquote blau perquè el trobi a l'instant), les preguntes amb botons grans d'1 a 5, i un camp de notes. Sense scroll. Sense buscar la secció correcta. Premo "Següent" i apareix el següent grup. Per a [candidats sèniors](/ca/blog/how-to-pass-a-react-native-tech-test/), l'assistent s'amplia de 4 passos a 8 amb una Part B addicional sobre disseny de sistemes.

**Puntuació amb teclat.** Prem d'1 a 5 i la puntuació es registra a l'instant. Sense clics, sense menús desplegables, sense diàlegs de confirmació. Els meus ulls segueixen a la videotrucada. La puntuació passa per la meva visió perifèrica.

**Un temporitzador de secció a la cantonada.** No és un compte enrere, només una visualització discreta del temps transcorregut. El vaig mirar durant el primer walkthrough i em vaig adonar que havia passat 8 minuts en una secció que hauria de durar-ne 4. Sense ell m'hauria passat de temps i hauria hagut de retallar l'última secció. El candidat hauria perdut l'oportunitat de respondre preguntes que podrien haver-li pujat la nota.

## El bug que puntuava tot igual

L'stack és React 19, TypeScript, Vite i Tailwind v4. Sense llibreria de gestió d'estat. Un hook personalitzat `useLocalStorage` i React Router.

Durant les proves, vaig puntuar el walkthrough d'un candidat de principi a fi. Cada secció, cada pregunta, notes completes. Vaig prémer "Següent" per arribar a la pantalla de resum i vaig veure que totes les seccions tenien la mateixa puntuació: la que havia introduït a l'últim pas.

Un bug de stale closure. El `useCallback` de cada pas de l'assistent capturava les dades del walkthrough del render *anterior*. Quan el pas 3 desava, sobreescrivia els passos 1 i 2 perquè continuava utilitzant l'estat antic. El clàssic problema de React on l'estat dins d'un callback no s'actualitza quan creus que sí.

La solució va ser deixar de confiar en la vista de React de les dades a les escriptures. Cada mutació llegeix l'estat *actual* del candidat directament des de `localStorage` en lloc d'un closure capturat. Un helper `freshCandidate()` que crida `localStorage.getItem` a cada desat. No és elegant. Funciona sempre.

```typescript
function freshCandidate(id: string): Candidate | undefined {
  const raw = localStorage.getItem('ik-candidates');
  if (!raw) return undefined;
  return JSON.parse(raw).find((c: Candidate) => c.id === id);
}
```

El mateix patró es repeteix en tres hooks: `useWalkthrough`, `useBehavioural` i `useCodeReview`. Cadascun llegeix fresc, escriu fresc, i dispara un esdeveniment personalitzat (`ls-sync`) perquè les altres instàncies del hook detectin el canvi. Vint línies de codi de persistència. Sense Redux, sense context providers, sense middleware.

## El PDF que ningú em veu construir

Després de l'entrevista, premo "Imprimir / PDF" i el navegador genera un Candidate Assessment Report. Sense llibreria de PDF. Només CSS d'impressió.

La pàgina 1 és el resum: una taula de puntuacions, el nivell recomanat, la decisió de contractar o no, i el nivell de l'oferta. Les pàgines 2 i 3 mostren fortaleses i àrees de millora extretes de les tres avaluacions, agrupades per origen. Després, quatre apèndixs: desglossament de la revisió de codi, puntuacions del walkthrough amb cada pregunta i nota, puntuacions conductuals per valor, i una taula de referència dels nivells amb el del candidat ressaltat en blau marí.

Aquesta taula de nivells mapeja la puntuació combinada a un dels 12 graons: des de Graduate 1 fins a Senior 2+. El graó **2+** és deliberadament difícil d'assolir. Marca algú al cim de la seva categoria, empenyent cap a la següent. Quan un membre del comitè veu "Associate 2+" al PDF, la lectura és immediata: Associate fort, no del tot SE. Aquesta sola etiqueta porta més senyal que un paràgraf de justificació.

El filtre conductual afegeix un segon control. Un candidat que puntuï per sota de 10/25 en valors no avança, independentment de la seva puntuació tècnica. Entre 10 i 14 dispara una discussió del comitè. 15 o més passa el filtre. Les habilitats tècniques es poden ensenyar. Els desajustos de valors creen problemes que creixen amb el temps.

## El CSS d'impressió és una disciplina a part

Vaig escriure més CSS per a `@media print` que per a pantalla. És la part que més em va sorprendre.

El fons blau marí del quadre de puntuació combinada? **No s'imprimeix.** Els navegadors eliminen els colors de fons per defecte. Vaig haver de convertir-lo en un quadre blanc amb una vora negra gruixuda utilitzant selectors `[style*="background: #002147"]` al full d'estils d'impressió. Les classes utilitàries de Tailwind com `bg-white` necessiten selectors d'atribut (`[class*="bg-white"]`) per sobreescriure el padding, les vores i els marges en la impressió.

`page-break-inside: avoid` és un suggeriment, no una ordre. El navegador trencarà dins d'un element si l'alternativa és una pàgina gairebé buida. Vaig passar una hora depurant per què una secció de fortaleses es partia en dues pàgines abans d'adonar-me que el contingut era simplement massa alt per a l'espai restant.

Els estils dels encapçalaments necessitaven un `border-bottom` inline explícit perquè les classes de Tailwind s'eliminen o sobreescriuen amb el reset d'impressió. Les mides de font canvien de `rem` a `pt`. Els elements interactius (textareas, checkboxes, dropdowns) s'amaguen. Tot el layout d'impressió viu en un component `CandidatePrintReport` separat que es renderitza dins de `hidden print:block`. Separació neta. La pantalla mai veu el layout d'impressió, la impressió mai veu els botons.

Si ho construís una altra vegada, dissenyaria primer el layout d'impressió i després el de pantalla. El PDF és l'artefacte que importa. La pantalla és el formulari d'entrada.

## El que canviaria

**Tests abans que la lògica de puntuació.** Les deduccions per red flags, els bonus per stretch goals, els lookups dels nivells, el llindar del filtre conductual. Ara són funcions pures, extretes a `utils/scoring.ts`, i són el tipus de codi que es trenca en silenci quan toques un límit. Les vaig escriure al final. Haurien d'haver estat el primer.

**El parser d'importació de markdown és fràgil.** Utilitza regex per llegir els valors Y/N dels fitxers de revisió de codi puntuats. Funciona per al format concret que vaig dissenyar, però una disposició de taula diferent o una columna extra i es trenca. Un parser de debò amb recuperació d'errors aguantaria millor.

**L'accessibilitat va arribar tard.** El compliment de WCAG AA (títols de pàgina per ruta, jerarquia d'encapçalaments, ràtios de contrast de color, roving tabindex als selectors de puntuació, `aria-live` als indicadors de desat) va ser afegit després en lloc d'incorporat des del principi. Ara tot passa. Hauria estat més net construir-lo accessible des del primer dia. Les eines internes mereixen els mateixos estàndards que les públiques.

## La prova real

Vaig utilitzar aquesta app per primera vegada en una entrevista real la setmana passada. El candidat no sabia que estava fent servir res d'inusual. Va presentar la seva [entrega del take-home](/ca/blog/how-to-pass-a-react-native-tech-test/), jo vaig puntuar, vam parlar. Sense scroll, sense escriure en taules de markdown, sense perdre el fil. Després de la trucada, una sola premuda de botó i el PDF estava llest.

Aquest és l'objectiu. La millor eina d'entrevistes és la que el candidat no nota mai. La puntuació, els temporitzadors, els càlculs de nivell, la generació del PDF: tot això hauria de quedar al marge. El comitè llegeix el PDF. El candidat té una conversa. L'eina es manté en silenci entre tots dos.

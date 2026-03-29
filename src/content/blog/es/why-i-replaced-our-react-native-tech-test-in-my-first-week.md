---
title: "Por qué cambié nuestra prueba técnica de React Native en mi primera semana"
description: "Entré a Hargreaves Lansdown como Engineering Manager y cambié el proceso de contratación de inmediato. Así fue por qué la prueba anterior no funcionaba y qué construí en su lugar."
publishDate: 2026-03-29
tags: ["gestión-de-ingeniería", "contratación", "react-native"]
locale: es
heroImage: "/images/blog/redesigning-react-native-tech-test.jpg"
heroAlt: "Rediseñando una prueba técnica para contratación en React Native"
hiringUrl: "https://www.linkedin.com/jobs/view/4391097156/"
hiringText: "We're looking for React Native engineers to join the Mobile Platform team at Hargreaves Lansdown."
---

## Una prueba pensada para otro momento

Cuatro días antes de empezar oficialmente en Hargreaves Lansdown, fui a la oficina para un control de pasaporte. Mientras estaba ahí, mi jefe me comentó que iba a armar un equipo. Mi primera pregunta fue si podía cambiar el proceso de entrevistas. Dijo que sí. *Ni siquiera había tenido mi primer día.* Para cuando arranqué el 23, ya estaba construyendo la nueva prueba.

Soy el nuevo Engineering Manager del squad de **Mobile Platform**. Estamos reconstruyendo la app móvil de HL en React Native, una migración brownfield desde las apps nativas de iOS y Android. Necesito ingenieros que puedan trabajar a nivel de plataforma.

No tuve que pedir ver la prueba técnica. La había hecho yo mismo semanas antes. Así fue como HL me contrató *a mí*: un ejercicio de live coding donde armás una app pequeña en una hora con el entrevistador mirando, seguido de preguntas técnicas de un cuestionario. La entrevista completa duraba unos 90 minutos.

La prueba tenía sentido en su contexto original. Cuando el equipo era más chico y se contrataba para otros roles, era una forma razonable de filtrar candidatos rápido. Pero nuestras necesidades habían cambiado. Ya no estábamos buscando a alguien para armar pantallas simples. Estábamos contratando **ingenieros de plataforma** que serían dueños de la arquitectura sobre la que todos los demás equipos móviles de HL iban a construir.

Necesitaba que la prueba respondiera preguntas distintas:

- ¿Pueden estructurar una **app con múltiples pantallas** y navegación que no se caiga a pedazos?
- ¿Pueden llamar a una **API real** y manejar lo que pasa cuando la red falla?
- ¿Escriben **tests** porque les importa que el software funcione, o porque alguien se los pidió?
- ¿Pueden sentarse frente a mí y explicar *por qué* lo construyeron así?

La prueba existente no estaba diseñada para responder esto. Así que construí una nueva.

## El live coding está roto

La verdad sobre el live coding: no evalúa capacidad de ingeniería. **Evalúa ansiedad escénica.**

Estuve de ambos lados. Tan recientemente como enero de este año, me fue fatal en un ejercicio de live coding para un puesto para el que estaba perfectamente calificado. El problema era simple. Sabía cómo resolverlo. Pero con alguien observando cada tecla que presionaba, mi mente se quedó en blanco. *No pasé.*

Como entrevistador, vi lo mismo pasarle a candidatos. Ingenieros brillantes que se bloquean en problemas que resolverían en cinco minutos si nadie los estuviera mirando. El formato selecciona personas que rinden bien bajo presión artificial, no personas que escriben buen software.

Para un rol de ingeniería de plataforma, donde el trabajo son decisiones de arquitectura, componentes de design system y pipelines de CI/CD, el live coding tiene aún menos sentido. No necesito a alguien que teclee rápido bajo presión. **Necesito a alguien que piense con claridad cuando tiene tiempo y contexto.**

## Mostrar vs. contar

El proceso anterior también incluía un cuestionario técnico. El entrevistador elegía preguntas de una hoja de referencia que cubría arquitectura React Native, state management, estrategias de testing y diferencias de plataforma, y luego comparaba las respuestas con las esperadas. A veces los candidatos cubrían los temas naturalmente durante el live coding, y el entrevistador se saltaba esas preguntas.

Son todos temas válidos. Son *exactamente* las cosas que quiero que mis ingenieros entiendan. Pero pedirle a alguien que explique un concepto en una entrevista te dice si pueden **recordar y articular** conocimiento. No te dice si pueden **aplicarlo** en condiciones reales.

El nuevo proceso evalúa los mismos temas a través del código del candidato. No necesito preguntar *"¿cómo estructurarías la navegación en una app compleja?"* cuando puedo abrir su entrega y ver cómo la estructuraron de verdad. No necesito preguntar por su enfoque de testing cuando puedo correr su suite de tests. La conversación de walkthrough sigue cubriendo arquitectura, trade-offs y profundidad técnica, pero está anclada en algo que el candidato *construyó*, no en algo que *ensayó*.

## Lo que construí en su lugar

Diseñé un take-home assessment. Una app pequeña pero real: múltiples pantallas, una API pública, navegación, state management con reglas de negocio reales, TypeScript en todo. No un juguete. Tampoco un proyecto de fin de semana. Algo que requiere **pensamiento arquitectónico genuino**.

Cuatro principios guiaron el diseño:

**Reflejar el trabajo real.** La prueba debe sentirse como el trabajo. Si un candidato puede construir esta app, puede contribuir a nuestro codebase desde el primer día. Si no puede, eso también es información útil.

**Eliminar el impuesto del boilerplate.** Les doy a los candidatos un starter project completamente configurado. TypeScript, ESLint, Prettier, Jest, React Native Testing Library, path aliases. *Todo listo.* No me importa si alguien sabe configurar un bundler. Me importa si sabe escribir código de aplicación.

**Ser claro en el qué, no en el cómo.** El brief explica qué debe hacer la app. Nunca dice qué librería de state management usar, cómo estructurar las carpetas ni qué cliente de API elegir. Esas decisiones son la parte más reveladora de la entrega. Un candidato que elige Redux Toolkit para una app de tres pantallas me dice algo distinto de uno que elige Zustand o React Context. Ninguno está mal. *Ambos son interesantes.*

**Respetar el tiempo de la gente.** Los candidatos tienen una semana. El trabajo debería tomar de 4 a 6 horas. La gente tiene trabajos, familias, vidas. Nadie debería tener que tomarse un día libre para hacer una prueba técnica de una empresa que quizás no los contrate.

## El walkthrough es donde pasa la magia

El código del take-home es la mitad de la evaluación. La otra mitad es una llamada de walkthrough: el candidato **hace demo de la app**, corre sus tests en vivo y recorre el código.

Acá es donde separás a la gente que *escribió* el código de la gente que lo *ensambló*. Y en la era del código generado por IA, esa distinción importa más que nunca.

Tres cosas que busco:

**Ownership.** *"Navegá al archivo donde manejás la respuesta de la API."* Si lo escribieron, van directo. Si lo ensamblaron de snippets generados, se traban. Te das cuenta en sesenta segundos.

**Pensamiento en trade-offs.** Pregunto por cada decisión significativa. *"¿Por qué este enfoque de state management?"* La respuesta que quiero no es "porque es el mejor." La respuesta que quiero es *"porque se ajusta a este alcance, pero acá es donde se quebraría, y acá es a lo que migraría."* Los ingenieros que piensan en trade-offs construyen mejores sistemas que los que piensan en absolutos.

**Autoconocimiento.** *"¿Qué cambiarías si tuvieras más tiempo?"* Los candidatos fuertes se iluminan con esta pregunta. Tienen una lista. Saben dónde cortaron esquinas. Saben qué es frágil. Vienen pensando en mejoras desde que entregaron. Los candidatos más débiles dicen *"estoy conforme"* y siguen adelante.

## Evaluación estructurada

Algo que quise desde el primer día fue un **scorecard estructurado**. Cuando estás escalando un equipo y varias personas participan en las contrataciones, todos necesitan evaluar las mismas cosas de la misma manera. Sin eso, dos entrevistadores pueden revisar al mismo candidato y llegar a conclusiones distintas porque están ponderando cosas diferentes.

Construí un scorecard que divide la evaluación en secciones ponderadas: la app funciona, la capa de datos es sólida, el código está bien estructurado, hay tests y el candidato puede explicar todo en el walkthrough. Cada sección tiene criterios específicos en una escala consistente. **Cada entrevistador evalúa las mismas cosas en el mismo orden.**

El scorecard también mapea puntuaciones a niveles. Un número te dice si alguien está a nivel graduate, junior, mid o senior. Esto elimina la ambigüedad de la conversación de nivelación. La rúbrica hace el trabajo de pensar. Los humanos la verifican.

## Los candidatos senior tienen una ronda más difícil

Para contrataciones senior, hay una conversación adicional de **system design**. Sin pizarra. Sin *"diseñá Twitter en 45 minutos."* Hablamos sobre escenarios reales relevantes a la plataforma que estamos construyendo. ¿Qué cambia cuando 20 equipos construyen sobre la misma plataforma móvil? ¿Cómo manejás dependencias compartidas? ¿Cuál es tu enfoque para backwards compatibility?

Es una conversación entre dos ingenieros, no una actuación para un público. Los mejores candidatos **cuestionan** mis supuestos y hacen preguntas de clarificación. Ese es exactamente el comportamiento que quiero de un senior en el equipo.

## Resultados de la primera semana

Llevo menos de una semana en HL. Ya contraté a un Senior Engineer a través del proceso existente (eso pasó el segundo día, antes de que la nueva prueba estuviera lista). Pero de ahora en adelante, el nuevo proceso es el estándar para toda contratación de React Native en la tribu UCX-Core. Mi par EM, que lidera otro squad, revisó la prueba y el scorecard y aceptó adoptarlo para las contrataciones de su equipo también. Esa es la ventaja de un sistema bien documentado: **escala más allá del squad de un solo manager.**

Estoy por contratar dos Software Engineers con el nuevo proceso. Cada candidato recibirá la misma prueba, el mismo starter project, los mismos criterios de evaluación y la misma rúbrica de puntuación. La superficie de sesgo se reduce cuando estandarizás.

## La lección

Si te estás sumando a un equipo nuevo como engineering manager, **mirá el proceso de contratación temprano**. No esperes hasta haber "aprendido el codebase" o "entendido la cultura." La contratación es una de las actividades de mayor apalancamiento que tenés. Cada persona que traés moldea al equipo por años.

Y si tu prueba técnica ya no refleja lo que estás buscando, cambiala. No dejes que la inercia mantenga un proceso solo porque es familiar.

Diseñá una prueba que refleje el trabajo real. Dale a los candidatos un starter project para que estés evaluando *ingeniería*, no *configuración*. Hacé los requisitos claros pero dejalos tomar sus propias decisiones. Después sentate frente a ellos y preguntá ***por qué***.

> La combinación de código take-home bien pensado y un walkthrough estructurado te da más señal en dos horas que cualquier ejercicio de live coding en dos días.

---
title: "Por qué rediseñé nuestra prueba técnica de React Native en mi primera semana"
description: "Me incorporé como Engineering Manager y uno de mis primeros proyectos fue repensar el proceso de contratación para roles de plataforma. Esto es lo que aprendí y lo que construí."
publishDate: 2026-03-29
tags: ["engineering-management", "hiring", "tech-interviews"]
locale: es
heroImage: "/images/blog/redesigning-react-native-tech-test.jpg"
heroAlt: "Rediseñando una prueba técnica para contratación en React Native"


campaign: "rn-tech-test-redesign"
relatedPosts: ["how-to-pass-a-react-native-tech-test", "how-i-designed-a-tech-test-scorecard-that-works-from-graduate-to-senior", "how-to-write-a-take-home-tech-test-that-candidates-actually-want-to-do"]
---

## Una prueba pensada para otro momento

Cuatro días antes de empezar, fui a la oficina para un control de pasaporte. Mientras estaba allí, mi jefe me comentó que iba a armar un equipo. Mi primera pregunta fue si podía cambiar el proceso de entrevistas. Dijo que sí. *Ni siquiera había tenido mi primer día.* Para cuando empecé el 23, ya estaba construyendo la nueva prueba.

Soy el nuevo Engineering Manager del squad de **Mobile Platform**. Estamos reconstruyendo la app móvil en React Native, una migración brownfield desde las apps nativas de iOS y Android. Necesito ingenieros que puedan trabajar a nivel de plataforma.

No tuve que pedir ver la prueba técnica. La había hecho yo mismo semanas antes. Así fue como me contrataron *a mí*: un ejercicio de live coding donde montas una app pequeña en una hora con el entrevistador mirando, seguido de preguntas técnicas de un cuestionario. La entrevista completa duraba unos 90 minutos.

La prueba tenía sentido en su contexto original. Cuando el equipo era más pequeño y se contrataba para otros roles, era una forma razonable de filtrar candidatos rápido. Pero nuestras necesidades habían cambiado. Ya no estábamos buscando a alguien para montar pantallas simples. Estábamos contratando **ingenieros de plataforma** que serían dueños de la arquitectura sobre la que todos los demás equipos móviles iban a construir.

Necesitaba que la prueba respondiera preguntas distintas:

- ¿Pueden estructurar una **app con múltiples pantallas** y navegación que no se caiga a pedazos?
- ¿Pueden llamar a una **API real** y manejar lo que pasa cuando la red falla?
- ¿Escriben **tests** porque les importa que el software funcione, o porque alguien se los pidió?
- ¿Pueden sentarse frente a mí y explicar *por qué* lo construyeron así?

La prueba existente estaba diseñada para preguntas distintas. Necesitaba construir algo alrededor de las nuestras.

## Los límites del live coding

El live coding te dice si alguien programa cómodo mientras lo observan. Para algunos roles, eso importa. Para el nuestro, necesitaba ver otra cosa.

Estuve de ambos lados. Tan recientemente como enero de este año, me fue fatal en un ejercicio de live coding para un puesto para el que estaba perfectamente cualificado. El problema era simple. Sabía cómo resolverlo. Pero con alguien observando cada tecla que presionaba, mi mente se quedó en blanco. *No pasé.*

Como entrevistador, vi lo mismo pasarle a candidatos. Ingenieros capaces que se bloquean en problemas que resolverían en cinco minutos sentados en su escritorio. El live coding mide la compostura bajo observación. Es una señal válida para algunos roles, pero no era la señal que yo necesitaba.

Para un rol de ingeniería de plataforma, donde el trabajo son decisiones de arquitectura, componentes de design system y pipelines de CI/CD, quería ver cómo los candidatos abordan los problemas con tiempo y contexto. **El tipo de pensamiento que el puesto realmente requiere.**

## Mostrar vs. contar

El proceso anterior también incluía un cuestionario técnico. El entrevistador elegía preguntas de una hoja de referencia que cubría arquitectura React Native, state management, estrategias de testing y diferencias de plataforma, y luego comparaba las respuestas con las esperadas. A veces los candidatos cubrían los temas naturalmente durante el live coding, y el entrevistador se saltaba esas preguntas.

Son todos temas válidos. Son *exactamente* las cosas que quiero que mis ingenieros entiendan. Pedirle a alguien que explique un concepto te dice si entiende la teoría. Ver cómo lo aplica en su propio código te da una señal distinta.

El nuevo proceso evalúa los mismos temas a través del código del candidato. En vez de preguntar *"¿cómo estructurarías la navegación en una app compleja?"*, puedo abrir su entrega y ver cómo la abordaron, y después tener una conversación más rica sobre las decisiones que tomaron. El walkthrough sigue cubriendo arquitectura, trade-offs y profundidad técnica, pero está anclado en algo que el candidato *construyó*.

## Lo que construí en su lugar

Diseñé un take-home assessment. Una app pequeña pero real: múltiples pantallas, una API pública, navegación, state management con reglas de negocio reales, TypeScript en todo. No un juguete. Tampoco un proyecto de fin de semana. Algo que requiere **pensamiento arquitectónico genuino**.

Cuatro principios guiaron el diseño:

**Reflejar el trabajo real.** La prueba debe sentirse como el trabajo. Si un candidato puede construir esta app, puede contribuir a nuestro codebase desde el primer día. Si no puede, eso también es información útil.

**Eliminar el impuesto del boilerplate.** Les doy a los candidatos un starter project completamente configurado. TypeScript, ESLint, Prettier, Jest, React Native Testing Library, path aliases. *Todo listo.* No me importa si alguien sabe configurar un bundler. Me importa si sabe escribir código de aplicación.

**Ser claro en el qué, no en el cómo.** El brief explica qué debe hacer la app. Nunca dice qué librería de state management usar, cómo estructurar las carpetas ni qué cliente de API elegir. Esas decisiones son la parte más reveladora de la entrega. Un candidato que elige Redux Toolkit para una app de tres pantallas me dice algo distinto de uno que elige Zustand o React Context. Ninguno está mal. *Ambos son interesantes.*

**Respetar el tiempo de la gente.** Los candidatos tienen una semana. El trabajo debería tomar de 4 a 6 horas. La gente tiene trabajos, familias, vidas. Nadie debería tener que tomarse un día libre para hacer una prueba técnica de una empresa que quizás no los contrate.

## El walkthrough es donde pasa la magia

El código del take-home es la mitad de la evaluación. La otra mitad es una llamada de walkthrough: el candidato **hace demo de la app**, corre sus tests en vivo y recorre el código.

Aquí es donde descubres qué tan profundamente alguien entiende lo que construyó. En la era del desarrollo asistido por IA, esa comprensión importa más que nunca.

Tres cosas que busco:

**Ownership.** *"Navega al archivo donde manejas la respuesta de la API."* Si lo escribieron, van directo. Si no se sienten del todo cómodos con el código, eso se nota rápido.

**Pensamiento en trade-offs.** Pregunto por cada decisión significativa. *"¿Por qué este enfoque de state management?"* La respuesta que quiero no es "porque es el mejor." La respuesta que quiero es *"porque se ajusta a este alcance, pero aquí es donde se quebraría, y aquí es a lo que migraría."* Los ingenieros que piensan en trade-offs construyen mejores sistemas que los que piensan en absolutos.

**Autoconocimiento.** *"¿Qué cambiarías si tuvieras más tiempo?"* Los candidatos fuertes se iluminan con esta pregunta. Tienen una lista. Saben dónde cortaron esquinas. Saben qué es frágil. Vienen pensando en mejoras desde que entregaron. Los candidatos con menos experiencia suelen decir *"estoy conforme"* y siguen adelante.

## Evaluación estructurada

Algo que quise desde el primer día fue un **scorecard estructurado**. Cuando estás escalando un equipo y varias personas participan en las contrataciones, todos necesitan evaluar las mismas cosas de la misma manera. Sin eso, dos entrevistadores pueden revisar al mismo candidato y llegar a conclusiones distintas porque están ponderando cosas diferentes.

Construí un scorecard que divide la evaluación en secciones ponderadas: la app funciona, la capa de datos es sólida, el código está bien estructurado, hay tests y el candidato puede explicar todo en el walkthrough. Cada sección tiene criterios específicos en una escala consistente. **Cada entrevistador evalúa las mismas cosas en el mismo orden.**

El scorecard también mapea puntuaciones a niveles. Un número te dice si alguien está a nivel Graduate, Associate, Software Engineer o Senior. Esto elimina la ambigüedad de la conversación de nivelación. La rúbrica hace el trabajo de pensar. Los humanos la verifican.

## Los candidatos senior tienen una ronda más difícil

Para contrataciones senior, hay una conversación adicional de **system design**. Sin pizarra. Sin *"diseña Twitter en 45 minutos."* Hablamos sobre escenarios reales relevantes a la plataforma que estamos construyendo. ¿Qué cambia cuando 20 equipos construyen sobre la misma plataforma móvil? ¿Cómo manejas dependencias compartidas? ¿Cuál es tu enfoque para backwards compatibility?

Es una conversación entre dos ingenieros, no una actuación para un público. Los mejores candidatos **cuestionan** mis supuestos y hacen preguntas de clarificación. Ese es exactamente el comportamiento que quiero de un senior en el equipo.

## Primeros días

En mi primera semana, contraté a un Senior Engineer a través del proceso existente (eso pasó el segundo día, antes de que la nueva prueba estuviera lista). De ahora en adelante, el nuevo proceso es el estándar para toda contratación de React Native en la organización. Mi par EM, que lidera otro squad, revisó la prueba y el scorecard y aceptó adoptarlo para las contrataciones de su equipo también. Esa es la ventaja de un sistema bien documentado: **escala más allá del squad de un solo manager.**

Estoy por contratar dos Software Engineers con el nuevo proceso. Cada candidato recibirá la misma prueba, el mismo starter project, los mismos criterios de evaluación y la misma rúbrica de puntuación. La superficie de sesgo se reduce cuando estandarizas.

## La lección

Si te estás sumando a un equipo nuevo como engineering manager, **mira el proceso de contratación temprano**. No esperes hasta haber "aprendido el codebase" o "entendido la cultura." La contratación es una de las actividades de mayor apalancamiento que tienes. Cada persona que traes moldea al equipo por años.

Y si tu prueba técnica ya no refleja lo que estás buscando, vale la pena revisarla. Los mejores procesos de contratación evolucionan junto con las necesidades del equipo.

Diseña una prueba que refleje el trabajo real. Da a los candidatos un starter project para que estés evaluando *ingeniería*, no *configuración*. Haz los requisitos claros pero déjalos tomar sus propias decisiones. Después siéntate frente a ellos y pregunta ***por qué***.

> La combinación de código take-home bien pensado y un walkthrough estructurado te da más señal en dos horas que cualquier ejercicio de live coding en dos días.

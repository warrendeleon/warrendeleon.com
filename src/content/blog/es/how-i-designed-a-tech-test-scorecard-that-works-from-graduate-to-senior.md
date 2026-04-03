---
title: "Cómo diseñé un scorecard de prueba técnica que funciona de Graduate a Senior"
description: "Cómo un scorecard basado en checklists hizo que nuestra prueba de React Native funcione para todos los niveles, de Graduate a Senior. Una guía práctica para diseñar un proceso de contratación justo."
publishDate: 2026-04-13
tags: ["gestión-de-ingeniería", "contratación", "react-native"]
locale: es
heroImage: "/images/blog/tech-test-scorecard.jpg"
heroAlt: "Diseñando un scorecard de prueba técnica para contratación en React Native"
hiringUrl: "/hiring/"
hiringText: "We're looking for React Native engineers to join the Mobile Platform team at Hargreaves Lansdown."
---

## El problema del "¿esto es un 3 o un 4?"

Cuando empecé a armar el proceso de contratación para mi squad en Hargreaves Lansdown, sabía que quería un scorecard estructurado desde el primer día. Escribí sobre la prueba técnica en sí en [un post anterior](/blog/why-i-redesigned-our-react-native-tech-test-in-my-first-week/). La prueba funcionaba. La puntuación, no. Al menos, no como la diseñé al principio.

Mi primer scorecard usaba una escala del 1 al 5 para cada criterio. "Uso de TypeScript: puntaje 1 a 5." "Manejo de estado: puntaje 1 a 5." Cada criterio tenía una rúbrica describiendo qué significaba cada puntaje. En el papel se veía completo.

Después lo intenté usar.

Dos personas revisaron la misma entrega. Uno le puso un 3 al TypeScript ("hay tipos pero no son estrictos"). El otro le puso un 4 ("tipos limpios en todo el código, buen uso de hooks tipados"). Estaban mirando el mismo código. Simplemente interpretaron la rúbrica de forma distinta.

> 💡 **Tip:** Si dos personas razonables pueden no estar de acuerdo en el puntaje, la rúbrica no es lo suficientemente específica. El problema no son los revisores. Es la herramienta.


## Checklists en vez de rúbricas

La solución fue vergonzosamente simple: reemplazar cada puntaje subjetivo por un **checklist de sí/no**.

Así se veía un solo criterio antes y después. Este es uso de TypeScript:

### Antes: rúbrica subjetiva

| Puntaje | Descripción |
|---|---|
| 5 | Tipado fuerte en todo el código, modo estricto, genéricos donde corresponde |
| 4 | Tipos limpios, mínimo `any`, props y navegación tipados |
| 3 | Tipos para las estructuras principales, algo de `any` suelto, funciona pero no es estricto |
| 2 | TypeScript mal usado, `any` frecuente, aporta poca seguridad |
| 1 | `any` en todos lados, básicamente JavaScript con extensiones `.tsx` |

El problema: "tipos limpios" y "tipos para las estructuras principales" son descripciones razonables del mismo código. Un revisor ve un 3, otro ve un 4. Los dos tienen razón.

### Después: checklist observable

```
✅ Los archivos fuente usan extensiones .ts/.tsx
✅ Existen interfaces o types para datos de API, forma del estado y props de componentes
✅ Los parámetros de navegación están tipados
✅ Cero any en código de producción
☐  Hooks tipados usados (useAppSelector, useAppDispatch)
☐  TypeScript estricto habilitado
☐  Schemas de Zod o Yup para validación
```

Mismo criterio. Siete checks. Cada uno es un hecho que podés verificar mirando el código. Dos revisores van a marcar las mismas casillas porque no hay nada que interpretar.

Los primeros cuatro checks son la línea base (cualquier candidato competente los va a tener en una entrega de 4 a 6 horas). Los últimos tres son señales de experiencia más profunda. **El orden hace el nivelado por vos.**

Hice esto para cada criterio en cuatro secciones:

- **Funcionalidad Core** — ¿funciona la app?
- **Capa de Datos y API** — ¿cómo obtiene y maneja los datos?
- **Calidad de Código** — ¿el código está bien escrito y bien organizado?
- **Testing** — ¿está testeado, y cómo?

**100 checks. 100 puntos. Un punto cada uno.**


## Misma prueba, distinto techo

Esta es la parte que más me entusiasma. Los checks están ordenados por cuánta inversión representan.

Los primeros checks de cada criterio son cosas que cualquier candidato competente va a lograr en **4 a 6 horas**:

- ¿El FlatList renderiza items?
- ¿Funciona la paginación?
- ¿La pantalla de party tiene un estado vacío?
- ¿Hay tipos para las estructuras de datos principales?
- ¿Hay al menos un archivo de test?

Eso es la línea base. Si construiste lo que pedía el brief, pasás estos checks.

Los checks de más abajo requieren más tiempo, más experiencia, o ambas cosas:

- GraphQL en vez de REST
- Validación de respuestas en runtime con Zod
- MSW para mockear HTTP en tests
- Estructura de proyecto feature-first
- BDD con Cucumber
- Umbrales de cobertura enforceados

Estas no son cosas que hacés en un fin de semana. Son patrones que aprendiste construyendo apps de producción reales.

> 💡 **Dato clave:** Un candidato que invierte 4 a 6 horas saca entre 50 y 65. Un candidato que invierte una semana entera con años de experiencia puede sacar 85 a 95. **El brief es el mismo. Las expectativas escalan con el puntaje.**


## Cómo se mapean los niveles

El puntaje total se mapea directamente a un nivel:

| Nivel | Puntaje de code review |
|---|---|
| **Graduate** | 20–45 |
| **Associate** | 46–64 |
| **Software Engineer** | 65–88 |
| **Senior** | 89–100 |

El puntaje del code review no es todo el panorama. La llamada de walkthrough agrega más señal. Pero el code review es la base.


## Respetar la limitación de tiempo

Una prueba técnica **no es una app de producción**. Los candidatos tienen trabajos, familias, vidas. Te están dando su noche o su fin de semana. Penalizar a alguien por no implementar una capa de caché o por no co-localizar sus estilos sería como bajarle nota a un ensayo con tiempo por no tener notas al pie.

Por eso importan los checks de línea base. Tenerlos todos bien te da alrededor de **50 a 60 de 100**. Eso es territorio de Associate a Software Engineer. En mi vieja rúbrica, un "3 de 5" *sonaba* como premio consuelo. 55 de 100 en el checklist es un resultado positivo con un camino claro al siguiente nivel.


## Cómo se ve "por encima de la línea base"

Los checks de más abajo son donde los candidatos se diferencian. No son requisitos. Son **señales**.

Un candidato que agrega **tests E2E con Detox** con helpers extraídos me está diciendo algo sobre su cultura de testing.

Un candidato que implementa **GraphQL con Apollo** me está diciendo algo sobre cómo piensa las APIs.

Un candidato que configura **MSW con múltiples conjuntos de handlers** (éxito, error, 401, timeout, offline) me está diciendo que ya debuggeó fallas de API en producción.

Nada de esto es obligatorio. **Todo se nota.**

Los stretch goals se suman a los 100 puntos como bonificaciones: búsqueda, modo oscuro, accesibilidad, i18n, estructura feature-first, Storybook, ErrorBoundary. Son las marcas de alguien que tuvo tiempo y eligió invertirlo bien.


## El walkthrough lo cambia todo

El code review me da un número. El walkthrough me da **contexto**.

Un candidato que saca 65 en el code review podría subir a 85 después del walkthrough si puede articular cada trade-off, explicar qué cambiaría con más tiempo y navegar su codebase de memoria. El número mide lo que construyeron. La conversación mide cómo piensan.

Diseñé el walkthrough como un conjunto de **tablas de preguntas**. Cada pregunta tiene cinco descripciones de señal, desde "no encuentra el código" hasta "lo explica de memoria con edge cases." El entrevistador marca una fila por pregunta. Se acabó el "¿ese walkthrough fue un 3 o un 4?"

Para candidatos Senior, hay una sección adicional de **diseño de sistemas** en la misma llamada. Sin entrevista separada. Los últimos 15 a 20 minutos pasan de "mostrame tu código" a "¿cómo diseñarías esto para un equipo de 20 ingenieros?" Las mismas tablas de preguntas, el mismo formato de marcar una fila.


## Lo que aprendí construyendo esto

Construir este scorecard me enseñó más sobre diseño de procesos de contratación que cualquier cosa que haya leído al respecto. Esto es lo que me quedó:

**Empezá con checklists, no con rúbricas.** Cada vez que escribía una rúbrica ("5 = excelente, 3 = bueno, 1 = malo"), se convertía en un debate sobre qué significa "bueno". Los checklists terminan el debate. El criterio existe en el código o no existe.

**Ordená los checks por inversión, no por importancia.** Los primeros checks no son más importantes que los últimos. Solo son más alcanzables en 4 a 6 horas. Un candidato Senior que se saltea el check 3 pero clava el check 7 no es penalizado por el salto porque el total sigue reflejando su nivel.

**Separá lo que podés ver de lo que necesitás preguntar.** El scorecard del code review es 100% observable desde el código. Nada de "¿la arquitectura está limpia?" El walkthrough es 100% conversacional. Nada de leer código durante la llamada. Cada documento tiene un solo trabajo.

**Respetá la limitación de tiempo.** Si un check requeriría más de 6 horas de trabajo de un Software Engineer competente, pertenece a la mitad superior del checklist, no a la línea base. Me atrapé varias veces escribiendo checks de línea base que en realidad eran expectativas de Senior. La pregunta que me hacía todo el tiempo: *"¿Esperaría esto de alguien haciendo esta prueba después del trabajo un miércoles a la noche?"* Si la respuesta era no, subía.


## Sigue evolucionando

Usé este scorecard para nuestra primera ronda de contratación de React Native en HL. Mi par EM lo revisó y lo adoptó para las contrataciones de su squad también. Esa es la prueba de un buen sistema: **alguien más puede agarrarlo y usarlo sin que estés en la sala.**

No pretendo que sea perfecto. Los niveles podrían necesitar recalibración después de que pasen más candidatos. Algunos checks podrían resultar demasiado fáciles o demasiado difíciles. Los stretch goals podrían necesitar rebalanceo.

La estructura está bien, eso sí:

- ✅ Checklists, no rúbricas
- ✅ Hechos observables, no opiniones
- ✅ Ordenados por inversión
- ✅ La misma prueba para todos
- ✅ Distinto techo para distintos niveles

Si estás armando un proceso de contratación y tus entrevistadores siguen sin ponerse de acuerdo en los puntajes, probá reemplazar tu rúbrica con un checklist. Te vas a sorprender de cuánto acuerdo conseguís cuando dejás de preguntar *"¿qué tan bueno es esto?"* y empezás a preguntar *"¿esto está acá?"*

> Los mejores sistemas de puntuación no miden lo que sentís sobre el código. Miden lo que hay en el código.

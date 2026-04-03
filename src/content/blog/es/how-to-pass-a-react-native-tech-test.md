---
title: "Cómo aprobar una prueba técnica de React Native"
description: "Consejos prácticos de alguien que revisa entregas de pruebas técnicas take-home. Qué importa realmente, qué no, y los errores que les cuestan el puesto a los candidatos."
publishDate: 2026-04-06
tags: ["react-native", "contratación", "consejos-de-carrera"]
locale: es
heroImage: "/images/blog/react-native-tech-test-tips.jpg"
heroAlt: "Cómo aprobar una prueba técnica de React Native"


---

## Esto es desde el otro lado de la mesa

Reviso entregas de pruebas técnicas de React Native. He visto qué hace que contraten a alguien y qué hace que lo rechacen. La mayoría de los rechazos no son porque el candidato no sepa programar. Son porque no mostró las cosas correctas.

Este post es el consejo que le daría a un amigo antes de entregar una prueba técnica para hacer en casa. No es teoría. Son cosas específicas y prácticas que te llevan de "tal vez" a "sí."

*Escribí sobre por qué rediseñé una prueba técnica desde la perspectiva del hiring manager en [otro post](/es/blog/why-i-redesigned-our-react-native-tech-test-in-my-first-week/). Este es el otro lado: cómo aprobar una.*

## Leé el brief dos veces. Después leelo otra vez.

Suena obvio. Es el error más común.

Si el brief dice "construí tres pantallas con navegación," no construyas dos. Si dice "usá TypeScript," no uses JavaScript. Si dice "gestioná una lista de hasta 6 items," asegurate de que agregar un 7mo se maneje con gracia.

**Los revisores verifican los requisitos como una checklist.** Cada requisito faltante son puntos perdidos. No porque seamos pedantes, sino porque seguir una especificación es parte del trabajo. Si te saltás requisitos en una prueba técnica con un brief claro, ¿qué pasa con un ticket de Jira ambiguo?

> 💡 **Tip:** Leé el brief antes de empezar. Leelo otra vez a la mitad. Leelo una última vez antes de entregar.

## La estructura del proyecto importa más de lo que pensás

Lo primero que hago cuando abro una entrega es mirar la estructura de carpetas. Antes de leer una sola línea de código, la estructura me dice cómo pensás.

**Estructura por tipo** (screens/, components/, hooks/, services/):
```
src/
  components/
  hooks/
  screens/
  services/
  types/
```

**Estructura por feature** (cada feature es autocontenido):
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

Ninguna está mal. Pero la estructura por feature muestra que pensaste en cómo escala la app. Si pregunto "¿qué pasa cuando 5 equipos trabajan en este codebase?" y tu estructura ya responde esa pregunta, vas adelante.

> 🚩 **Red flag:** Todo en una carpeta plana `src/` sin organización. Sugiere que el código empezó antes de planear la arquitectura.

## TypeScript no es opcional

Incluso si el brief dice "TypeScript preferido," tratalo como obligatorio. Entregar JavaScript plano en 2026 es un downgrade automático.

Pero no alcanza con solo usar TypeScript. Usalo *bien*:

| Hacé esto | Por qué importa |
|---|---|
| Tipá tus props | Cada componente debería tener una interfaz de props tipada |
| Tipá tus respuestas de API | No uses `any` para los datos que vuelven del servidor |
| Tipá los params de navegación | React Navigation tiene excelente soporte de TypeScript |

El único `any` que voy a perdonar: tipos complejos de librerías de terceros que tomarían una hora en resolver. Reconocelo en un comentario. *"// TODO: tipar esto bien — me quedé sin tiempo"* es mejor que pretender que no existe.

> 🚩 **Red flag:** `any` esparcido por todo el codebase sin reconocimiento.

## State management: elegí algo y hacete cargo

No me importa si usás Redux Toolkit, Zustand, React Context o Jotai. Me importa que lo hayas elegido deliberadamente y puedas explicar por qué.

| Elección | Qué señal da |
|---|---|
| **Context** para una app de tres pantallas | Perfectamente razonable. Liviano, sin dependencias. |
| **Redux Toolkit** para una app de tres pantallas | Bien, pero voy a preguntar por qué. "Es lo que mejor conozco" es una respuesta honesta. |
| **Zustand** con un store limpio | Muestra que estás al día con el ecosistema. |

Si vas con Redux, **usá Redux Toolkit**. No el viejo patrón de reducer con `switch/case`. Si veo `createStore` en vez de `configureStore`, o constantes manuales de action types en vez de `createSlice`, sugiere que el conocimiento de Redux podría necesitar una actualización.

**Lo que realmente importa:**

- ✅ Lógica de estado separada de la UI
- ✅ Actions, reducers y selectors en sus propios archivos
- ✅ Reglas de negocio (como tamaño máximo del grupo) aplicadas en la capa de estado
- ✅ Actualizaciones predecibles
- ❌ Lógica de negocio viviendo dentro de los componentes
- ❌ Estado disperso entre llamadas a `useState` sin un patrón claro

**No hagas dispatch de un fetch cada vez que se monta una pantalla.** Si navego a una pantalla de detalle, vuelvo, y navego a la misma pantalla de detalle, no debería ver un spinner de carga otra vez. Un simple chequeo `if (!data[id])` antes de tu `dispatch(fetchDetails(id))` alcanza.

## Tests: calidad sobre cobertura

No necesitás 90% de cobertura. Necesitás tests *significativos*. Tres buenos tests le ganan a veinte snapshot tests.

**Lo que quiero ver:**

| Tipo de test | Ejemplo |
|---|---|
| Lógica de negocio | Si hay una regla (máximo 6 en la lista, sin duplicados), testeala. Los reducers y selectors son los tests de mayor valor. |
| Interacciones de usuario | Renderizá un componente con RNTL, presioná un botón, verificá el resultado. Usá `render`, `fireEvent`, `waitFor`. |
| Edge cases | ¿Qué pasa cuando intentás agregar un duplicado? ¿Cuando la lista está vacía? ¿En el límite de paginación? |
| Tests que pasen | Ejecutalos antes de entregar. Tests que fallan son señal de trabajo incompleto. |

**Lo que no quiero ver:**

- ❌ **Snapshot tests por todos lados.** Se rompen con cada cambio de UI y no prueban nada sobre el comportamiento.
- ❌ **Tests que mockean todo.** Si tu test mockea la función que está testeando, está testeando el mock.
- ❌ **Ningún test.** Es difícil recuperarse de esto en el walkthrough.

> 💡 **Tip:** 5-10 tests enfocados que cubran los caminos críticos. Reducers, selectors, interacciones clave. Con eso alcanza.

## Manejá los estados de carga, error y vacío

Acá es donde los candidatos destacan. Cualquiera puede construir el camino feliz. La pregunta es: ¿qué pasa cuando las cosas salen mal?

| Estado | Qué hacer |
|---|---|
| **Carga** | Mostrá un spinner o skeleton en la primera carga. Mostrá un indicador sutil durante la paginación. No muestres un spinner de pantalla completa por 100ms. |
| **Error** | Si la API falla, decile al usuario. Un botón de reintentar es mejor que nada. Un mensaje informativo es mejor que "Algo salió mal." |
| **Vacío** | Si la lista está vacía o no hay items guardados, mostrá algo útil. No una pantalla en blanco. |

> 🚩 **Red flag:** La app se cae con una red lenta. Sin estado de carga, sin manejo de errores. El revisor abre DevTools, limita la red, y la app se desmorona.

## La llamada a la API importa

**GraphQL vs REST:** si el brief ofrece ambos, GraphQL es la opción más fuerte. Muestra que podés trabajar con patrones de API modernos. Pero un cliente REST bien implementado le gana a un setup de GraphQL desordenado.

**Usá FlatList o FlashList. Nunca ScrollView para listas.** `ScrollView` renderiza cada item de una vez. Con más de 100 items, vas a ver caídas de frames, picos de memoria y crashes eventuales. `FlatList` virtualiza la lista, renderizando solo lo que está en pantalla. Si veo un `ScrollView` envolviendo un `.map()` para una lista de datos, sugiere una brecha en la comprensión del modelo de renderizado de React Native.

**Otras cosas que se notan:**

- ✅ Caching: no vuelvas a hacer fetch de datos que ya tenés
- ✅ Paginación: no hagas fetch de 1000 items en la primera carga
- ✅ ErrorBoundary: captura errores de JavaScript y muestra un fallback en vez de una pantalla blanca

## Los edge cases son donde te destacás

El camino feliz es el mínimo. Lo que separa una entrega de nivel Software Engineer de una Senior es el manejo de edge cases:

- **¿Lista llena?** ¿Qué pasa cuando alguien intenta agregar un 7mo item? Un toast, un botón deshabilitado, un modal. Cualquier cosa excepto fallar silenciosamente.
- **¿Lista vacía?** Mostrá un estado vacío con sentido, no una pantalla en blanco.
- **¿Taps rápidos?** ¿Presionar "agregar" cinco veces rápido causa duplicados o crashes?
- **¿Navegación hacia atrás?** Cuando vuelvo del detalle a la lista, ¿se preserva mi posición de scroll?
- **¿Fin de la lista?** ¿La paginación se detiene limpiamente cuando no hay más datos?

No necesitás manejar todos estos. Pero manejar *algunos* muestra que pensás en usuarios reales, no solo en cumplir requisitos.

## El README es parte de la prueba

Escribí un README. No una novela. Un documento corto que cubra:

| Sección | Qué escribir |
|---|---|
| **Cómo ejecutarlo** | `yarn install`, `yarn ios`, listo. Pasos extra documentados. |
| **Qué construiste** | Un párrafo de resumen. |
| **Decisiones que tomaste** | ¿Por qué este state management? ¿Por qué esta estructura de carpetas? Dos oraciones cada una. |
| **Qué mejorarías** | Esta es la sección más importante. Muestra autoconciencia. |

> 💡 **La sección de "qué mejoraría" es un truco.** Te permite reconocer los atajos que tomaste sin que el revisor los descubra como defectos. *"Con más tiempo, agregaría tests E2E con Detox e implementaría caching adecuado"* convierte una feature faltante en una demostración de criterio.

## El walkthrough: acá es donde se ganan los puestos

Si la prueba tiene una llamada de walkthrough, preparate. El código te metió en la sala. El walkthrough te consigue la oferta.

**Conocé tu código.** Si digo "mostrame dónde manejás la respuesta de la API," deberías navegar ahí en menos de 5 segundos. Si dudás, puede generar preguntas sobre qué tan bien conocés el código.

**Explicá tus trade-offs.** No esperes a que pregunte. Cuando mostrás una sección de código, decí *"Elegí este enfoque porque X, pero sé que el trade-off es Y."* Esa es la respuesta que busco antes de siquiera hacer la pregunta.

**Sé honesto sobre los atajos.** *"Usé Context acá porque era más rápido, pero en una app de producción lo movería a Zustand una vez que el estado se vuelva más complejo."* Esa es una respuesta fuerte. *"Creo que Context es el mejor enfoque"* es una más débil.

**Tené una lista de mejoras.** Cuando pregunte "¿qué cambiarías con más tiempo?" la peor respuesta es "nada, estoy conforme." La mejor respuesta es una lista priorizada: *"Primero agregaría caching, después tests E2E, después refactorizaría a carpetas por feature."*

**Hacé preguntas de vuelta.** Los mejores walkthroughs son conversaciones, no presentaciones. Preguntá sobre la arquitectura del equipo, su enfoque de testing, su proceso de deploy. Muestra que vos también estás evaluando el puesto, no solo esperando pasar.

## Stretch goals: hacelos, pero hacelos bien

Si el brief menciona extras opcionales, elegí uno o dos que puedas hacer *bien*. No intentes hacer todos mal.

| Vale la pena elegir | Por qué |
|---|---|
| **Búsqueda/filtro** | Rápido de implementar, inmediatamente visible, muestra que pensás en UX. |
| **Accesibilidad** | Labels, roles, contraste. La mayoría de los candidatos se lo saltean. Hacer incluso accesibilidad básica te hace destacar. |
| **Manejo de errores/offline** | Un botón de reintentar cuando falla la red. Muestra que pensás en condiciones del mundo real. |

| Evitar a menos que puedas hacerlo bien | Por qué |
|---|---|
| **Animaciones** | Las animaciones a medio terminar se ven peor que no tener animaciones. |
| **Dark mode** | Si no es consistente en todas las pantallas, es un problema. |

> 💡 **Un stretch goal bien ejecutado vale más que tres a medio hacer.**

## Los errores que realmente le cuestan el puesto a la gente

No son sobre calidad de código. Son sobre señales.

| Error | Por qué duele |
|---|---|
| **No leer el brief bien** | Saltarse un requisito central. Construir dos pantallas cuando el brief dice tres. |
| **Ningún test** | Incluso dos o tres tests muestran que te importa la calidad. Cero es una señal negativa fuerte. |
| **Código generado por IA que no podés explicar** | Usar IA para ayudarte está bien. Entregar código que no entendés, no. Se nota en el walkthrough. |
| **Sobreingeniería** | Una prueba técnica no necesita un design system y una arquitectura de micro-frontends. Construí lo que pide el brief, bien. |
| **Entregar tarde sin comunicar** | Si necesitás más tiempo, pedilo. Desaparecer y entregar tres días tarde es un red flag. |

## Lo más importante de todo

**Mostrá que pensás.** No solo que programás.

Cualquiera puede construir pantallas. Los candidatos que son contratados son los que demuestran criterio: por qué eligieron este enfoque, qué harían diferente, dónde se rompería el código a escala, qué tests realmente importan.

La prueba técnica no está evaluando si podés escribir React Native. Está evaluando si podés tomar buenas decisiones y comunicarlas con claridad.

> Construí algo limpio, testeá las partes importantes, documentá tu razonamiento, y preparate para hablar de ello con honestidad. Eso es todo. Ese es todo el secreto.

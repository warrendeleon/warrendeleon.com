---
title: "Cómo aprobar una prueba técnica de React Native"
description: "Consejos prácticos de alguien que revisa entregas de pruebas técnicas take-home. Qué importa realmente, qué no, y los errores que les cuestan el puesto a los candidatos."
publishDate: 2026-04-06
tags: ["react-native", "contratación", "consejos-de-carrera"]
locale: es
heroImage: "/images/blog/react-native-tech-test-tips.jpg"
heroAlt: "Cómo aprobar una prueba técnica de React Native"


campaign: "pass-rn-tech-test"
---

## Esto es desde el otro lado de la mesa

Reviso entregas de pruebas técnicas de React Native. He visto qué hace que contraten a alguien y qué hace que lo rechacen. La mayoría de los rechazos no son porque el candidato no sepa programar. Son porque no mostró las cosas correctas.

Este post es el consejo que le daría a un amigo antes de entregar una prueba técnica para hacer en casa. No es teoría. Son cosas específicas y prácticas que te llevan de "tal vez" a "sí."

*Escribí sobre por qué rediseñé una prueba técnica desde la perspectiva del hiring manager en [otro post](/es/blog/why-i-redesigned-our-react-native-tech-test-in-my-first-week/). Este es el otro lado: cómo aprobar una.*

## Lee el brief dos veces. Después léelo otra vez.

Suena obvio. Es el error más común.

Si el brief dice "construye tres pantallas con navegación," no construyas dos. Si dice "usa TypeScript," no uses JavaScript. Si dice "gestiona una lista de hasta 6 items," asegúrate de que agregar un 7mo se maneje con gracia.

**Los revisores verifican los requisitos como una checklist.** Cada requisito faltante son puntos perdidos. No porque seamos pedantes, sino porque seguir una especificación es parte del trabajo. Si te saltas requisitos en una prueba técnica con un brief claro, ¿qué pasa con un ticket de Jira ambiguo?

> 💡 **Tip:** Lee el brief antes de empezar. Léelo otra vez a la mitad. Léelo una última vez antes de entregar.

## La estructura del proyecto importa más de lo que piensas

Lo primero que hago cuando abro una entrega es mirar la estructura de carpetas. Antes de leer una sola línea de código, la estructura me dice cómo piensas.

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

Ninguna está mal. Pero la estructura por feature muestra que pensaste en cómo escala la app. Si pregunto "¿qué pasa cuando 5 equipos trabajan en este codebase?" y tu estructura ya responde esa pregunta, vas por delante.

> 🚩 **Red flag:** Todo en una carpeta plana `src/` sin organización. Sugiere que el código empezó antes de planear la arquitectura.

## TypeScript no es opcional

Incluso si el brief dice "TypeScript preferido," trátalo como obligatorio. Entregar JavaScript plano en 2026 es un downgrade automático.

Pero no basta con solo usar TypeScript. Úsalo *bien*:

| Haz esto | Por qué importa |
|---|---|
| Tipa tus props | Cada componente debería tener una interfaz de props tipada |
| Tipa tus respuestas de API | No uses `any` para los datos que vuelven del servidor |
| Tipa los params de navegación | React Navigation tiene excelente soporte de TypeScript |

El único `any` que voy a perdonar: tipos complejos de librerías de terceros que tomarían una hora en resolver. Reconócelo en un comentario. *"// TODO: tipar esto bien — me quedé sin tiempo"* es mejor que pretender que no existe.

> 🚩 **Red flag:** `any` esparcido por todo el codebase sin reconocimiento.

## State management: elige algo y hazte cargo

No me importa si usas Redux Toolkit, Zustand, React Context o Jotai. Me importa que lo hayas elegido deliberadamente y puedas explicar por qué.

| Elección | Qué señal da |
|---|---|
| **Context** para una app de tres pantallas | Perfectamente razonable. Ligero, sin dependencias. |
| **Redux Toolkit** para una app de tres pantallas | Bien, pero voy a preguntar por qué. "Es lo que mejor conozco" es una respuesta honesta. |
| **Zustand** con un store limpio | Muestra que estás al día con el ecosistema. |

Si vas con Redux, **usa Redux Toolkit**. No el viejo patrón de reducer con `switch/case`. Si veo `createStore` en vez de `configureStore`, o constantes manuales de action types en vez de `createSlice`, sugiere que el conocimiento de Redux podría necesitar una actualización.

**Lo que realmente importa:**

- ✅ Lógica de estado separada de la UI
- ✅ Actions, reducers y selectors en sus propios archivos
- ✅ Reglas de negocio (como tamaño máximo del grupo) aplicadas en la capa de estado
- ✅ Actualizaciones predecibles
- ❌ Lógica de negocio viviendo dentro de los componentes
- ❌ Estado disperso entre llamadas a `useState` sin un patrón claro

**No hagas dispatch de un fetch cada vez que se monta una pantalla.** Si navego a una pantalla de detalle, vuelvo, y navego a la misma pantalla de detalle, no debería ver un spinner de carga otra vez. Un simple chequeo `if (!data[id])` antes de tu `dispatch(fetchDetails(id))` basta.

## Tests: calidad sobre cobertura

No necesitas 90% de cobertura. Necesitas tests *significativos*. Tres buenos tests le ganan a veinte snapshot tests.

**Lo que quiero ver:**

| Tipo de test | Ejemplo |
|---|---|
| Lógica de negocio | Si hay una regla (máximo 6 en la lista, sin duplicados), testéala. Los reducers y selectors son los tests de mayor valor. |
| Interacciones de usuario | Renderiza un componente con RNTL, pulsa un botón, verifica el resultado. Usa `render`, `fireEvent`, `waitFor`. |
| Edge cases | ¿Qué pasa cuando intentas agregar un duplicado? ¿Cuando la lista está vacía? ¿En el límite de paginación? |
| Tests que pasen | Ejecútalos antes de entregar. Tests que fallan son señal de trabajo incompleto. |

**Lo que no quiero ver:**

- ❌ **Snapshot tests por todos lados.** Se rompen con cada cambio de UI y no prueban nada sobre el comportamiento.
- ❌ **Tests que mockean todo.** Si tu test mockea la función que está testeando, está testeando el mock.
- ❌ **Ningún test.** Es difícil recuperarse de esto en el walkthrough.

> 💡 **Tip:** 5-10 tests enfocados que cubran los caminos críticos. Reducers, selectors, interacciones clave. Con eso basta.

## Maneja los estados de carga, error y vacío

Aquí es donde los candidatos destacan. Cualquiera puede construir el camino feliz. La pregunta es: ¿qué pasa cuando las cosas salen mal?

| Estado | Qué hacer |
|---|---|
| **Carga** | Muestra un spinner o skeleton en la primera carga. Muestra un indicador sutil durante la paginación. No muestres un spinner de pantalla completa por 100ms. |
| **Error** | Si la API falla, dile al usuario. Un botón de reintentar es mejor que nada. Un mensaje informativo es mejor que "Algo salió mal." |
| **Vacío** | Si la lista está vacía o no hay items guardados, muestra algo útil. No una pantalla en blanco. |

> 🚩 **Red flag:** La app se cae con una red lenta. Sin estado de carga, sin manejo de errores. El revisor abre DevTools, limita la red, y la app se desmorona.

## La llamada a la API importa

**GraphQL vs REST:** si el brief ofrece ambos, GraphQL es la opción más fuerte. Muestra que puedes trabajar con patrones de API modernos. Pero un cliente REST bien implementado le gana a un setup de GraphQL desordenado.

**Usa FlatList o FlashList. Nunca ScrollView para listas.** `ScrollView` renderiza cada item de una vez. Con más de 100 items, vas a ver caídas de frames, picos de memoria y crashes eventuales. `FlatList` virtualiza la lista, renderizando solo lo que está en pantalla. Si veo un `ScrollView` envolviendo un `.map()` para una lista de datos, sugiere una brecha en la comprensión del modelo de renderizado de React Native.

**Otras cosas que se notan:**

- ✅ Caching: no vuelvas a hacer fetch de datos que ya tienes
- ✅ Paginación: no hagas fetch de 1000 items en la primera carga
- ✅ ErrorBoundary: captura errores de JavaScript y muestra un fallback en vez de una pantalla blanca

## Los edge cases son donde te destacas

El camino feliz es el mínimo. Lo que separa una entrega de nivel Software Engineer de una Senior es el manejo de edge cases:

- **¿Lista llena?** ¿Qué pasa cuando alguien intenta agregar un 7mo item? Un toast, un botón deshabilitado, un modal. Cualquier cosa excepto fallar silenciosamente.
- **¿Lista vacía?** Muestra un estado vacío con sentido, no una pantalla en blanco.
- **¿Taps rápidos?** ¿Presionar "agregar" cinco veces rápido causa duplicados o crashes?
- **¿Navegación hacia atrás?** Cuando vuelvo del detalle a la lista, ¿se preserva mi posición de scroll?
- **¿Fin de la lista?** ¿La paginación se detiene limpiamente cuando no hay más datos?

No necesitas manejar todos estos. Pero manejar *algunos* muestra que piensas en usuarios reales, no solo en cumplir requisitos.

## El README es parte de la prueba

Escribe un README. No una novela. Un documento corto que cubra:

| Sección | Qué escribir |
|---|---|
| **Cómo ejecutarlo** | `yarn install`, `yarn ios`, listo. Pasos extra documentados. |
| **Qué construiste** | Un párrafo de resumen. |
| **Decisiones que tomaste** | ¿Por qué este state management? ¿Por qué esta estructura de carpetas? Dos oraciones cada una. |
| **Qué mejorarías** | Esta es la sección más importante. Muestra autoconciencia. |

> 💡 **La sección de "qué mejoraría" es un truco.** Te permite reconocer los atajos que tomaste sin que el revisor los descubra como defectos. *"Con más tiempo, agregaría tests E2E con Detox e implementaría caching adecuado"* convierte una feature faltante en una demostración de criterio.

## El walkthrough: aquí es donde se ganan los puestos

Si la prueba tiene una llamada de walkthrough, prepárate. El código te metió en la sala. El walkthrough te consigue la oferta.

**Conoce tu código.** Si digo "muéstrame dónde manejas la respuesta de la API," deberías navegar allí en menos de 5 segundos. Si dudas, puede generar preguntas sobre qué tan bien conoces el código.

**Explica tus trade-offs.** No esperes a que pregunte. Cuando muestras una sección de código, di *"Elegí este enfoque porque X, pero sé que el trade-off es Y."* Esa es la respuesta que busco antes de siquiera hacer la pregunta.

**Sé honesto sobre los atajos.** *"Usé Context aquí porque era más rápido, pero en una app de producción lo movería a Zustand una vez que el estado se vuelva más complejo."* Esa es una respuesta fuerte. *"Creo que Context es el mejor enfoque"* es una más débil.

**Ten una lista de mejoras.** Cuando pregunte "¿qué cambiarías con más tiempo?" la peor respuesta es "nada, estoy conforme." La mejor respuesta es una lista priorizada: *"Primero agregaría caching, después tests E2E, después refactorizaría a carpetas por feature."*

**Haz preguntas de vuelta.** Los mejores walkthroughs son conversaciones, no presentaciones. Pregunta sobre la arquitectura del equipo, su enfoque de testing, su proceso de deploy. Muestra que tú también estás evaluando el puesto, no solo esperando pasar.

## Stretch goals: hazlos, pero hazlos bien

Si el brief menciona extras opcionales, elige uno o dos que puedas hacer *bien*. No intentes hacer todos mal.

| Vale la pena elegir | Por qué |
|---|---|
| **Búsqueda/filtro** | Rápido de implementar, inmediatamente visible, muestra que piensas en UX. |
| **Accesibilidad** | Labels, roles, contraste. La mayoría de los candidatos se lo saltan. Hacer incluso accesibilidad básica te hace destacar. |
| **Manejo de errores/offline** | Un botón de reintentar cuando falla la red. Muestra que piensas en condiciones del mundo real. |

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
| **Código generado por IA que no puedes explicar** | Usar IA para ayudarte está bien. Entregar código que no entiendes, no. Se nota en el walkthrough. |
| **Sobreingeniería** | Una prueba técnica no necesita un design system y una arquitectura de micro-frontends. Construye lo que pide el brief, bien. |
| **Entregar tarde sin comunicar** | Si necesitas más tiempo, pídelo. Desaparecer y entregar tres días tarde es un red flag. |

## Lo más importante de todo

**Muestra que piensas.** No solo que programas.

Cualquiera puede construir pantallas. Los candidatos que son contratados son los que demuestran criterio: por qué eligieron este enfoque, qué harían diferente, dónde se rompería el código a escala, qué tests realmente importan.

La prueba técnica no está evaluando si puedes escribir React Native. Está evaluando si puedes tomar buenas decisiones y comunicarlas con claridad.

> Construye algo limpio, testea las partes importantes, documenta tu razonamiento, y prepárate para hablar de ello con honestidad. Eso es todo. Ese es todo el secreto.

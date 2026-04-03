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

Leé el brief antes de empezar. Leelo otra vez a la mitad. Leelo una última vez antes de entregar.

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

- **Tipá tus props.** Cada componente debería tener una interfaz de props tipada.
- **Tipá tus respuestas de API.** No uses `any` para los datos que vuelven del servidor.
- **Tipá los params de navegación.** React Navigation tiene excelente soporte de TypeScript. Usalo.

El único `any` que voy a perdonar: tipos complejos de librerías de terceros que tomarían una hora en resolver. Reconocelo en un comentario. *"// TODO: tipar esto bien — me quedé sin tiempo"* es mejor que pretender que no existe.

> 🚩 **Red flag:** `any` esparcido por todo el codebase sin reconocimiento.

## State management: elegí algo y hacete cargo

No me importa si usás Redux Toolkit, Zustand, React Context o Jotai. Me importa que lo hayas elegido deliberadamente y puedas explicar por qué.

- **Context** para una app de tres pantallas? Perfectamente razonable. Liviano, sin dependencias.
- **Redux Toolkit** para una app de tres pantallas? Bien, pero voy a preguntar por qué. Si decís "porque es lo que mejor conozco," es una respuesta honesta. Si decís "porque es lo mejor," es una respuesta más floja.
- **Zustand** con un store limpio? Muestra que estás al día con el ecosistema.

Si vas con Redux, **usá Redux Toolkit**. No el viejo patrón de reducer con `switch/case`. Si veo `createStore` en vez de `configureStore`, o constantes manuales de action types en vez de `createSlice`, sugiere que el conocimiento de Redux podría necesitar una actualización.

**Separá tus concerns.** Si usás Redux Toolkit, dividilo en `actions.ts`, `reducers.ts` y `selectors.ts`. Escribí tests para cada uno. Los selectors son funciones puras. Son triviales de testear y los tests nunca fallan intermitentemente. Los tests de reducers prueban que tu lógica de negocio funciona. Son los tests de mayor valor que podés escribir.

**No hagas dispatch de un fetch cada vez que se monta una pantalla.** Si navego a una pantalla de detalle, vuelvo, y navego a la misma pantalla de detalle, no debería ver un spinner de carga otra vez. Cacheá los datos. Verificá si ya existen antes de hacer dispatch. Un simple chequeo `if (!data[id])` antes de tu `dispatch(fetchDetails(id))` alcanza.

**Lo que realmente importa:** ¿está la lógica de estado separada de la UI? ¿Puedo encontrar tu código de state management sin buscar? ¿Son predecibles tus actualizaciones?

> 🚩 **Red flag:** Lógica de negocio viviendo dentro de los componentes. Estado disperso entre llamadas a `useState` sin un patrón claro.

## Tests: calidad sobre cobertura

No necesitás 90% de cobertura. Necesitás tests *significativos*. Tres buenos tests le ganan a veinte snapshot tests.

Lo que quiero ver:

- **Testeá tu lógica de negocio.** Si hay una regla (máximo 6 en la lista, sin duplicados), testeala. Testeá tus reducers, testeá tus selectors. Son los tests de mayor valor porque prueban que la lógica central funciona y nunca fallan intermitentemente.
- **Testeá interacciones de usuario con React Native Testing Library.** Renderizá un componente, presioná un botón, verificá el resultado. Usá `render`, `screen`, `fireEvent` y `waitFor` de `@testing-library/react-native`. No Enzyme. No solo snapshot tests.
- **Testeá los edge cases.** ¿Qué pasa cuando intentás agregar un duplicado? ¿Qué pasa cuando la lista está vacía? ¿Qué pasa en el límite de paginación? Testeá los caminos tristes, no solo los felices.
- **Asegurate de que todos los tests pasen antes de entregar.** Ejecutalos. Si un test falla, arreglalo o eliminalo. Tests que fallan o código de test comentado son señal de trabajo incompleto.

Lo que no quiero ver:

- **Snapshot tests por todos lados.** Se rompen con cada cambio de UI y no prueban nada sobre el comportamiento.
- **Tests que mockean todo.** Si tu test mockea la función que está testeando, está testeando el mock, no el código.
- **Ningún test.** Es difícil recuperarse de esto en el walkthrough.

> 💡 **Tip:** 5-10 tests enfocados que cubran los caminos críticos. Reducers, selectors, interacciones clave.

## Manejá los estados de carga, error y vacío

Aquí es donde los candidatos destacan. Cualquiera puede construir el camino feliz. La pregunta es: ¿qué pasa cuando las cosas salen mal?

**Estados de carga:** mostrá un spinner o skeleton en la primera carga. Mostrá un indicador sutil cuando se cargan más datos (paginación). No muestres un spinner de pantalla completa por 100ms.

**Estados de error:** si la API falla, decile al usuario. Un botón de reintentar es mejor que nada. Un mensaje informativo es mejor que "Algo salió mal."

**Estados vacíos:** si la lista está vacía o no hay items guardados, mostrá algo útil. No una pantalla en blanco.

> 🚩 **Red flag:** La app se cae con una red lenta. Sin estado de carga, sin manejo de errores. El revisor abre DevTools, limita la red, y la app se desmorona.

## La llamada a la API importa

**GraphQL vs REST:** si el brief ofrece ambos, GraphQL es la opción más fuerte. Muestra que podés trabajar con patrones de API modernos. Pero un cliente REST bien implementado le gana a un setup de GraphQL desordenado.

**Caching:** si hacés fetch de una pantalla de detalle, volvés, y hacés fetch otra vez, eso es trabajo desperdiciado. Usá React Query, el cache de Apollo, o incluso un simple cache en memoria. El revisor *se va a dar cuenta* si cada navegación dispara un refetch.

**Paginación:** si la API lo soporta, usalo. No hagas fetch de 1000 items en la primera carga. Scroll infinito o fetching paginado muestra que pensás en rendimiento.

**Usá FlatList o FlashList. Nunca ScrollView para listas.** Este es un red flag fuerte. `ScrollView` renderiza cada item de una vez. Con más de 100 items, vas a ver caídas de frames, picos de memoria y crashes eventuales. `FlatList` virtualiza la lista, renderizando solo lo que está en pantalla. Si no conocés la diferencia, aprendela antes de tu prueba técnica. Si veo un `ScrollView` envolviendo un `.map()` para una lista de datos, sugiere una brecha en la comprensión del modelo de renderizado de React Native.

**Envolvé tu app en un ErrorBoundary.** Es algo pequeño que da puntos extra. Un componente `ErrorBoundary` de nivel superior captura errores de JavaScript y muestra un fallback en vez de una pantalla blanca. La mayoría de los candidatos no hacen esto. Si vos lo hacés, indica que pensás en resiliencia para producción.

## Los edge cases son donde te destacás

El camino feliz es el mínimo. Lo que separa una entrega de nivel Software Engineer de una Senior es el manejo de edge cases:

- **¿Lista llena?** ¿Qué pasa cuando alguien intenta agregar un 7mo item? Un toast, un botón deshabilitado, un modal. Cualquier cosa excepto fallar silenciosamente.
- **¿Lista vacía?** Mostrá un estado vacío con sentido, no una pantalla en blanco.
- **¿Taps rápidos?** ¿Presionar "agregar" cinco veces rápido causa duplicados o crashes?
- **¿Navegación hacia atrás?** Cuando vuelvo del detalle a la lista, ¿se preserva mi posición de scroll? Si no, es un problema de UX notable.
- **¿Fin de la lista?** ¿La paginación se detiene limpiamente cuando no hay más datos? ¿O sigue disparando requests?

No necesitás manejar todos estos. Pero manejar *algunos* muestra que pensás en usuarios reales, no solo en cumplir requisitos.

## El README es parte de la prueba

Escribí un README. No una novela. Un documento corto que cubra:

1. **Cómo ejecutarlo.** `yarn install`, `yarn ios`, listo. Si hay pasos extra, documentralos.
2. **Qué construiste.** Un párrafo de resumen.
3. **Decisiones que tomaste.** ¿Por qué este state management? ¿Por qué esta estructura de carpetas? Dos oraciones cada una.
4. **Qué mejorarías.** Esta es la sección más importante. Muestra autoconciencia.

**La sección de "qué mejoraría" es un truco.** Te permite reconocer los atajos que tomaste sin que el revisor los descubra como defectos. *"Con más tiempo, agregaría tests E2E con Detox e implementaría caching adecuado"* convierte una feature faltante en una demostración de criterio.

## El walkthrough: acá es donde se ganan los puestos

Si la prueba tiene una llamada de walkthrough, preparate. El código te metió en la sala. El walkthrough te consigue la oferta.

**Conocé tu código.** Si digo "mostrame dónde manejás la respuesta de la API," deberías navegar ahí en menos de 5 segundos. Si dudás, puede generar preguntas sobre qué tan bien conocés el código.

**Explicá tus trade-offs.** No esperes a que pregunte. Cuando mostrás una sección de código, decí *"Elegí este enfoque porque X, pero sé que el trade-off es Y."* Esa es la respuesta que busco antes de siquiera hacer la pregunta.

**Sé honesto sobre los atajos.** *"Usé Context acá porque era más rápido, pero en una app de producción lo movería a Zustand una vez que el estado se vuelva más complejo."* Esa es una respuesta fuerte. *"Creo que Context es el mejor enfoque"* es una más débil.

**Tené una lista de mejoras.** Cuando pregunte "¿qué cambiarías con más tiempo?" la peor respuesta es "nada, estoy conforme." La mejor respuesta es una lista priorizada: *"Primero agregaría caching, después tests E2E, después refactorizaría a carpetas por feature."*

**Hacé preguntas de vuelta.** Los mejores walkthroughs son conversaciones, no presentaciones. Preguntá sobre la arquitectura del equipo, su enfoque de testing, su proceso de deploy. Muestra que vos también estás evaluando el puesto, no solo esperando pasar.

## Stretch goals: hacelos, pero hacelos bien

Si el brief menciona extras opcionales (búsqueda, persistencia, animaciones, dark mode, accesibilidad), elegí uno o dos que puedas hacer *bien*. No intentes hacer todos mal.

**Mejores stretch goals para elegir:**
- **Búsqueda/filtro** en la lista. Rápido de implementar, inmediatamente visible, muestra que pensás en UX.
- **Accesibilidad.** Labels, roles, contraste. La mayoría de los candidatos se lo saltean por completo. Hacer incluso accesibilidad básica te hace destacar.
- **Manejo de errores/offline.** Un botón de reintentar cuando falla la red. Muestra que pensás en condiciones del mundo real.

**Stretch goals a evitar a menos que puedas hacerlos bien:**
- **Animaciones.** Las animaciones a medio terminar se ven peor que no tener animaciones.
- **Dark mode.** Si no es consistente en todas las pantallas, es un problema.

Un stretch goal bien ejecutado vale más que tres a medio hacer.

## Los errores que realmente le cuestan el puesto a la gente

No son sobre calidad de código. Son sobre señales.

**No leer el brief bien.** Saltarse un requisito central. Construir dos pantallas cuando el brief dice tres.

**Ningún test.** Incluso dos o tres tests muestran que te importa la calidad. Cero tests envía una señal negativa fuerte.

**Código generado por IA que no podés explicar.** Usar IA para ayudarte está bien. Entregar código que no entendés no. Esto se hace evidente durante el walkthrough.

**Sobreingeniería.** Una prueba técnica no necesita un design system, una librería de componentes y una arquitectura de micro-frontends. Construí lo que pide el brief, bien. Guardá la astronáutica de arquitectura para la entrevista de system design.

**Entregar tarde sin comunicar.** Si necesitás más tiempo, pedilo. La mayoría de las empresas te van a dar uno o dos días extra. Desaparecer y entregar tres días tarde sin explicación es un red flag.

## Lo más importante de todo

**Mostrá que pensás.** No solo que programás.

Cualquiera puede construir pantallas. Los candidatos que son contratados son los que demuestran criterio: por qué eligieron este enfoque, qué harían diferente, dónde se rompería el código a escala, qué tests realmente importan.

La prueba técnica no está evaluando si podés escribir React Native. Está evaluando si podés tomar buenas decisiones y comunicarlas con claridad.

> Construí algo limpio, testeá las partes importantes, documentá tu razonamiento, y preparate para hablar de ello con honestidad. Eso es todo. Ese es todo el secreto.

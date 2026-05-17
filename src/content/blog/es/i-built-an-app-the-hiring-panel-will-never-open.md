---
title: "Construí una app que el comité de contratación nunca va a abrir"
description: "Cómo pasé de Notion a markdown y de ahí a una app de React para entrevistas técnicas estructuradas. Tres iteraciones para llamadas en directo y para el comité."
publishDate: 2026-04-27
tags: ["engineering-management", "hiring", "react", "internal-tools"]
locale: es
heroImage: "/images/blog/interview-kit.webp"
heroAlt: "Interview Kit ejecutándose en un portátil durante una entrevista técnica"
campaign: "interview-kit"
relatedPosts: ["how-i-designed-a-tech-test-scorecard-that-works-from-graduate-to-senior", "why-i-redesigned-our-react-native-tech-test-in-my-first-week", "how-to-write-a-take-home-tech-test-that-candidates-actually-want-to-do"]
---

## Lo que ve el comité, y lo que no

Un PDF de 7 páginas adjunto a un correo. Ésa es toda la superficie que el comité de contratación llega a tocar. No el asistente paso a paso, ni los temporizadores, ni el autoguardado, ni los atajos de teclado, ni las puntuaciones con código de colores. La app existe para una sola persona: el entrevistador, durante la llamada.

El PDF lleva el trabajo: puntuaciones, notas, fortalezas y áreas de mejora, la decisión de contratar o no, y cuatro apéndices con evidencias. Todo lo que el comité necesita para hacer una oferta o pasar al siguiente.

La mayoría de comités no se sientan delante de una herramienta de revisión de código, y sería raro pedirles que lo hicieran. Su trabajo es la decisión, no meter datos. El trabajo de la app es que los datos que llegan a esa página merezcan su atención.

Llegar hasta ahí me llevó tres intentos y un bug que estuvo a punto de costarle a un candidato su puntuación.

## El problema del formato

Diseñé los scorecards para nuestro proceso de contratación en React Native [a principios de este año](/es/blog/how-i-designed-a-tech-test-scorecard-that-works-from-graduate-to-senior/). Tres evaluaciones: una revisión de código de 100 checks, una entrevista de walkthrough puntuada del 1 al 5, y una entrevista conductual mapeada a nuestros cinco valores. La puntuación funcionaba. El formato que estaba usando para capturar esas puntuaciones durante una llamada en directo no.

La entrevista de walkthrough es la parte más difícil. Un candidato comparte su pantalla, te enseña [la prueba técnica que ha construido](/es/blog/how-to-write-a-take-home-tech-test-that-candidates-actually-want-to-do/), explica sus decisiones. Yo necesito leerle una pregunta del guion, escuchar la respuesta, puntuarla del 1 al 5, escribir notas, mirar el reloj y pasar a la siguiente. Todo manteniendo el contacto visual y que la conversación fluya con naturalidad.

Prueba a hacer eso en una tabla de markdown dentro de VS Code. El cursor cae en la celda equivocada. La posición del scroll se mueve. El candidato te oye teclear y baja el ritmo.

## Tres intentos

Notion fue mi primera idea. Lo uso para todo lo personal. No es una herramienta que usemos en el trabajo, y construir sobre una plataforma que sería sólo para mí parecía un callejón sin salida. La descarté antes de empezar.

Los ficheros markdown vinieron después. Un `.md` por scorecard, con tablas para las puntuaciones y espacio para notas. La revisión de código funcionaba bien así. 100 checks de sí o no que completas *después* de la entrevista a tu propio ritmo. Los scorecards de walkthrough y conductual tenían que funcionar *durante* la llamada, y el markdown se metía por medio. Encontrar la fila correcta, escribir un número, hacer scroll a la siguiente sección. Preciso pero lento. Prestaba más atención al documento que a la persona.

Después de la entrevista era peor. Tres ficheros markdown separados, cada uno con un formato distinto, cosidos a mano en un único documento coherente para el equipo de selección. Cada vez tardaba más de lo que quería.

El tercer intento fue una app de React en localhost. Sin backend, sin base de datos, sin despliegue. Simplemente `npm run dev` y una pestaña del navegador. Todo se persiste en `localStorage`. La app muere cuando cierro la pestaña y vuelve cuando la abro de nuevo.

## Estar presente durante la llamada

El objetivo era dejar de pelearme con la herramienta durante la entrevista. Tres cosas marcaron la diferencia.

**Una pregunta por pantalla.** El walkthrough es un asistente paso a paso. Cada paso muestra el guion para leer en voz alta (en un blockquote azul para que lo encuentre al instante), las preguntas con botones grandes del 1 al 5, y un campo de notas. Sin scroll. Sin buscar la sección correcta. Pulso "Siguiente" y aparece el siguiente grupo. Para [candidatos senior](/es/blog/how-to-pass-a-react-native-tech-test/), el asistente se amplía de 4 pasos a 8 con una Parte B adicional sobre diseño de sistemas.

**Puntuación con teclado.** Pulsa del 1 al 5 y la puntuación se registra al instante. Sin clics, sin menús desplegables, sin diálogos de confirmación. Mis ojos siguen en la videollamada. La puntuación pasa por mi visión periférica.

**Un temporizador de sección en la esquina.** No una cuenta atrás, sólo un display discreto del tiempo transcurrido. Lo miré durante el primer walkthrough y me di cuenta de que había pasado 8 minutos en una sección que debería durar 4. Sin él me habría pasado de tiempo y habría tenido que recortar la última sección. El candidato habría perdido la oportunidad de responder preguntas que podrían haberle subido la nota.

## El bug que puntuaba todo igual

La pila es React 19, TypeScript, Vite, Tailwind v4. Sin librería de gestión de estado. Un hook personalizado `useLocalStorage` y React Router.

Durante las pruebas, puntué el walkthrough de un candidato de principio a fin. Cada sección, cada pregunta, notas completas. Pulsé "Siguiente" para llegar a la pantalla de resumen y vi que todas las secciones tenían la misma puntuación: la que había metido en el último paso.

Un bug de stale closure. El `useCallback` de cada paso del asistente capturaba los datos del walkthrough del render *anterior*. Cuando el paso 3 guardaba, sobrescribía los pasos 1 y 2 porque seguía usando el estado antiguo. El clásico problema de React donde el estado dentro de un callback no se actualiza cuando crees que sí.

La solución fue dejar de confiar en la vista que tenía React de los datos en las escrituras. Cada mutación lee el estado *actual* del candidato directamente desde `localStorage` en vez de un closure capturado. Un helper `freshCandidate()` que llama a `localStorage.getItem` en cada guardado. No es elegante. Funciona siempre.

```typescript
function freshCandidate(id: string): Candidate | undefined {
  const raw = localStorage.getItem('hl-ik-candidates');
  if (!raw) return undefined;
  return JSON.parse(raw).find((c: Candidate) => c.id === id);
}
```

El mismo patrón se repite en tres hooks: `useWalkthrough`, `useBehavioural`, `useCodeReview`. Cada uno lee fresco, escribe fresco, y dispara un evento personalizado (`ls-sync`) para que las otras instancias del hook detecten el cambio. Veinte líneas de código de persistencia. Sin Redux, sin context providers, sin middleware.

## El PDF que nadie me ve construir

Después de la entrevista, pulso "Imprimir / PDF" y el navegador genera un Candidate Assessment Report. Sin librería de PDF. Sólo CSS de impresión.

La página 1 es el resumen: una tabla de puntuaciones, el nivel recomendado, la decisión de contratar o no, y el nivel de la oferta. Las páginas 2 y 3 muestran fortalezas y áreas de mejora extraídas de las tres evaluaciones, agrupadas por origen. Después, cuatro apéndices: desglose de la revisión de código, puntuaciones del walkthrough con cada pregunta y nota, puntuaciones conductuales por valor, y una tabla de referencia de los niveles con el del candidato resaltado en azul marino.

Esa tabla de niveles mapea la puntuación combinada a uno de los 12 escalones: desde Graduate 1 hasta Senior 2+. El escalón **2+** es deliberadamente difícil de alcanzar. Marca a alguien en la cima de su categoría, empujando hacia la siguiente. Cuando un miembro del comité ve "Associate 2+" en el PDF, lo lee al instante: fuerte para Associate, no del todo SE. Esa única etiqueta lleva más señal que un párrafo de justificación.

El filtro conductual añade un segundo control. Un candidato que puntúe por debajo de 10/25 en alineación con los valores no avanza, independientemente de su puntuación técnica. Entre 10 y 14 dispara una discusión del comité. 15 o más pasa el filtro. Las habilidades técnicas se pueden enseñar. La falta de alineación con los valores crea problemas que crecen con el tiempo.

## El CSS de impresión es una disciplina aparte

Escribí más CSS para `@media print` que para pantalla. Es la parte que más me sorprendió.

¿El fondo azul marino del cuadro de puntuación combinada? **No se imprime.** Los navegadores eliminan los colores de fondo por defecto. Tuve que convertirlo en un cuadro blanco con un borde negro grueso usando selectores `[style*="background: #002147"]` en la hoja de estilos de impresión. Las clases utilitarias de Tailwind como `bg-white` necesitan selectores de atributo (`[class*="bg-white"]`) para sobrescribir el padding, los bordes y los márgenes en la impresión.

`page-break-inside: avoid` es una sugerencia, no un comando. El navegador romperá dentro de un elemento si la alternativa es una página casi vacía. Pasé una hora depurando por qué una sección de fortalezas se partía en dos páginas antes de darme cuenta de que el contenido era simplemente demasiado alto para el espacio restante.

Los estilos de los encabezados necesitaban un `border-bottom` inline explícito porque las clases de Tailwind se eliminan o sobrescriben con el reset de impresión. Los tamaños de fuente cambian de `rem` a `pt`. Los elementos interactivos (textareas, checkboxes, dropdowns) se ocultan. Todo el layout de impresión vive en un componente `CandidatePrintReport` separado que se renderiza dentro de `hidden print:block`. Separación limpia. La pantalla nunca ve el layout de impresión, la impresión nunca ve los botones.

Si lo construyera otra vez, diseñaría primero el layout de impresión y luego el de pantalla. El PDF es el artefacto que importa. La pantalla es el formulario de entrada.

## Lo que cambiaría

**Tests antes que la lógica de puntuación.** Las deducciones por red flags, los bonus por stretch goals, los lookups de los niveles, el umbral del filtro conductual. Ahora son funciones puras, extraídas en `utils/scoring.ts`, y son el tipo de código que se rompe en silencio cuando tocas un límite. Las escribí al final. Deberían haber sido lo primero.

**El parser de importación de markdown es frágil.** Usa regex para leer los valores Y/N de los ficheros de revisión de código puntuados. Funciona para el formato concreto que diseñé, pero una alineación de tabla diferente o una columna extra y se rompe. Un parser de verdad con recuperación de errores aguantaría mejor.

**La accesibilidad llegó tarde.** El cumplimiento de WCAG AA (títulos de página por ruta, jerarquía de encabezados, ratios de contraste de color, roving tabindex en los selectores de puntuación, `aria-live` en los indicadores de guardado) fue añadido después en lugar de incorporado desde el principio. Ahora todo pasa. Habría sido más limpio construirlo accesible desde el primer día. Las herramientas internas merecen los mismos estándares que las públicas.

## La prueba real

Usé esta app por primera vez en una entrevista real la semana pasada. El candidato no sabía que estaba usando nada inusual. Presentó su [entrega del take-home](/es/blog/how-to-pass-a-react-native-tech-test/), yo puntué, hablamos. Sin hacer scroll, sin escribir en tablas de markdown, sin perder el hilo. Después de la llamada, una pulsación de botón y el PDF estaba listo.

Ese es el objetivo. La mejor herramienta de entrevistas es la que el candidato nunca nota. La puntuación, los temporizadores, los cálculos de nivel, la generación del PDF: todo eso debería quedar fuera del camino. El comité lee el PDF. El candidato tiene una conversación. La herramienta se queda en silencio entre los dos.

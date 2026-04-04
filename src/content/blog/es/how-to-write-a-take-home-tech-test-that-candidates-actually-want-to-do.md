---
title: "Cómo escribir una prueba técnica para casa que los candidatos realmente quieran hacer"
description: "La mayoría de las pruebas técnicas fallan por fricción en el setup, enunciados poco claros o por no respetar el tiempo de la gente. Así es como diseñé una por la que los candidatos nos dan las gracias."
publishDate: 2026-04-20
tags: ["gestión-de-ingeniería", "contratación", "react-native"]
locale: es
heroImage: "/images/blog/take-home-tech-test-design.jpg"
heroAlt: "Diseñando una prueba técnica para casa para ingenieros de software"
hiringUrl: "/hiring/"
hiringText: "We're looking for React Native engineers to join the Mobile Platform team at Hargreaves Lansdown."
campaign: "take-home-tech-test"
---

## La prueba que nadie termina

La mayoría de las pruebas técnicas fallan antes de que el candidato escriba una sola línea de código.

Clonan el repo. Ejecutan `npm install`. Algo se rompe.

**45 minutos después**, están debuggeando un mismatch de versión de Ruby, un CocoaPod que falta o una versión de Node que no funciona con el bundler. Para cuando la app arranca, ya quemaron su paciencia y la mitad de su noche.

Los mejores candidatos, los que realmente quieres contratar, son los que más probabilidades tienen de irse. Tienen opciones. Van a elegir la empresa que respete su tiempo.

> 🚩 **Nos pasó.** Nuestro primer candidato pasó dos horas peleando con problemas de versión de Ruby antes de escribir una línea de código de la aplicación. Su Ruby del sistema era muy viejo. Actualizó a Ruby 4, que rompió el bundler. Bajó a 3.3, pero el bundler vendorizado era incompatible. Cada paso fue un ida y vuelta de mensajes. Dos horas. Cero líneas de código de aplicación.

Esa experiencia cambió cómo pensaba sobre la prueba. Las preguntas estaban bien. **La experiencia de desarrollo era el problema.**

## Trata la prueba como un producto

Este se convirtió en mi principio rector. La prueba técnica es la primera interacción real que un candidato tiene con tu cultura de ingeniería. Todo lo que experimenta le dice algo sobre ti.

Si el setup está roto → piensan que tu codebase está roto.
Si el enunciado es vago → piensan que tus specs son vagas.
Si el timeline es irreal → piensan que tus deadlines son irreales.

Empecé a tratar la prueba de la misma forma que trataría un producto:

| Pensamiento de producto | Aplicado a la prueba técnica |
|---|---|
| Investigación de usuarios | ¿Qué frustra a los candidatos de las pruebas técnicas? |
| Requisitos claros | Un brief detallado con wireframes y reglas |
| Experiencia de desarrollo | Proyecto starter, script de setup, path aliases |
| Documentación | Guías enlazadas para cada pregunta que puedan tener |
| Mejora continua | Actualizar después de cada ronda según lo que salió mal |

Después del incidente con Ruby, añadí un script de setup, fijé la versión de Ruby, commiteé un Gemfile.lock con un bundler moderno y añadí una sección de troubleshooting al README.

**El siguiente candidato estaba codeando en menos de dos minutos.**

## El script de setup

La mejora más grande: un `setup.sh` que se encarga de todo.

```bash
./setup.sh
```

Un solo comando. Lo que hace:

- ✅ Comprueba la versión de Node (instala via nvm si hace falta)
- ✅ Comprueba la versión de Ruby (soporta rbenv, rvm y asdf)
- ✅ Comprueba Xcode CLI tools y CocoaPods
- ✅ Ejecuta `yarn install`
- ✅ Ejecuta `bundle install` y `pod install`
- ✅ Te dice exactamente qué arreglar si algo falla

La decisión de diseño clave: el script **pregunta antes de instalar cualquier cosa**. Detecta lo que el candidato ya tiene y trabaja con eso. Un candidato que usa rbenv recibe rbenv. Un candidato que usa rvm recibe rvm. Su entorno se respeta, no se sobreescribe.

> 💡 **Tip:** Fija las versiones en el repo: `.ruby-version`, `.nvmrc`, `Gemfile.lock` con un bundler moderno. Después escribe un script de setup que las lea. Cada minuto que un candidato pasa en el setup es un minuto que no está escribiendo código.

## El proyecto starter

Le doy a los candidatos un proyecto completamente configurado. No un repo vacío. Una app funcionando.

| Incluido | Por qué |
|---|---|
| TypeScript en modo estricto | Sin ambigüedad sobre las expectativas del lenguaje |
| React Navigation v7 con params tipados | La navegación es boilerplate, no una prueba de habilidad |
| Jest + React Native Testing Library | Configurado con mocks de módulos nativos, listo para escribir tests |
| ESLint + Prettier | Estilo de código consistente desde la primera línea |
| Path aliases (`@app/*`) | Nada de cadenas de imports `../../../` |
| Wrapper de render custom para tests | NavigationContainer incluido, solo renderiza y haz assert |
| Tres pantallas placeholder | "Replace me": punto de partida claro |
| Un smoke test que pasa | Prueba de que el setup funciona antes de que cambien nada |

**Todo compila. Todo funciona. El smoke test pasa.**

No estoy evaluando si alguien puede configurar un bundler o debuggear un path alias de TypeScript. Estoy evaluando si pueden **construir código de aplicación**. El proyecto starter elimina cada obstáculo entre "cloné el repo" y "estoy escribiendo mi primer componente."

Algunos candidatos arrancan de cero igualmente. Está bien. El starter es opcional. Pero la mayoría lo usa, y el resultado es el mismo: en vez de pasar su primera hora peleando con configuración, la pasan tomando decisiones de arquitectura.

## El brief: claro en el qué, no en el cómo

Algunas pruebas técnicas especifican exactamente cómo construir las cosas: qué librería de state management, qué estructura de carpetas, qué cliente de API. Ese enfoque funciona cuando quieres consistencia. Pero para nosotros, esas decisiones son la parte más interesante de la entrega.

Nuestro brief toma un enfoque diferente. Explica en detalle **qué** tiene que hacer la app, y no dice nada sobre el **cómo**.

- **Wireframes de pantallas** muestran los datos y las interacciones (layouts ASCII, no diseños pixel-perfect)
- **Una tabla de requisitos** detalla las reglas (máximo 6 items, añadir desde el detalle, eliminar desde la lista)
- **Una tabla de requisitos técnicos** lista los no negociables (React Native, TypeScript, React Navigation)

Lo que falta deliberadamente: prescripciones de arquitectura. El candidato elige el state management, la estructura de carpetas, el cliente de API, la estrategia de testing.

Un candidato que elige Redux Toolkit me dice algo diferente que uno que elige Zustand. Ninguno está mal. *Los dos son interesantes.* Y el razonamiento detrás de la elección es sobre lo que se construye la conversación del walkthrough.

> 💡 **Tip:** Si tu brief especifica la arquitectura, estás evaluando cumplimiento, no ingeniería. Los mejores briefs describen el *qué* en detalle y dejan el *cómo* completamente abierto.

## Respetar el tiempo de la gente

**Los candidatos tienen 7 días. El trabajo debería llevar de 4 a 6 horas.**

Lo decimos explícitamente. En el brief y en la guía de entrega. Dos veces, porque la gente se lo pierde la primera.

7 días da flexibilidad. Algunos trabajan durante un fin de semana. Algunos hacen una hora cada noche. Algunos bloquean un sábado por la mañana. El timeline respeta que los candidatos tienen trabajos, familias y una vida fuera del proceso de entrevistas.

La estimación de 4 a 6 horas es honesta. Yo mismo hice la prueba para verificarlo. Un desarrollador competente de React Native puede construir las tres pantallas con state management, integración de API, tests básicos y un README en ese tiempo. Algunos eligen invertir más. Es su elección, no nuestra expectativa.

Si un candidato necesita más tiempo, se lo damos. Sin preguntas.

> ℹ️ Quedarse callado y entregar tres días tarde sin explicación es una señal diferente a mandar un mensaje diciendo "necesito un par de días más." La comunicación importa.

## Diles qué estás buscando

Al principio, un candidato nos contó que había pasado una hora estilizando botones porque asumió que el pulido visual nos importaba. No era así. Estábamos mirando arquitectura y testing. Esa hora se desperdició porque no le habíamos dicho qué contaba.

Ahora somos explícitos:

```
✅ Cómo piensas la arquitectura y la organización del código
✅ Cómo descompones un problema en componentes y flujos de datos
✅ Cómo tomas y justificas decisiones técnicas
✅ Cómo manejas casos borde y estados de error
✅ Qué tan bien conoces tu propio código

❌ NO estamos evaluando diseño visual ni UI pixel-perfect
❌ NO esperamos una app production-ready en una prueba para casa
```

Cuando los candidatos saben que nos importa más la arquitectura y los trade-offs que el styling, distribuyen su tiempo acorde. **Mejor señal para nosotros. Mejor experiencia para ellos.**

También les contamos de entrada que podemos usar herramientas de IA como pre-check, pero que cada entrega es revisada y puntuada manualmente por el panel de contratación. La transparencia genera confianza.

## El walkthrough no es un interrogatorio

El walkthrough es una conversación. El candidato lidera los primeros 10 minutos:

1. **Demo de la app**: recorrer todas las pantallas, mostrar las features funcionando
2. **Ejecutar los tests**: mostrarlos pasando en vivo
3. **Recorrer el código**: explicar la estructura y las decisiones

Después de la presentación, hacemos preguntas. Pero el encuadre importa. Decimos:

> *"No te preocupes si algo no funciona como esperabas durante la demo. Pasa. Si pasa, cuéntame qué piensas que falló y cómo lo arreglarías. Eso me dice más que una demo perfecta."*

No es solo ser amable. Ver a alguien diagnosticar un bug en su propio código es una de las señales más fuertes que puedes obtener. Un candidato que dice *"Ah, creo que el dependency array del useEffect está mal aquí"* te está mostrando exactamente cómo trabaja.

Una demo perfecta no te muestra nada excepto que ensayó.

## La documentación como feature de primera clase

La prueba viene con documentación de verdad. No solo un README. Un conjunto de archivos markdown enlazados:

| Documento | Qué cubre |
|---|---|
| **Brief de la prueba** | Requisitos, wireframes de pantallas, reglas del ejercicio, requisitos técnicos |
| **Guía de API** | Endpoints, opciones de GraphQL vs REST, recomendaciones de clientes |
| **Proyecto Starter** | Qué incluye, estructura del proyecto, comandos disponibles, setup de testing |
| **Entrega y Walkthrough** | Cómo entregar, qué pasa en el walkthrough, tips |
| **Stretch Goals** | Extras opcionales y qué demuestra cada uno |

Cada pregunta que un candidato pueda tener está respondida antes de que necesite hacerla. No se trata solo de ser útil. Se trata de **eliminar la ambigüedad como variable**. No quiero evaluar qué tan bien alguien interpreta un brief vago. Quiero evaluar cómo construyen software cuando los requisitos están claros.

## Qué cambiaría la próxima vez

La prueba no es perfecta. Esto es lo que tengo en mi lista:

- **Un vídeo walkthrough del proyecto starter.** Un Loom de 3 minutos mostrando la estructura de carpetas, cómo ejecutarlo y por dónde empezar. Algunas personas aprenden mejor con vídeo que con docs.
- **Un archivo `.env.example`.** Aunque la prueba usa una API pública sin keys, establece el patrón correcto.
- **Probar el setup en una máquina limpia.** Construí la prueba en mi propio portátil con años de herramientas instaladas. Cada suposición sobre "todos tienen esto instalado" estaba equivocada. El primer candidato lo demostró.

La estructura está bien igualmente. Script de setup. Proyecto starter. Brief claro. Timeline honesto. Documentación de verdad. Criterios de evaluación transparentes.

Si estás diseñando una prueba técnica y los candidatos siguen abandonando, no mires las preguntas primero. Mira la experiencia de desarrollo. **La mejor prueba técnica es una donde el candidato pasa el 100% de su tiempo en lo que realmente estás evaluando, y 0% en todo lo demás.**

*Este es el último post de una serie sobre construir un proceso de contratación desde cero. Los posts anteriores cubren [por qué rediseñé la prueba](/es/blog/why-i-redesigned-our-react-native-tech-test-in-my-first-week/), [consejos para candidatos que la hacen](/es/blog/how-to-pass-a-react-native-tech-test/) y [cómo funciona la puntuación](/es/blog/how-i-designed-a-tech-test-scorecard-that-works-from-graduate-to-senior/).*
